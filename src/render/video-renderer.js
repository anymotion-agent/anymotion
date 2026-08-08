import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import puppeteer from 'puppeteer';
import { loadConfig } from '../config/config-manager.js';

/** Named sizes the CLI accepts, plus the WIDTHxHEIGHT escape hatch. */
const RESOLUTIONS = {
  '720p': [1280, 720],
  '1280x720': [1280, 720],
  '1080p': [1920, 1080],
  '1920x1080': [1920, 1080],
  '2k': [2560, 1440],
  '2560x1440': [2560, 1440],
  '1440p': [2560, 1440],
  '4k': [3840, 2160],
  '3840x2160': [3840, 2160]
};

export function parseResolution(value) {
  const key = String(value || '').toLowerCase().trim();
  if (RESOLUTIONS[key]) return { width: RESOLUTIONS[key][0], height: RESOLUTIONS[key][1] };

  const custom = key.match(/^(\d{3,5})x(\d{3,5})$/);
  if (custom) return { width: parseInt(custom[1], 10), height: parseInt(custom[2], 10) };

  // An unrecognised value used to silently render at 2K, so a typo produced a video
  // at the wrong size with no indication anything was wrong.
  throw new Error(
    `Unknown resolution "${value}". Use one of: ${Object.keys(RESOLUTIONS).join(', ')}, or WIDTHxHEIGHT.`
  );
}

/** True when an ffmpeg binary is callable. Checked before an hour of frames is captured. */
export function hasFFmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

/** exports/name.mp4 → exports/name-2.mp4 when the first is taken. */
function uniquePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}${ext}`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${n}${ext}`);
    n++;
  }
  return candidate;
}

/**
 * Puts the page into a state fit for capture, and reports the film's natural size.
 *
 * The play/pause bar, the scrubber and the timecode readout exist so a human can drive the
 * preview. They were ending up in the exported MP4, because nothing here had ever told the
 * page it was being captured rather than watched: the renderer loaded the file exactly as a
 * browser would, screenshotted the whole viewport, and the bar was in every frame. Worse,
 * the bar also *pushes the film up* — the stage centres itself in the space above it via
 * `--chrome-h` — so the export was letterboxed off-centre as well as visibly controlled.
 *
 * Two mechanisms, because there are two kinds of project. Compositions built on the skill's
 * timeline engine read `?render` and never build the bar in the first place. Hand-written
 * ones know nothing about that flag, so their chrome is removed here.
 *
 * The rule for what counts as chrome is structural rather than a list of class names, which
 * is what makes it safe on a project nobody anticipated: **the film is what lives inside the
 * stage.** Anything that is neither inside the stage nor an ancestor of it is preview
 * furniture by definition and does not belong in an export. Class names are only a secondary
 * net, for chrome that sits inside the stage's own wrapper.
 */
async function prepareForCapture(page) {
  return page.evaluate(() => {
    const CHROME = [
      '.preview-ui', '.scrub-bar', '.scrubwrap', '.scrub', '.ctrl', '.controls',
      '#controls', '#scrubwrap', '#playbtn', '.pbtn', '.tcode', '[data-preview-ui]',
      '[data-render="hide"]'
    ].join(',');

    // The engine's own render stylesheet keys off this class. Adding it here means a
    // hand-written project picks up whatever render rules it happens to define, and costs
    // nothing when it defines none.
    document.documentElement.classList.add('render-mode');
    document.body.classList.add('render-mode');

    // A composition that autoplays keeps advancing its own clock between our seek() and
    // our screenshot, so the captured frame is a wall-clock frame rather than the one that
    // was asked for. Both project shapes expose a way to stop that: the engine through its
    // timeline, hand-written ones through the top-level setPlay() that a classic script
    // leaves on window. Freezing requestAnimationFrame outright would be the general
    // answer, but it would also silently produce a still image for any composition that
    // applies its own seek inside a frame callback.
    let pausedVia = null;
    const timeline = window.__EXPLAINER__ && window.__EXPLAINER__.timeline;
    if (timeline && typeof timeline.pause === 'function') { timeline.pause(); pausedVia = 'timeline'; }
    if (typeof window.setPlay === 'function') { window.setPlay(false); pausedVia = pausedVia || 'setPlay'; }
    if (typeof window.pause === 'function') { window.pause(); pausedVia = pausedVia || 'pause'; }

    const stage =
      document.querySelector('.stage') ||
      document.querySelector('#stage') ||
      document.querySelector('[data-stage]');

    let hidden = 0;
    const hide = (el) => {
      if (!el || el.dataset.__anymotionHidden) return;
      el.dataset.__anymotionHidden = '1';
      el.style.setProperty('display', 'none', 'important');
      hidden++;
    };

    if (stage) {
      // Structural pass. A body child either contains the stage (it is the viewport
      // wrapper) or it does not (it is chrome). Script and style tags are already
      // invisible, so hiding them is a no-op rather than a special case.
      for (const el of Array.from(document.body.children)) {
        if (el === stage || el.contains(stage)) continue;
        hide(el);
      }
      // Name-based pass, for chrome nested inside the viewport alongside the stage.
      for (const el of Array.from(document.querySelectorAll(CHROME))) {
        if (stage.contains(el) || el.contains(stage)) continue;
        hide(el);
      }
    } else {
      // No recognisable stage. Fall back to names only — hiding body children blind
      // would be a good way to export a black rectangle.
      for (const el of Array.from(document.querySelectorAll(CHROME))) hide(el);
    }

    // With the bar gone the film should be centred in the whole window, not in the space
    // above a bar that no longer exists. Setting the variable covers pages with no fitter;
    // the resize event covers pages that have one, since every fitter in this codebase
    // remeasures the (now zero-height) bar when it fires.
    document.documentElement.style.setProperty('--chrome-h', '0px');
    window.dispatchEvent(new Event('resize'));
    if (window.visualViewport) window.visualViewport.dispatchEvent(new Event('resize'));

    const harness = window.__EXPLAINER__;
    const stageW = Number(harness?.width) || stage?.offsetWidth || 0;
    const stageH = Number(harness?.height) || stage?.offsetHeight || 0;

    return { hidden, stageW, stageH, foundStage: Boolean(stage), pausedVia };
  });
}

export async function renderVideo(options = {}) {
  const config = loadConfig();
  const resolutionStr = options.resolution || config.defaultResolution || '1080p';
  const fps = parseInt(options.fps || config.fps || 60, 10);
  const htmlFile = path.resolve(process.cwd(), options.htmlFile || config.projectFile || './index.html');
  const outputDir = path.resolve(process.cwd(), options.outputDir || config.outputDir || './exports');
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) {
    throw new Error(`Invalid fps "${options.fps || config.fps}". Use a number between 1 and 240.`);
  }

  if (!fs.existsSync(htmlFile)) {
    throw new Error(`Project HTML file not found at: ${htmlFile}`);
  }

  // Capturing thousands of frames only to discover the stitcher is missing wastes the
  // entire render, so the dependency is verified while it still costs nothing.
  if (!hasFFmpeg()) {
    throw new Error(
      'FFmpeg was not found on PATH. Install it and re-run:\n' +
      '  Windows  winget install Gyan.FFmpeg\n' +
      '  macOS    brew install ffmpeg\n' +
      '  Linux    sudo apt install ffmpeg'
    );
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const { width, height } = parseResolution(resolutionStr);

  // A fixed filename meant every render silently destroyed the previous one — the
  // thing you rendered yesterday was simply gone.
  const outputVideoPath = uniquePath(outputDir, `motion-output-${resolutionStr}`, '.mp4');
  const framesDir = path.join(outputDir, `.temp_frames_${process.pid}_${Date.now()}`);

  fs.mkdirSync(framesDir, { recursive: true });

  console.log(`\n🎬 Starting ${resolutionStr.toUpperCase()} Video Render (${width}x${height} @ ${fps} FPS)`);
  console.log(`📄 Input HTML: ${htmlFile}`);
  console.log(`📁 Output Destination: ${outputVideoPath}\n`);

  let browser = null;
  let stitched = false;

  // Ctrl+C during a render used to leave a headless Chrome running with no window to
  // close it from, one per interrupted render.
  const closeBrowser = async () => {
    if (browser) {
      const b = browser;
      browser = null;
      try { await b.close(); } catch (_) {}
    }
  };
  const onSignal = () => { closeBrowser().finally(() => process.exit(130)); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--allow-file-access-from-files',
        '--hide-scrollbars',
        `--window-size=${width},${height}`
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    // `?render` is the timeline engine's own signal that this is a capture, not a viewing.
    // It skips building the control bar entirely, which is cleaner than building it and
    // then hiding it. prepareForCapture() below covers everything that ignores the flag.
    const fileUrl = `file:///${htmlFile.replace(/\\/g, '/')}?render=1`;
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });

    // Web fonts that are still loading render as fallback glyphs, and the first few
    // frames come out in the wrong typeface — invisible until the video is watched.
    try {
      await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    } catch (_) {}

    const chrome = await prepareForCapture(page);
    if (chrome.hidden) {
      console.log(`🧹 Removed ${chrome.hidden} preview control element${chrome.hidden === 1 ? '' : 's'} from the capture`);
    }

    // Render the film at its native layout size and let the device pixel ratio carry the
    // resolution, rather than laying it out in a window the size of the target.
    //
    // This is what makes the quality options mean anything above 1080p. A 1920x1080
    // composition asked for at 4K was laid out in a 3840x2160 window, where the page's own
    // fitter clamps its scale at `min(…, 1)` and refuses to upscale — so "4K" came out as a
    // 1080p film sitting in a black 4K frame. At deviceScaleFactor 2 the same composition is
    // laid out at its native size and rasterised at twice the density: real 3840x2160 pixels,
    // with type and vector edges resolved at that density instead of stretched up to it.
    //
    // Two conditions, both narrow on purpose:
    //   - the aspect ratios must agree, since a 9:16 film cannot become 1920x1080 at any
    //     pixel ratio, and that case still wants the fit-and-letterbox path;
    //   - and only for scaling UP. At or below 1:1 the existing path already fills the frame
    //     exactly (the fitter's scale and the viewport agree), so there is nothing to fix and
    //     no reason to introduce a fractional pixel ratio that could land a pixel off.
    if (chrome.stageW > 0 && chrome.stageH > 0) {
      const aspectGap = Math.abs(width / height - chrome.stageW / chrome.stageH);
      const scale = width / chrome.stageW;

      if (aspectGap >= 0.005) {
        console.warn(
          `⚠️ The composition is ${chrome.stageW}x${chrome.stageH} but ${resolutionStr} is ${width}x${height}. ` +
          `The film will be fitted inside that frame with bars.`
        );
      } else if (scale > 1 && scale <= 4) {
        await page.setViewport({
          width: chrome.stageW,
          height: chrome.stageH,
          deviceScaleFactor: scale
        });
        // setViewport relayouts, so the page's fitter has to run again against the new
        // window size or the stage keeps the scale it computed for the old one.
        await page.evaluate(() => {
          window.dispatchEvent(new Event('resize'));
          if (window.visualViewport) window.visualViewport.dispatchEvent(new Event('resize'));
        });
        console.log(`🔍 Rendering ${chrome.stageW}x${chrome.stageH} at ${scale}x pixel density → ${width}x${height}`);
      }
    }

    const duration = await page.evaluate(() => window.DURATION || 10.0);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`The composition reported an invalid window.DURATION (${duration}).`);
    }

    const totalFrames = Math.ceil(duration * fps);
    const frameInterval = 1 / fps;

    const hasSeek = await page.evaluate(() => typeof window.seek === 'function');
    if (!hasSeek) {
      // Without seek() every frame is identical and the render produces a still image
      // dressed up as a video.
      throw new Error(
        'The composition does not define window.seek(t). ' +
        'Anymotion renders deterministically by seeking, so the animation must expose it.'
      );
    }

    console.log(`⏱️ Animation Duration: ${duration}s (${totalFrames} total frames)\n`);

    // Step 1: Capture frames
    const step = Math.max(1, Math.floor(totalFrames / 10));
    for (let f = 0; f < totalFrames; f++) {
      const time = f * frameInterval;

      await page.evaluate((t) => {
        window.seek(t);
      }, time);

      const framePath = path.join(framesDir, `frame_${String(f).padStart(5, '0')}.png`);
      await page.screenshot({ path: framePath, type: 'png' });

      if (f % step === 0 || f === totalFrames - 1) {
        const pct = Math.round(((f + 1) / totalFrames) * 100);
        console.log(`  📸 Screenshotting frames: ${f + 1}/${totalFrames} (${pct}%)`);
        if (onProgress) onProgress({ frame: f + 1, totalFrames, percent: pct });
      }
    }

    await closeBrowser();

    // Step 2: Stitch with FFmpeg
    console.log(`\n🎞️ Stitching ${totalFrames} PNG frames into H.264 MP4 with FFmpeg...`);

    // `scale` pins the output to exactly the resolution that was asked for. A fractional
    // device pixel ratio can land the capture a pixel off, and libx264 with yuv420p needs
    // even dimensions in both axes — an odd one fails the encode outright. When the capture
    // is already the right size this is an identity pass and costs nothing, since the frames
    // have to go through a pixel-format conversion either way.
    const ffmpegCmd =
      `ffmpeg -y -r ${fps} -i "${path.join(framesDir, 'frame_%05d.png')}" ` +
      `-vf "scale=${width}:${height}:flags=lanczos" ` +
      `-c:v libx264 -pix_fmt yuv420p -crf 18 "${outputVideoPath}"`;

    try {
      execSync(ffmpegCmd, { stdio: 'inherit' });
      stitched = true;
      console.log(`\n✨ ✅ Video Render Complete! Saved to: ${outputVideoPath}\n`);
    } catch (ffmpegErr) {
      // The frames are the expensive part. Keeping them means a failed stitch costs a
      // command, not a re-render — the previous version printed this promise and then
      // deleted them in the finally block anyway.
      console.warn(`\n⚠️ FFmpeg failed. Frames preserved in: ${framesDir}`);
      console.warn(`To stitch them manually, run:\n  ${ffmpegCmd}\n`);
      throw new Error(`FFmpeg stitching failed: ${ffmpegErr.message}. Frames kept at ${framesDir}`);
    }

    return outputVideoPath;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await closeBrowser();

    // Only discard frames once they are safely inside a video file.
    if (stitched) {
      try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
}
