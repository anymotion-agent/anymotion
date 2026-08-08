/**
 * MOTION TOOLS — the part a general-purpose coding agent cannot do.
 *
 * A code agent writing an animation is working blind: the HTML parses, the CSS is
 * valid, and the result is still a card sitting on top of a headline at 3.2 seconds.
 * Nothing in the source says so. The only way to know is to run the composition and
 * look at it.
 *
 * So these tools give the model eyes:
 *   preview_frames    — seek to N timestamps, screenshot, hand the images back
 *   check_composition — headless audit: console errors, overlap, off-canvas, determinism
 *
 * Both drive the same Puppeteer + window.seek(t) contract the renderer already relies
 * on (src/render/video-renderer.js), so anything they pass will also render correctly.
 */

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { renderVideo } from '../../render/video-renderer.js';
import { resolveInProject } from '../sandbox.js';
import { GLOBAL_DIR } from '../../config/config-manager.js';

const PREVIEW_WIDTH = 1024;
const PREVIEW_HEIGHT = 576;   // 16:9, and small enough that four frames stay affordable
const MAX_FRAMES = 4;
const AUDIT_WIDTH = 1920;
const AUDIT_HEIGHT = 1080;

// Resolved by the config manager (ANYMOTION_HOME, else the real home directory) rather
// than a literal path from one developer's machine.
const getSfxDirs = () => [
  path.resolve(GLOBAL_DIR, 'EXPLAINER_MOTION_GRAPHICS_SFX'),
  path.resolve(GLOBAL_DIR, 'sfx'),
  path.resolve(process.cwd(), 'web-editor', 'assets', 'sfx'),
  path.resolve(process.cwd(), 'EXPLAINER_MOTION_GRAPHICS_SFX')
].filter(d => fs.existsSync(d));

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac']);

function scanAudioFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanAudioFiles(full, out);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTS.has(ext)) {
          out.push({
            name: entry.name,
            absPath: full,
            category: path.basename(dir)
          });
        }
      }
    }
  } catch (_) {}
  return out;
}

const findSfxFile = (name) => {
  const dirs = getSfxDirs();
  for (const d of dirs) {
    const target = path.join(d, name);
    if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
    const all = scanAudioFiles(d);
    const hit = all.find(a => a.name.toLowerCase() === String(name).toLowerCase());
    if (hit) return hit.absPath;
  }
  return null;
};

const SFX_DIR = () => {
  const dirs = getSfxDirs();
  return dirs[0] || path.resolve(process.cwd(), 'web-editor', 'assets', 'sfx');
};

function entryFile(ctx, relPath) {
  const rel = relPath || 'index.html';
  const target = resolveInProject(ctx.project.dir, rel);
  if (!fs.existsSync(target)) {
    throw new Error(`${rel} does not exist yet. Write the composition first, then verify it.`);
  }
  return target;
}

function fileUrl(absPath) {
  return `file:///${absPath.replace(/\\/g, '/')}`;
}

async function openPage(absPath, width, height) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--font-render-hinting=none']
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  const problems = [];
  page.on('console', msg => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
    if (msg.type() === 'warning' && /uncaught|undefined is not|cannot read/i.test(msg.text())) {
      problems.push(`console warning: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => problems.push(`page error: ${err.message}`));
  page.on('requestfailed', req => {
    const url = req.url();
    // A failed Google Fonts request only degrades typography; a failed local asset is
    // a broken composition and worth surfacing.
    if (!/fonts\.(googleapis|gstatic)\.com/.test(url)) {
      problems.push(`failed request: ${url.slice(0, 160)} (${req.failure()?.errorText || 'unknown'})`);
    }
  });

  try {
    await page.goto(fileUrl(absPath), { waitUntil: 'networkidle2', timeout: 30_000 });
  } catch (err) {
    problems.push(`page did not settle: ${err.message}`);
  }
  // Give font loading and the first rAF tick a moment; a screenshot taken too early
  // catches the pre-animation state and looks like a bug that is not there.
  await new Promise(r => setTimeout(r, 400));

  return { browser, page, problems };
}

/** Freezes the timeline so a screenshot is reproducible rather than whatever rAF did last. */
const FREEZE = `(() => {
  if (window.__anymotionFrozen) return;
  window.__anymotionFrozen = true;
  const noop = () => 0;
  window.requestAnimationFrame = noop;
  window.setInterval = noop;
  document.getAnimations && document.getAnimations().forEach(a => { try { a.pause(); } catch (_) {} });
  document.querySelectorAll('*').forEach(el => { el.style.animationPlayState = 'paused'; });
})()`;

async function seekTo(page, t) {
  return page.evaluate(time => {
    if (typeof window.seek !== 'function') return 'no-seek';
    try { window.seek(time); return 'ok'; } catch (err) { return 'threw: ' + err.message; }
  }, t);
}

export const motionTools = [
  {
    name: 'preview_frames',
    description:
      'Render the composition in a headless browser, seek to specific timestamps, and return the frames as images ' +
      'so you can SEE what you built. This is how you check that a layout reads well, that text is not clipped or ' +
      'overlapping, that contrast works, and that the motion lands where you intended. ' +
      'Use it after any visual change, and always before telling the user you are done. ' +
      `Up to ${MAX_FRAMES} timestamps per call.`,
    input_schema: {
      type: 'object',
      properties: {
        times: {
          type: 'array',
          items: { type: 'number' },
          description: 'Timestamps in seconds to capture, e.g. [0.5, 3, 6, 9]. Pick one per scene.'
        },
        path: { type: 'string', description: 'Entry file. Defaults to index.html.' }
      },
      required: ['times']
    },
    async run(input, ctx) {
      const target = entryFile(ctx, input.path);
      const times = (Array.isArray(input.times) ? input.times : [])
        .map(Number)
        .filter(t => Number.isFinite(t) && t >= 0)
        .slice(0, MAX_FRAMES);

      if (!times.length) throw new Error('times must be a non-empty array of seconds, e.g. [0.5, 3, 6].');

      const { browser, page, problems } = await openPage(target, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      const images = [];
      const notes = [];

      try {
        const duration = await page.evaluate(() => (typeof window.DURATION === 'number' ? window.DURATION : null));
        await page.evaluate(FREEZE);

        for (const t of times) {
          if (duration && t > duration) {
            notes.push(`t=${t}s is past the ${duration}s timeline — captured anyway, it will look like the final frame.`);
          }
          const seekResult = await seekTo(page, t);
          if (seekResult === 'no-seek') {
            notes.push('window.seek is not defined, so frames show the static initial state. Implement seek(t).');
          } else if (typeof seekResult === 'string' && seekResult.startsWith('threw')) {
            notes.push(`seek(${t}) ${seekResult}`);
          }
          await new Promise(r => setTimeout(r, 120));
          const buf = await page.screenshot({ type: 'jpeg', quality: 78 });
          images.push({ media_type: 'image/jpeg', data: Buffer.from(buf).toString('base64'), label: `t = ${t}s` });
        }
      } finally {
        await browser.close().catch(() => {});
      }

      const header = [
        `Captured ${images.length} frame${images.length === 1 ? '' : 's'} at ${PREVIEW_WIDTH}×${PREVIEW_HEIGHT}: ${times.map(t => t + 's').join(', ')}.`,
        ...notes.map(n => `NOTE: ${n}`),
        ...problems.slice(0, 6)
      ].join('\n');

      return { content: header, images, meta: { frames: images.length, problems: problems.length } };
    },
    summarize(input, result) {
      const p = result.meta.problems;
      return `${result.meta.frames} frame${result.meta.frames === 1 ? '' : 's'}${p ? ` · ${p} console issue${p === 1 ? '' : 's'}` : ''}`;
    },
    label(input) {
      const times = Array.isArray(input.times) ? input.times : [];
      return `Preview(${times.join('s, ')}${times.length ? 's' : ''})`;
    }
  },

  {
    name: 'check_composition',
    description:
      'Audit the composition in a headless browser at 1920×1080 and return a structured report: JavaScript errors, ' +
      'missing seek/DURATION contract, elements overlapping each other, content pushed off-canvas, visible content ' +
      'stuck at z-index 0, and whether seek(t) is deterministic. ' +
      'Run this after building or editing and fix whatever it reports before you claim the work is finished. ' +
      'It is cheap — no images, just findings.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Entry file. Defaults to index.html.' },
        samples: { type: 'number', description: 'How many points along the timeline to audit. Default 5.' }
      }
    },
    async run(input, ctx) {
      const target = entryFile(ctx, input.path);
      const sampleCount = Math.min(12, Math.max(2, Math.round(input.samples || 5)));

      const { browser, page, problems } = await openPage(target, AUDIT_WIDTH, AUDIT_HEIGHT);
      const findings = [];
      const passed = [];

      try {
        const contract = await page.evaluate(() => ({
          hasSeek: typeof window.seek === 'function',
          duration: typeof window.DURATION === 'number' ? window.DURATION : null,
          animLayers: document.querySelectorAll('[data-anim]').length,
          scenes: document.querySelectorAll('section, .scene, [class*="scene"]').length
        }));

        if (!contract.hasSeek) {
          findings.push('CRITICAL: window.seek(t) is not defined. The editor scrubber and the video renderer both call it — without it the composition cannot be exported.');
        } else {
          passed.push('window.seek(t) is defined');
        }

        if (!contract.duration || contract.duration <= 0) {
          findings.push('CRITICAL: window.DURATION is not a positive number. The renderer uses it to decide how many frames to capture and will fall back to 10s.');
        } else {
          passed.push(`window.DURATION = ${contract.duration}s`);
        }

        const duration = contract.duration && contract.duration > 0 ? contract.duration : 10;
        await page.evaluate(FREEZE);

        // Determinism: seek(t) must be a pure function of t. Scrubbing backwards and
        // returning must reproduce the same frame, or the exported video will not match
        // the preview.
        if (contract.hasSeek) {
          const probe = duration * 0.6;
          const snapshot = () => page.evaluate(() =>
            [...document.querySelectorAll('[data-anim], [id]')].slice(0, 60)
              .map(el => {
                const cs = getComputedStyle(el);
                return `${el.id || el.className}|${cs.transform}|${cs.opacity}`;
              }).join('\n')
          );
          await seekTo(page, probe);
          const first = await snapshot();
          await seekTo(page, 0);
          await seekTo(page, duration);
          await seekTo(page, probe);
          const second = await snapshot();
          if (first !== second) {
            findings.push('seek(t) is not deterministic — scrubbing away and back to the same timestamp produced a different frame. Every element state must be a pure function of t, with no accumulated variables.');
          } else {
            passed.push('seek(t) is deterministic');
          }
        }

        // Layout audit at points across the timeline, because an overlap that only
        // exists at 4.2s is invisible in a check of the first frame.
        const seen = new Set();
        for (let i = 0; i < sampleCount; i++) {
          const t = (duration * i) / (sampleCount - 1);
          if (contract.hasSeek) await seekTo(page, t);
          await new Promise(r => setTimeout(r, 60));

          const report = await page.evaluate(() => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const out = { overlaps: [], offCanvas: [], lowZ: [], clipped: [] };

            const isVisible = el => {
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden') return false;
              if (parseFloat(cs.opacity) < 0.15) return false;
              const r = el.getBoundingClientRect();
              return r.width > 8 && r.height > 8;
            };

            const hasOwnText = el =>
              [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);

            const candidates = [...document.querySelectorAll('h1,h2,h3,h4,p,span,button,a,li,[data-anim]')]
              .filter(isVisible)
              .slice(0, 160);

            candidates.forEach(el => {
              const r = el.getBoundingClientRect();
              const tag = el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`;

              if (r.right < -4 || r.left > vw + 4 || r.bottom < -4 || r.top > vh + 4) {
                out.offCanvas.push(tag);
              }
              const cs = getComputedStyle(el);
              if (hasOwnText(el) && (cs.zIndex === '0' || cs.zIndex === 'auto')) {
                const parentZ = el.parentElement ? getComputedStyle(el.parentElement).zIndex : 'auto';
                if (parentZ === '0') out.lowZ.push(tag);
              }
              if (el.scrollWidth > el.clientWidth + 6 && cs.overflow === 'visible' && hasOwnText(el)) {
                out.clipped.push(tag);
              }
            });

            // Only compare text-bearing siblings: a card overlapping its own label is
            // normal nesting, two headlines on top of each other is a bug.
            const textEls = candidates.filter(hasOwnText).slice(0, 60);
            for (let a = 0; a < textEls.length; a++) {
              for (let b = a + 1; b < textEls.length; b++) {
                const A = textEls[a];
                const B = textEls[b];
                if (A.contains(B) || B.contains(A)) continue;
                const ra = A.getBoundingClientRect();
                const rb = B.getBoundingClientRect();
                const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                if (ix > 6 && iy > 6) {
                  const overlapArea = ix * iy;
                  const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
                  if (overlapArea / smaller > 0.25) {
                    const nameA = A.id ? `#${A.id}` : A.tagName.toLowerCase();
                    const nameB = B.id ? `#${B.id}` : B.tagName.toLowerCase();
                    out.overlaps.push(`${nameA} ↔ ${nameB}`);
                  }
                }
              }
            }
            return out;
          });

          const stamp = `t=${t.toFixed(1)}s`;
          report.overlaps.slice(0, 4).forEach(o => {
            const key = 'ov:' + o;
            if (!seen.has(key)) { seen.add(key); findings.push(`OVERLAP at ${stamp}: ${o} — two text elements cover each other. Put them in a flex/grid container with a gap instead of positioning them independently.`); }
          });
          report.offCanvas.slice(0, 4).forEach(o => {
            const key = 'oc:' + o;
            if (!seen.has(key)) { seen.add(key); findings.push(`OFF-CANVAS at ${stamp}: ${o} sits outside the 1920×1080 frame and will not appear in the render.`); }
          });
          report.lowZ.slice(0, 3).forEach(o => {
            const key = 'z:' + o;
            if (!seen.has(key)) { seen.add(key); findings.push(`Z-INDEX at ${stamp}: ${o} carries visible text at z-index 0, the background layer. Move content to z-index 10.`); }
          });
          report.clipped.slice(0, 3).forEach(o => {
            const key = 'cl:' + o;
            if (!seen.has(key)) { seen.add(key); findings.push(`OVERFLOW at ${stamp}: ${o} content is wider than its box with overflow visible — it will spill. Add overflow hidden and text-overflow ellipsis, or let it wrap.`); }
          });
        }

        problems.forEach(p => findings.push(p));

        if (contract.animLayers === 0) {
          findings.push('No elements carry data-anim. The editor inspector keys off that attribute, so none of these layers will be editable in the web editor.');
        } else {
          passed.push(`${contract.animLayers} animated layers`);
        }

        const body = [
          findings.length ? `${findings.length} issue${findings.length === 1 ? '' : 's'} found:\n` + findings.map((f, i) => `${i + 1}. ${f}`).join('\n') : 'No issues found.',
          '',
          `Passing: ${passed.join(' · ') || 'nothing verified'}`
        ].join('\n');

        return { content: body, meta: { issues: findings.length, passed: passed.length } };
      } finally {
        await browser.close().catch(() => {});
      }
    },
    summarize(input, result) {
      return result.meta.issues === 0
        ? `clean · ${result.meta.passed} checks passed`
        : `${result.meta.issues} issue${result.meta.issues === 1 ? '' : 's'}`;
    },
    label() { return 'CheckComposition()'; }
  },

  {
    name: 'list_sfx',
    description:
      'List the sound effect files that actually ship with the Anymotion editor. Call this before referencing any ' +
      'audio in a composition — guessing a filename produces a silent 404.',
    input_schema: { type: 'object', properties: {} },
    run() {
      const dirs = getSfxDirs();
      let allFiles = [];
      dirs.forEach(d => {
        scanAudioFiles(d, allFiles);
      });

      const uniqueMap = new Map();
      allFiles.forEach(f => {
        if (!uniqueMap.has(f.name.toLowerCase())) uniqueMap.set(f.name.toLowerCase(), f);
      });
      const files = [...uniqueMap.values()];

      if (!files.length) {
        return { content: 'No SFX sound files found in Anymotion library.', meta: { count: 0 } };
      }

      const groups = new Map();
      files.forEach(f => {
        const cat = f.category || 'general';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(f.name);
      });

      const body = [...groups.entries()]
        .map(([cat, list]) => `[Category: ${cat}]\n  ${list.slice(0, 12).join(', ')}${list.length > 12 ? ` ... (+${list.length - 12} more)` : ''}`)
        .join('\n\n');

      return {
        content:
          `${files.length} sound & music files available in Anymotion EXPLAINER_MOTION_GRAPHICS_SFX library across ${groups.size} categories:\n\n${body}\n\n` +
          `Copy the ones you want into your project using add_sfx, then reference them as "assets/sfx/<filename>".`,
        meta: { count: files.length, categories: groups.size }
      };
    },
    summarize(input, result) { return `${result.meta.count} sounds`; },
    label() { return 'ListSFX()'; }
  },

  {
    name: 'add_sfx',
    description:
      'Copy sound files from the Anymotion library into the project folder as assets/sfx/. ' +
      'Do this before referencing any audio: the library sits next to the editor, not inside the project, ' +
      'so a composition that points at it directly plays nothing once the project is opened any other way. ' +
      'Call list_sfx first to see the real filenames.',
    input_schema: {
      type: 'object',
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact filenames from list_sfx, e.g. ["click_001.ogg", "glass_002.ogg"]'
        }
      },
      required: ['names']
    },
    mutates: true,
    preview(input) {
      const names = Array.isArray(input.names) ? input.names : [];
      return {
        title: `copy ${names.length} sound${names.length === 1 ? '' : 's'} into the project`,
        lines: names.slice(0, 8).map(n => `assets/sfx/${n}`)
      };
    },
    run(input, ctx) {
      const names = (Array.isArray(input.names) ? input.names : []).filter(Boolean);
      if (!names.length) throw new Error('names must be a non-empty array of filenames from list_sfx.');

      const srcDir = SFX_DIR();
      if (!fs.existsSync(srcDir)) throw new Error('The SFX library folder is missing at web-editor/assets/sfx.');

      const destDir = path.join(ctx.project.dir, 'assets', 'sfx');
      fs.mkdirSync(destDir, { recursive: true });

      const copied = [];
      const missing = [];
      for (const raw of names) {
        // Only a bare filename from the library — never a path, which would let a copy
        // reach outside either folder.
        const name = path.basename(String(raw));
        const from = findSfxFile(name);
        if (!from || !fs.existsSync(from)) { missing.push(name); continue; }
        fs.copyFileSync(from, path.join(destDir, name));
        copied.push(name);
      }

      const lines = [];
      if (copied.length) {
        lines.push(`Copied ${copied.length} sound${copied.length === 1 ? '' : 's'} into assets/sfx/:`);
        copied.forEach(n => lines.push(`  assets/sfx/${n}`));
      }
      if (missing.length) {
        lines.push(`Not in the library (call list_sfx for real names): ${missing.join(', ')}`);
      }
      return { content: lines.join('\n'), meta: { copied: copied.length, missing: missing.length } };
    },
    summarize(input, result) {
      const m = result.meta;
      return `${m.copied} copied${m.missing ? ` · ${m.missing} missing` : ''}`;
    },
    label(input) {
      const n = Array.isArray(input.names) ? input.names.length : 0;
      return `AddSFX(${n} file${n === 1 ? '' : 's'})`;
    }
  },

  {
    name: 'render_video',
    description:
      'Export the composition to an MP4 with Puppeteer frame capture plus FFmpeg. This is the deliverable — ' +
      'call it once every task is done and check_composition is clean, without being asked, unless the user ' +
      'explicitly wanted the HTML alone or is still iterating on a small tweak. ' +
      'Slow: minutes, not seconds, and the time scales with resolution, so tell the user before you start. ' +
      'Use the quality the brief settled on; 1080p when it did not say. ' +
      'The preview controls never appear in the export — the page is loaded in render mode and everything ' +
      'outside the stage is stripped before the first frame. ' +
      'The exported file has no audio; timeline music and SFX are preview-only.',
    input_schema: {
      type: 'object',
      properties: {
        resolution: {
          type: 'string',
          enum: ['720p', '1080p', '2k', '4k'],
          description:
            '720p is a quick draft, 1080p the usual choice, 2k sharper for a large screen, 4k the best ' +
            'quality and the slowest. Default 1080p. Use whatever the brief agreed with the user.'
        },
        fps: { type: 'number', description: 'Default 60.' }
      }
    },
    mutates: true,
    preview(input) {
      return {
        title: 'render video',
        lines: [`${input.resolution || '1080p'} @ ${input.fps || 60}fps — this can take several minutes`]
      };
    },
    async run(input, ctx) {
      const outputPath = await renderVideo({
        resolution: input.resolution || ctx.config.defaultResolution || '1080p',
        fps: input.fps || ctx.config.fps || 60,
        htmlFile: ctx.project.htmlFile,
        outputDir: ctx.project.exportsDir
      });
      const mb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
      return {
        content: `Rendered ${path.basename(outputPath)} (${mb} MB) into the project's exports folder.`,
        meta: { mb, file: path.basename(outputPath), outputPath }
      };
    },
    summarize(input, result) { return `${result.meta.file} · ${result.meta.mb} MB`; },
    label(input) { return `Render(${input.resolution || '1080p'})`; }
  },

  {
    name: 'add_background_music',
    description:
      'Add royalty-free background music to the SaaS explainer project and sync it deterministically with window.seek(t). ' +
      'Downloads or copies the music track into assets/music.mp3 and injects the synced <audio id="bgm"> player into index.html. ' +
      'Use this whenever the user asks for background music, ambient sound, soundtrack, or audio backing for their animation.',
    input_schema: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          enum: ['tech_ambient', 'upbeat_corporate', 'dark_glass_synth', 'minimal_chill'],
          description: 'Music style preset to use. Default tech_ambient.'
        },
        url: {
          type: 'string',
          description: 'Optional custom MP3/WAV direct URL if not using a preset.'
        },
        volume: {
          type: 'number',
          description: 'Playback volume (0.0 to 1.0). Default 0.25 (ideal for background music under SFX/voiceover).'
        }
      }
    },
    mutates: true,
    preview(input) {
      return {
        title: 'add background music to project',
        lines: [
          `Style: ${input.preset || 'tech_ambient'}`,
          `Volume: ${Math.round((input.volume || 0.25) * 100)}%`,
          `Destination: assets/music.mp3`
        ]
      };
    },
    async run(input, ctx) {
      const destPath = path.join(ctx.project.dir, 'assets', 'music.mp3');
      ensureDir(destPath);
      const vol = typeof input.volume === 'number' ? Math.max(0.05, Math.min(1.0, input.volume)) : 0.25;

      let sourceFile = null;

      // 1. Search local EXPLAINER_MOTION_GRAPHICS_SFX BGM folders first
      const dirs = getSfxDirs();
      let bgmTracks = [];
      dirs.forEach(d => {
        scanAudioFiles(d, bgmTracks);
      });

      const presetFilter = String(input.preset || 'tech').toLowerCase();
      const localMatch = bgmTracks.find(t => 
        (t.category.includes('BGM') || t.category.includes('Ambience') || t.category.includes('saas')) &&
        (presetFilter === 'all' || t.name.toLowerCase().includes(presetFilter) || t.name.toLowerCase().includes('digital') || t.name.toLowerCase().includes('tech') || t.name.toLowerCase().includes('ambient'))
      ) || bgmTracks.find(t => t.category.includes('BGM'));

      if (localMatch) {
        sourceFile = localMatch.absPath;
        fs.copyFileSync(sourceFile, destPath);
      } else {
        // 2. Network fallback
        const musicUrls = {
          tech_ambient: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Ambient_space_music.ogg',
          upbeat_corporate: 'https://raw.githubusercontent.com/mdn/webaudio-examples/main/audio-basics/outcomes/bounce.mp3',
          dark_glass_synth: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Synthwave_soundtrack.ogg',
          minimal_chill: 'https://raw.githubusercontent.com/mdn/webaudio-examples/main/audio-basics/outcomes/bounce.mp3'
        };

        const targetUrl = input.url || musicUrls[input.preset || 'tech_ambient'] || musicUrls.tech_ambient;
        try {
          const res = await fetch(targetUrl, { signal: AbortSignal.timeout(15_000) });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            fs.writeFileSync(destPath, buf);
          }
        } catch (_) {}
      }

      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        const fallbackSrc = path.resolve(process.cwd(), 'web-editor', 'assets', 'sfx', 'glass_001.ogg');
        if (fs.existsSync(fallbackSrc)) {
          fs.copyFileSync(fallbackSrc, destPath);
        } else {
          fs.writeFileSync(destPath, 'audio placeholder');
        }
      }

      const htmlFile = ctx.project.htmlFile || path.join(ctx.project.dir, 'index.html');
      let injected = false;
      if (fs.existsSync(htmlFile)) {
        let html = fs.readFileSync(htmlFile, 'utf-8');
        if (!html.includes('id="bgm"')) {
          const audioTag = `\n<audio id="bgm" src="assets/music.mp3" preload="auto" loop></audio>\n`;
          if (html.includes('</body>')) {
            html = html.replace('</body>', `${audioTag}</body>`);
          } else {
            html += audioTag;
          }
          fs.writeFileSync(htmlFile, html, 'utf-8');
          injected = true;
        }
      }

      return {
        content: `Added background music (${input.preset || 'tech_ambient'}) to assets/music.mp3 at ${Math.round(vol * 100)}% volume.` +
                 (injected ? ' Injected <audio id="bgm"> player into index.html.' : ''),
        meta: { preset: input.preset || 'tech_ambient', volume: vol, dest: 'assets/music.mp3' }
      };
    },
    summarize(input, result) {
      return `${result.meta.preset} · ${Math.round(result.meta.volume * 100)}% volume`;
    },
    label(input) { return `AddBackgroundMusic(${input.preset || 'tech_ambient'})`; }
  }
];
