import express from 'express';
import path from 'path';
import fs from 'fs';
import { loadConfig, saveConfig } from '../config/config-manager.js';
import { renderVideo } from '../render/video-renderer.js';
import { PROJECTS_DIR } from '../project/workspace.js';
import cors from 'cors';

/** Keys that must never leave the process over HTTP. */
const SECRET_CONFIG_KEYS = ['apiKey', 'apiToken', 'authToken'];

/** A copy of the config with every secret replaced by a presence flag. */
function redactConfig(config) {
  const safe = { ...config };
  for (const key of SECRET_CONFIG_KEYS) {
    if (key in safe) safe[key] = safe[key] ? '<set>' : '';
  }
  return safe;
}

/** Escapes a user-supplied string so it matches literally inside a RegExp. */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function startWebServer(options = {}) {
  const bootConfig = loadConfig();
  const port = options.port || bootConfig.port || 3000;
  // The editor is a local tool holding an API key and write access to the project.
  // Binding to every interface would publish both to the local network.
  const host = options.host || process.env.ANYMOTION_HOST || '127.0.0.1';
  const app = express();

  // Same reasoning as the bind address: only pages served from this machine may talk
  // to the API. `cors()` with no options echoes any Origin, which lets any site the
  // user has open drive the editor while the server runs.
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl, same-origin fetches, file://
      const ok = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
      cb(ok ? null : new Error('Blocked by CORS: editor API is local-only'), ok);
    }
  }));
  app.use(express.json({ limit: '10mb' }));

  const editorDir = path.resolve(process.cwd(), 'web-editor');
  app.use(express.static(editorDir));

  // Serve exports directory statically so OpenCut can download rendered videos
  const exportsDir = path.resolve(process.cwd(), bootConfig.outputDir || './exports');
  app.use('/exports', express.static(exportsDir));

  /**
   * The active project file, re-read on every request.
   *
   * Reading it once at boot was a real bug: switching projects in the editor updates
   * the config on disk, but the write routes kept the path captured at startup and
   * saved into the *previous* project.
   */
  function activeProjectPath() {
    const current = loadConfig();
    return path.resolve(process.cwd(), current.projectFile || './index.html');
  }

  // Serve active project assets (script.js, style.css, fonts, etc.) under /project route
  app.use('/project', (req, res, next) => {
    try {
      const currentConfig = loadConfig();
      const projPath = path.resolve(process.cwd(), currentConfig.projectFile || './index.html');
      const projDir = path.dirname(projPath);
      express.static(projDir)(req, res, next);
    } catch (e) {
      next();
    }
  });

  // ── Live reload ────────────────────────────────────────────────────────────
  //
  // The agent writes files from the CLI; the editor is a browser tab that has no idea
  // this happened. Before this, finishing a build meant telling the user "now go press
  // F5", which is exactly the kind of seam that makes a tool feel unfinished.
  //
  // Server-Sent Events rather than a WebSocket: reload is strictly one-directional
  // (server tells browser "the file moved"), SSE reconnects on its own, and it needs no
  // extra dependency — `ws` would be a package added to send a single string.
  const sseClients = new Set();
  let watcher = null;
  let watchedDir = null;
  let debounce = null;

  /** Tells every open editor tab to reload. `reason` shows up in the toast. */
  function broadcast(reason) {
    const payload = `event: reload\ndata: ${JSON.stringify({ reason, at: Date.now() })}\n\n`;
    sseClients.forEach(res => {
      try { res.write(payload); } catch (_) { sseClients.delete(res); }
    });
  }

  /**
   * Watches whichever folder currently holds the project. The path changes when the
   * user switches projects, so the watcher is torn down and rebuilt rather than being
   * set up once at boot.
   */
  function watchProject() {
    const current = loadConfig();
    const projectPath = path.resolve(process.cwd(), current.projectFile || './index.html');
    const dir = path.dirname(projectPath);
    if (dir === watchedDir) return;

    if (watcher) { try { watcher.close(); } catch (_) {} }
    watchedDir = dir;
    if (!fs.existsSync(dir)) { watcher = null; return; }

    try {
      watcher = fs.watch(dir, { recursive: true }, (_evt, filename) => {
        if (!filename) return;
        // Editor saves come back through /api/save-raw-html and would otherwise bounce
        // straight back as a reload, wiping the user's in-progress selection.
        if (/\.(tmp|swp|partial)$/i.test(filename)) return;
        // A build writes several files in a burst; one reload at the end is enough.
        clearTimeout(debounce);
        debounce = setTimeout(() => broadcast(String(filename).replace(/\\/g, '/')), 350);
      });
    } catch (_) {
      // Recursive watch is unsupported on some platforms — live reload degrades to the
      // manual button rather than taking the server down with it.
      watcher = null;
    }
  }

  app.get('/api/live', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    sseClients.add(res);
    watchProject();

    // Proxies and browsers drop a stream that goes quiet; a comment frame is ignored by
    // EventSource but keeps the socket warm.
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 25_000);

    req.on('close', () => {
      clearInterval(ping);
      sseClients.delete(res);
    });
  });

  /** Lets the CLI force a reload the moment a build finishes, without waiting on fs.watch. */
  app.post('/api/live/reload', (req, res) => {
    watchProject();
    broadcast((req.body && req.body.reason) || 'project updated');
    res.json({ success: true, clients: sseClients.size });
  });

  // Serve current project file
  app.get('/project/index.html', (req, res) => {
    const currentConfig = loadConfig();
    const projectPath = path.resolve(process.cwd(), currentConfig.projectFile || './index.html');
    // Cheap place to notice the active project changed under us.
    watchProject();
    if (fs.existsSync(projectPath)) {
      res.sendFile(projectPath);
    } else {
      res.status(404).send('Project file not found');
    }
  });

  // GET /api/projects
  app.get('/api/projects', (req, res) => {
    try {
      const currentConfig = loadConfig();
      const currentProjectPath = path.resolve(process.cwd(), currentConfig.projectFile || './index.html');
      
      // Assume projects are stored in the parent directory of the current project
      const projectsDir = path.dirname(path.dirname(currentProjectPath));
      if (!fs.existsSync(projectsDir)) {
        return res.json({ success: true, projects: [] });
      }

      const projects = [];
      const folders = fs.readdirSync(projectsDir, { withFileTypes: true });

      folders.forEach(dirent => {
        if (!dirent.isDirectory()) return;
        const projDir = path.join(projectsDir, dirent.name);
        const indexPath = path.join(projDir, 'index.html');
        
        if (fs.existsSync(indexPath)) {
          const stat = fs.statSync(indexPath);
          let goal = '';
          const pJsonPath = path.join(projDir, 'project.json');
          if (fs.existsSync(pJsonPath)) {
            try {
              const pData = JSON.parse(fs.readFileSync(pJsonPath, 'utf8'));
              goal = pData.goal || '';
            } catch (_) {}
          }
          projects.push({
            name: dirent.name,
            path: path.relative(process.cwd(), indexPath).replace(/\\/g, '/'),
            modifiedAt: stat.mtimeMs,
            goal: goal
          });
        }
      });
      
      projects.sort((a, b) => b.modifiedAt - a.modifiedAt);
      res.json({ success: true, projects, activeProject: path.relative(process.cwd(), currentProjectPath).replace(/\\/g, '/') });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/project/active
  app.post('/api/project/active', (req, res) => {
    try {
      const { projectPath } = req.body;
      if (!projectPath) {
        return res.status(400).json({ success: false, error: 'projectPath is required' });
      }
      
      const fullPath = path.resolve(process.cwd(), projectPath);

      // The body of this request decides which file every write route then targets, so
      // an unchecked path here turns the editor into a write-anywhere primitive.
      // Only the workspace and the current working directory are legitimate homes for
      // a project.
      const allowedRoots = [process.cwd(), PROJECTS_DIR].map(r => path.resolve(r));
      const contained = allowedRoots.some(root => {
        const rel = path.relative(root, fullPath);
        return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
      });
      if (!contained) {
        return res.status(400).json({
          success: false,
          error: 'projectPath must live inside the workspace or the current folder'
        });
      }

      if (path.basename(fullPath).toLowerCase() !== 'index.html') {
        return res.status(400).json({ success: false, error: 'projectPath must point at an index.html' });
      }

      if (!fs.existsSync(fullPath)) {
         return res.status(404).json({ success: false, error: 'Project not found' });
      }

      const currentConfig = loadConfig();
      currentConfig.projectFile = projectPath;
      saveConfig(currentConfig);
      
      watchProject();
      broadcast('Active project changed');
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET Config — secrets are stripped. The editor only needs to know a key exists,
  // and this endpoint is reachable by anything running in the browser.
  app.get('/api/config', (req, res) => {
    res.json(redactConfig(loadConfig()));
  });

  // GET Status
  app.get('/api/status', (req, res) => {
    res.json({ success: true, service: 'anymotion-agent', version: '1.0.0' });
  });

  // POST Update Config
  app.post('/api/config', (req, res) => {
    try {
      const updated = saveConfig(req.body);
      res.json({ success: true, config: redactConfig(updated) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST Save Full Raw HTML Snapshot (Full Undo/Redo Engine Endpoint)
  app.post('/api/save-raw-html', (req, res) => {
    try {
      const { fullHtml } = req.body;
      const projectPath = activeProjectPath();

      if (!fullHtml) {
        return res.status(400).json({ success: false, error: 'fullHtml is required' });
      }

      fs.writeFileSync(projectPath, fullHtml, 'utf-8');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST Delete Layer from Project
  app.post('/api/delete-layer', (req, res) => {
    try {
      const { layerId } = req.body;
      const projectPath = activeProjectPath();

      if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: 'Project file not found' });
      }

      if (!layerId) {
        return res.status(400).json({ success: false, error: 'Layer ID is required' });
      }

      let content = fs.readFileSync(projectPath, 'utf-8');

      // An id is interpolated straight into a pattern, so it has to be escaped: an id
      // containing `(` or `*` would otherwise either throw or match far more than the
      // one element the user asked to delete.
      const id = escapeRegExp(layerId);
      const elementRegex = new RegExp(`<([a-z0-9]+)[^>]*id="${id}"[^>]*>(.*?)</\\1>`, 'gis');
      const selfClosingRegex = new RegExp(`<([a-z0-9]+)[^>]*id="${id}"[^>]*/>`, 'gis');

      content = content.replace(elementRegex, '').replace(selfClosingRegex, '');

      fs.writeFileSync(projectPath, content, 'utf-8');
      res.json({ success: true, deletedLayerId: layerId });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST Update Project Elements
  app.post('/api/update-project', (req, res) => {
    try {
      const { 
        layerId,
        animPreset,
        badgeText, 
        title, 
        subtitle, 
        ctaText, 
        fontFamily, 
        accentColor, 
        bgColor, 
        glowIntensity, 
        cardRadius, 
        duration 
      } = req.body;
      
      const projectPath = activeProjectPath();

      if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: 'Project file not found' });
      }

      let content = fs.readFileSync(projectPath, 'utf-8');

      if (layerId && animPreset) {
        const id = escapeRegExp(layerId);
        const layerTagRegex = new RegExp(`(<[a-z0-9]+[^>]*id="${id}"[^>]*)`, 'i');
        if (content.match(layerTagRegex)) {
          if (content.includes(`id="${layerId}"`) && content.includes(`data-anim=`)) {
            content = content.replace(new RegExp(`(id="${id}"[^>]*data-anim=")[^"]*(")`, 'i'), `$1${animPreset}$2`);
          } else {
            content = content.replace(layerTagRegex, `$1 data-anim="${animPreset}"`);
          }
        }
      }

      if (badgeText) {
        content = content.replace(/(<div[^>]*id="badge"[^>]*>)(.*?)(<\/div>)/gs, `$1${badgeText}$3`);
      }
      if (title) {
        content = content.replace(/(<h1[^>]*id="motion-title"[^>]*>)(.*?)(<\/h1>)/gs, `$1${title}$3`);
      }
      if (subtitle) {
        content = content.replace(/(<p[^>]*id="motion-subtitle"[^>]*>)(.*?)(<\/p>)/gs, `$1${subtitle}$3`);
      }
      if (ctaText) {
        content = content.replace(/(<button[^>]*id="motion-cta"[^>]*>)(.*?)(<\/button>)/gs, (match, p1, p2, p3) => {
          return `${p1}<span>${ctaText}</span>${p3}`;
        });
      }

      if (fontFamily) {
        content = content.replace(/font-family:\s*[^;]+;/g, `font-family: '${fontFamily}', sans-serif;`);
      }
      if (accentColor) {
        content = content.replace(/--accent-color:\s*[^;]+;/g, `--accent-color: ${accentColor};`);
        content = content.replace(/--accent-glow:\s*[^;]+;/g, `--accent-glow: ${accentColor}66;`);
      }
      if (bgColor) {
        content = content.replace(/--bg-color:\s*[^;]+;/g, `--bg-color: ${bgColor};`);
      }
      if (cardRadius) {
        content = content.replace(/border-radius:\s*\d+px;/g, `border-radius: ${cardRadius}px;`);
      }
      if (glowIntensity) {
        content = content.replace(/filter:\s*blur\(\d+px\);/g, `filter: blur(${glowIntensity}px);`);
      }

      if (duration) {
        content = content.replace(/window\.DURATION\s*=\s*[\d\.]+;/g, `window.DURATION = ${parseFloat(duration).toFixed(1)};`);
      }

      fs.writeFileSync(projectPath, content, 'utf-8');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST Render Video
  app.post('/api/export', async (req, res) => {
    try {
      const { resolution = '2k', fps = 60 } = req.body;
      console.log(`\n🚀 Web Editor Export Request Received: Resolution=${resolution}, FPS=${fps}`);
      
      const outputPath = await renderVideo({ resolution, fps });
      const filename = path.basename(outputPath);
      const downloadUrl = `http://localhost:${port}/exports/${filename}`;
      
      res.json({ success: true, outputPath, downloadUrl });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      watchProject();
      console.log(`\n==================================================`);
      console.log(`🎬 ANYMOTION STUDIO WEB EDITOR IS LIVE!`);
      console.log(`👉 Open Browser: http://localhost:${port}`);
      console.log(`   Live reload is on — the editor refreshes itself when the agent writes.`);
      console.log(`==================================================\n`);
      resolve(server);
    });

    // An open SSE stream is a live socket, so close() would otherwise hang forever
    // waiting for connections that are designed never to end.
    const nativeClose = server.close.bind(server);
    server.close = (cb) => {
      clearTimeout(debounce);
      if (watcher) { try { watcher.close(); } catch (_) {} watcher = null; }
      sseClients.forEach(res => { try { res.end(); } catch (_) {} });
      sseClients.clear();
      return nativeClose(cb);
    };

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port already occupied — the editor is already running from a previous
        // build or session. Reuse it silently instead of crashing.
        console.log(`\n⚡ Editor already running on port ${port}. Reusing existing server.\n`);
        // Return a dummy object with a close() noop so callers don't break.
        resolve({ alreadyRunning: true, close: () => {} });
      } else {
        reject(err);
      }
    });
  });
}
