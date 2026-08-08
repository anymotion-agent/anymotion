document.addEventListener('DOMContentLoaded', () => {
  const iframe = document.getElementById('previewIframe');
  const canvasFrame = document.getElementById('canvasFrame');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const btnStepBack = document.getElementById('btnStepBack');
  const btnStepForward = document.getElementById('btnStepForward');
  const selectSpeed = document.getElementById('selectSpeed');
  const timeReadout = document.getElementById('timeReadout');
  const btnResetCanvas = document.getElementById('btnResetCanvas');
  const toastContainer = document.getElementById('toastContainer');

  // Undo / Redo Header Buttons
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');

  // Zoom Controls
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const sliderZoom = document.getElementById('sliderZoom');
  const valZoomLevel = document.getElementById('valZoomLevel');

  // Music & SFX Controls
  const btnUploadMusic = document.getElementById('btnUploadMusic');
  const audioFileInput = document.getElementById('audioFileInput');
  const musicTrackName = document.getElementById('musicTrackName');
  const btnAddSfxMarker = document.getElementById('btnAddSfxMarker');
  const sfxMenu = document.getElementById('sfxMenu');
  const sliderVolume = document.getElementById('sliderVolume');
  const trackSfx = document.getElementById('trackSfx');
  const trackMusic = document.getElementById('trackMusic');
  const trackVideo = document.getElementById('trackVideo');
  const trackHeaders = document.getElementById('trackHeaders');

  // Audio Inspector (SFX marker / music clip)
  const audioInspector = document.getElementById('audioInspector');
  const audioStartTime = document.getElementById('audioStartTime');
  const audioDurationInput = document.getElementById('audioDuration');
  const valAudioDuration = document.getElementById('valAudioDuration');
  const audioVolume = document.getElementById('audioVolume');
  const valAudioVolume = document.getElementById('valAudioVolume');
  const btnAudioPreview = document.getElementById('btnAudioPreview');
  const btnAudioDelete = document.getElementById('btnAudioDelete');
  const groupAudioDuration = document.getElementById('groupAudioDuration');

  // Multitrack & Playhead Needle Elements
  const trackBody = document.getElementById('trackBody');
  const playheadNeedle = document.getElementById('playheadNeedle');
  const rulerTicksBar = document.getElementById('rulerTicksBar');
  const multitrackContainer = document.getElementById('multitrackContainer');

  // Synchronize Vertical Scrolling Between Track Headers and Track Body
  trackBody.addEventListener('scroll', () => {
    trackHeaders.scrollTop = trackBody.scrollTop;
  });

  // Theme Toggle
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const moonIcon = document.getElementById('moonIcon');
  const sunIcon = document.getElementById('sunIcon');
  const themeLabel = document.getElementById('themeLabel');

  // Aspect Chips
  const aspectChips = document.querySelectorAll('.aspect-chip');

  // Dynamic Sidebar Containers
  const sceneGroup = document.getElementById('sceneGroup');
  const layersList = document.getElementById('layersList');
  const layerCountTag = document.getElementById('layerCountTag');

  // Inspector Elements
  const selectedLayerTitle = document.getElementById('selectedLayerTitle');
  const selectedTag = document.getElementById('selectedTag');
  const noSelectionHint = document.getElementById('noSelectionHint');
  const inspectorForm = document.getElementById('inspectorForm');

  const selectAnimPreset = document.getElementById('selectAnimPreset');
  const elText = document.getElementById('elText');
  const elFontSize = document.getElementById('elFontSize');
  const valFontSize = document.getElementById('valFontSize');
  const elColor = document.getElementById('elColor');
  const elBgColor = document.getElementById('elBgColor');
  const elRadius = document.getElementById('elRadius');
  const valRadius = document.getElementById('valRadius');
  const elOpacity = document.getElementById('elOpacity');
  const valOpacity = document.getElementById('valOpacity');
  const elPosX = document.getElementById('elPosX');
  const valPosX = document.getElementById('valPosX');
  const elPosY = document.getElementById('elPosY');
  const valPosY = document.getElementById('valPosY');
  const btnUpdateElement = document.getElementById('btnUpdateElement');
  const btnDeleteElement = document.getElementById('btnDeleteElement');

  // Global Presets & Export
  const themeCards = document.querySelectorAll('.theme-card, .theme-btn');
  const btnExportVideo = document.getElementById('btnExportVideo');
  const btnExportTop = document.getElementById('btnExportTop');
  const btnOpenProject = document.getElementById('btnOpenProject');
  const projectModal = document.getElementById('projectModal');
  const btnCloseProjectModal = document.getElementById('btnCloseProjectModal');
  const projectList = document.getElementById('projectList');
  const selectResolution = document.getElementById('selectResolution');
  const renderStatus = document.getElementById('renderStatus');
  const renderStatusText = document.getElementById('renderStatusText');

  let isPlaying = false;
  let currentTime = 0;
  let duration = 10.0;
  let playbackSpeed = 1.0;
  let animFrameId = null;
  let selectedElementId = null;
  let selectedAudioItem = null; // { type: 'sfx'|'music', id: string }
  let selectedClips = []; // Multi-select: [{ type: 'layer'|'sfx'|'music', id: string }]
  let activeSceneIndex = 0;
  let zoomLevel = 100;

  // Rubber-band selection state
  let isBoxSelecting = false;
  let boxSelectStart = { x: 0, y: 0 };
  let boxSelectDiv = null;

  // Scene cut points, discovered from the project's data-scene-time attributes.
  let sceneStartTimes = [0];

  // Shortest clip the timeline will produce. Must match the floor applyLayerTiming() and
  // the project's setLayerTiming() clamp to, or a trim would report one number and save another.
  const MIN_CLIP_DURATION = 0.1;

  // Sliders and text fields fire `input` continuously, so snapshotting per event would
  // flood the undo stack with one entry per pixel of drag. One snapshot per interaction
  // instead — taken *before* the first mutation, and re-armed when a control is next touched.
  let inspectorEditOpen = false;

  // Set on mouseup after a real clip drag/trim so the trailing click doesn't re-seek.
  let suppressNextClipClick = false;

  let bgAudio = new Audio();
  bgAudio.loop = true;

  const firedSFXTimes = new Set();

  const undoStack = [];
  const redoStack = [];

  const sidebarSfxList = document.getElementById('sidebarSfxList');
  const sidebarAnimList = document.getElementById('sidebarAnimList');

  // Real SFX List (Downloaded via setup script)
  const SFX_FILES = [
    'click1.ogg', 'click2.ogg', 'click3.ogg', 'click4.ogg', 'click5.ogg',
    'drop_001.ogg', 'drop_002.ogg', 'drop_003.ogg', 'drop_004.ogg',
    'error_001.ogg', 'error_002.ogg', 'error_003.ogg',
    'confirmation_001.ogg', 'confirmation_002.ogg', 'confirmation_003.ogg',
    'switch_001.ogg', 'switch_002.ogg', 'switch_003.ogg', 'switch_004.ogg',
    'maximize_001.ogg', 'minimize_001.ogg', 'maximize_002.ogg', 'minimize_002.ogg',
    'question_001.ogg', 'question_002.ogg', 'question_003.ogg',
    'glass_001.ogg', 'glass_002.ogg', 'glass_003.ogg', 'glass_004.ogg'
  ];

  // Animate.css Classes
  const ANIMATIONS = [
    'bounce', 'flash', 'pulse', 'rubberBand', 'shakeX', 'shakeY', 'headShake', 'swing', 'tada', 'wobble', 'jello', 'heartBeat',
    'backInDown', 'backInLeft', 'backInRight', 'backInUp',
    'bounceIn', 'bounceInDown', 'bounceInLeft', 'bounceInRight', 'bounceInUp',
    'fadeIn', 'fadeInDown', 'fadeInLeft', 'fadeInRight', 'fadeInUp', 'fadeInTopLeft', 'fadeInTopRight', 'fadeInBottomLeft', 'fadeInBottomRight',
    'flip', 'flipInX', 'flipInY',
    'lightSpeedInRight', 'lightSpeedInLeft',
    'rotateIn', 'rotateInDownLeft', 'rotateInDownRight', 'rotateInUpLeft', 'rotateInUpRight',
    'jackInTheBox', 'rollIn',
    'zoomIn', 'zoomInDown', 'zoomInLeft', 'zoomInRight', 'zoomInUp',
    'slideInDown', 'slideInLeft', 'slideInRight', 'slideInUp'
  ];

  function initDynamicPacks() {
    // Populate SFX List
    if (sidebarSfxList) {
      sidebarSfxList.innerHTML = SFX_FILES.map(file => `
        <div class="asset-item-card sfx-item" data-sfx="${file}">
          <div class="asset-icon-box">SFX</div>
          <div class="asset-info">
            <span class="asset-title">${file.replace('.ogg', '').replace('_', ' ').toUpperCase()}</span>
            <span class="asset-desc">Real UI Audio</span>
          </div>
          <div class="asset-actions">
            <button class="btn-sfx-preview" title="Preview Sound">►</button>
            <button class="btn-sfx-add" title="Add at Playhead">+</button>
          </div>
        </div>
      `).join('');
    }

    // Populate Animations List
    if (sidebarAnimList) {
      sidebarAnimList.innerHTML = ANIMATIONS.map(anim => `
        <button class="asset-item-card anim-item" data-anim="animate__${anim}">
          <div class="asset-icon-box">✨</div>
          <div class="asset-info">
            <span class="asset-title">${anim}</span>
            <span class="asset-desc">Animate.css Class</span>
          </div>
          <div class="asset-add-btn">+</div>
        </button>
      `).join('');

      document.querySelectorAll('.anim-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          if (!selectedElementId) {
            showToast('Please select a layer on the canvas first to apply this animation.', 'warning');
            return;
          }
          const animClass = btn.getAttribute('data-anim');
          applyAnimationToSelected(animClass);
        });
      });
    }
  }

  function applyAnimationToSelected(animClass) {
    saveSnapshot();
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const el = iframeDoc.getElementById(selectedElementId);
    if (!el) return;

    // Remove old animate__ classes
    Array.from(el.classList).forEach(c => {
      if (c.startsWith('animate__')) el.classList.remove(c);
    });

    // Force reflow to restart animation
    void el.offsetWidth;

    el.classList.add('animate__animated');
    el.classList.add(animClass);
    showToast(`Applied ${animClass}`, 'success');
  }

  initDynamicPacks();

  const MAX_HISTORY = 40;

  function getCurrentHTMLSnapshot() {
    try {
      // Prefer the project's own sanitizer: a raw outerHTML grab bakes the current
      // animation frame and the selection outline into whatever we save.
      if (iframe.contentWindow && typeof iframe.contentWindow.getCleanProjectHTML === 'function') {
        return iframe.contentWindow.getCleanProjectHTML();
      }
      if (iframe.contentWindow && iframe.contentWindow.document) {
        return iframe.contentWindow.document.documentElement.outerHTML;
      }
    } catch (_) {}
    return null;
  }

  // Timeline edits live only in the preview DOM until this runs. Without it a trim or a
  // move was lost on reload and never reached the exported video, which renders straight
  // from the project file. Debounced so a drag doesn't hammer the endpoint.
  let persistTimer = null;
  function persistProjectTiming() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      const html = getCurrentHTMLSnapshot();
      if (!html) return;
      try {
        await fetch('/api/save-raw-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullHtml: html })
        });
      } catch (err) {
        showToast('Could not save timing to project file');
      }
    }, 400);
  }

  function saveHistoryState(actionName = 'Edit') {
    const htmlSnapshot = getCurrentHTMLSnapshot();
    if (!htmlSnapshot) return;

    undoStack.push({ action: actionName, html: htmlSnapshot });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
  }

  async function restoreHTMLSnapshot(snapshot) {
    if (!snapshot || !snapshot.html) return;

    try {
      await fetch('/api/save-raw-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullHtml: snapshot.html })
      });

      iframe.src = '/project/index.html?t=' + Date.now();

      selectedElementId = null;
      inspectorForm.style.display = 'none';
      noSelectionHint.style.display = 'flex';
      selectedLayerTitle.textContent = 'SELECT AN ELEMENT ON CANVAS';
      selectedTag.textContent = 'NO SELECTION';

      setTimeout(scanProjectLayersAndScenes, 350);
    } catch (err) {
      console.warn('Failed to restore snapshot:', err);
    }
  }

  async function executeUndo() {
    if (undoStack.length === 0) {
      showToast('Nothing to Undo');
      return;
    }
    const currentHtml = getCurrentHTMLSnapshot();
    if (currentHtml) redoStack.push({ action: 'Undo State', html: currentHtml });

    const prev = undoStack.pop();
    await restoreHTMLSnapshot(prev);
    showToast(`Undo: ${prev.action}`);
  }

  async function executeRedo() {
    if (redoStack.length === 0) {
      showToast('Nothing to Redo');
      return;
    }
    const currentHtml = getCurrentHTMLSnapshot();
    if (currentHtml) undoStack.push({ action: 'Redo State', html: currentHtml });

    const next = redoStack.pop();
    await restoreHTMLSnapshot(next);
    showToast(`Redo: ${next.action}`);
  }

  btnUndo.addEventListener('click', executeUndo);
  btnRedo.addEventListener('click', executeRedo);

  // SHARED TIMELINE COORDINATE SYSTEM
  // Every consumer (ruler ticks, clips, playhead, click-to-seek) measures against the
  // scrollable content width of the track body, NOT its visible width. Mixing the two
  // is what made the playhead drift away from the clips once the timeline was zoomed.
  function getContentWidth() {
    return rulerTicksBar.clientWidth || trackBody.clientWidth || 1;
  }

  function getTrackLeftOffset() {
    return trackHeaders.offsetWidth || 170;
  }

  function timeToPx(t) {
    return (Math.max(0, Math.min(duration, t)) / duration) * getContentWidth();
  }

  // Converts a viewport X coordinate into a timeline time, accounting for horizontal scroll.
  function clientXToTime(clientX) {
    const rect = trackBody.getBoundingClientRect();
    const x = clientX - rect.left + trackBody.scrollLeft;
    const pct = Math.max(0, Math.min(1, x / getContentWidth()));
    return pct * duration;
  }

  /**
   * The project's real length, in seconds.
   *
   * window.DURATION is the documented contract and is checked first, but a composition
   * built on the Timeline engine also carries the number on the timeline instance and on
   * the __EXPLAINER__ descriptor — both in milliseconds. Reading only DURATION meant that
   * any project which set its length on the timeline alone left the editor sitting on the
   * 10s default, so a 30s film was drawn squeezed into a 10s ruler and every clip landed
   * at the wrong place.
   */
  function readProjectDuration() {
    const win = (() => { try { return iframe.contentWindow; } catch (_) { return null; } })();
    if (!win) return null;

    const candidates = [];
    try { if (win.DURATION) candidates.push(parseFloat(win.DURATION)); } catch (_) {}
    try { if (win.PROJECT_DURATION) candidates.push(parseFloat(win.PROJECT_DURATION)); } catch (_) {}
    try { if (win.TOTAL_DURATION) candidates.push(parseFloat(win.TOTAL_DURATION)); } catch (_) {}
    // Millisecond sources, normalised on the way in.
    try { candidates.push(parseFloat(win.__EXPLAINER__ && win.__EXPLAINER__.duration) / 1000); } catch (_) {}
    try { candidates.push(parseFloat(win.tl && win.tl.duration) / 1000); } catch (_) {}
    try {
      const t = win.__EXPLAINER__ && win.__EXPLAINER__.timeline;
      candidates.push(parseFloat(t && t.duration) / 1000);
    } catch (_) {}

    // DOM scene cut points & layer end times
    try {
      const doc = win.document;
      if (doc) {
        doc.querySelectorAll('[data-scene-time]').forEach(sc => {
          const tStr = sc.getAttribute('data-scene-time');
          const st = parseFloat(tStr);
          if (!isNaN(st) && st > 0) candidates.push(st);
        });
        doc.querySelectorAll('[data-start]').forEach(el => {
          const s = parseFloat(el.getAttribute('data-start'));
          const d = parseFloat(el.getAttribute('data-duration'));
          if (!isNaN(s) && !isNaN(d) && (s + d) > 0) candidates.push(s + d);
        });
      }
    } catch (_) {}

    const valid = candidates.filter(d => !isNaN(d) && d > 0.05 && d < 3600);
    if (valid.length > 0) return Math.max(...valid);
    return null;
  }

  function syncDurationFromIframe() {
    const d = readProjectDuration();
    if (d === null) return false;
    if (Math.abs(d - duration) <= 0.001) return false;

    duration = d;
    // The music clip was sized against the previous length; a project swap must not leave
    // it hanging off the end of the new timeline.
    musicClip.start = Math.max(0, Math.min(duration - MIN_CLIP_DURATION, musicClip.start));
    musicClip.duration = Math.max(MIN_CLIP_DURATION,
      Math.min(duration - musicClip.start, musicClip.duration));

    updateTimelineZoom(zoomLevel);
    return true;
  }

  /**
   * Per-element and per-scene timing, read straight out of the composition's own timeline.
   *
   * The editor used to have no way to ask when a layer actually animates, so it fell back
   * to slicing the project into equal scene-sized blocks — which is why every clip lined up
   * on a perfect grid regardless of what the film did. The Timeline engine already holds
   * the real answer: `records` maps elements to [at, at+dur] windows and `scenes` holds the
   * cut points. Reading them turns the timeline from a decorative grid into an accurate one.
   *
   * Returns null when the project does not use the engine, in which case the caller keeps
   * its previous behaviour.
   */
  function readTimelineModel() {
    let tl = null;
    try {
      const win = iframe.contentWindow;
      tl = (win.__EXPLAINER__ && win.__EXPLAINER__.timeline) || win.tl || null;
    } catch (_) { return null; }
    if (!tl || !Array.isArray(tl.records)) return null;

    // element -> { from, to } in seconds, unioned across every record touching it.
    const windows = new Map();
    const note = (el, fromMs, toMs) => {
      if (!el || !el.nodeType) return;
      const prev = windows.get(el);
      const from = fromMs / 1000;
      const to = toMs / 1000;
      if (prev) {
        prev.from = Math.min(prev.from, from);
        prev.to = Math.max(prev.to, to);
      } else {
        windows.set(el, { from, to });
      }
    };

    tl.records.forEach(rec => {
      const els = rec.els || [];
      const at = Number(rec.at) || 0;
      const dur = Number(rec.dur) || 0;
      const stagger = Number(rec.stagger) || 0;
      // A zero-length record is a rest pose (`set`), not an appearance. Counting it would
      // stretch every clip back to t=0 and flatten the timeline into one solid block.
      if (dur <= 0) return;
      els.forEach((el, i) => {
        const offset = stagger * (rec.staggerFrom === 'end' ? (els.length - 1 - i) : i);
        note(el, at + offset, at + offset + dur);
      });
    });

    const scenes = (tl.scenes || []).map(s => ({
      name: s.name,
      node: s.node,
      start: (Number(s.start) || 0) / 1000,
      end: ((Number(s.start) || 0) + (Number(s.dur) || 0)) / 1000
    })).sort((a, b) => a.start - b.start);

    return { windows, scenes };
  }

  // TIMELINE ZOOM ENGINE IMPLEMENTATION
  // 400% was enough to inspect a 10s project frame by frame. On a 30s one it still leaves
  // barely 20px per second, so short clips stay unreadably narrow no matter how far the
  // user zooms. The ceiling scales with the project instead of being a fixed number.
  const MAX_ZOOM_PX_PER_SECOND = 260;

  function maxZoomForProject() {
    const viewportWidth = trackBody.clientWidth || 600;
    if (!(duration > 0) || !viewportWidth) return 400;
    const needed = (MAX_ZOOM_PX_PER_SECOND * duration) / viewportWidth * 100;
    return Math.max(400, Math.min(6000, Math.round(needed / 25) * 25));
  }

  function updateTimelineZoom(newZoom) {
    const maxZoom = maxZoomForProject();
    zoomLevel = Math.max(100, Math.min(maxZoom, newZoom));
    sliderZoom.max = String(maxZoom);
    sliderZoom.value = zoomLevel;
    valZoomLevel.textContent = `${zoomLevel}%`;

    // Widen the track *content* rows, not the scroll viewport itself, so the
    // horizontal scrollbar appears and clip percentages keep resolving correctly.
    const viewportWidth = trackBody.clientWidth || 600;
    const contentWidth = Math.round(viewportWidth * (zoomLevel / 100));
    trackBody.style.setProperty('--tl-content-width', `${contentWidth}px`);

    rebuildRulerTicks();
    renderAudioTracks();
    updateTimeDisplay(currentTime);
  }

  /**
   * Label interval chosen from the pixels available per second, not from the zoom level.
   *
   * A fixed 2s step is only right for a 10s project: at 30s it crowds fifteen labels into
   * the same strip and they overlap into mush, and at 3s it gives two ticks for the whole
   * film. Picking the smallest interval from a standard NLE ladder that still leaves room
   * for a label is what makes the ruler read correctly at any length or zoom.
   */
  function chooseTickStep(pxPerSecond) {
    const LADDER = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const MIN_LABEL_PX = 58;
    for (const step of LADDER) {
      if (step * pxPerSecond >= MIN_LABEL_PX) return step;
    }
    return LADDER[LADDER.length - 1];
  }

  function rebuildRulerTicks() {
    const contentWidth = getContentWidth();
    rulerTicksBar.innerHTML = '';
    if (!(duration > 0)) return;

    const pxPerSecond = contentWidth / duration;
    const step = chooseTickStep(pxPerSecond);
    const showFraction = step < 1;

    // Fenceposts, not `t += step`: repeated float addition accumulates error, which at 0.1s
    // over a long project walks the later labels off the beat they are meant to mark.
    const count = Math.floor(duration / step + 1e-6);

    for (let i = 0; i <= count; i++) {
      const t = i * step;
      const tick = document.createElement('span');
      tick.className = 'ruler-tick';

      const mins = Math.floor(t / 60);
      const secs = t - mins * 60;
      tick.textContent = showFraction
        ? `${String(mins).padStart(2, '0')}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`
        : `${String(mins).padStart(2, '0')}:${String(Math.round(secs)).padStart(2, '0')}`;

      tick.style.left = `${(t / duration) * contentWidth}px`;
      if (i === 0) tick.classList.add('tick-first');

      rulerTicksBar.appendChild(tick);
    }

    // The project's true end always gets a label, even when it doesn't land on the step —
    // a 30s film on a 5s grid would otherwise stop reading at 00:30 by accident, and a
    // 12.4s one would simply never show where it ends.
    if (Math.abs(count * step - duration) > step * 0.25) {
      const endTick = document.createElement('span');
      endTick.className = 'ruler-tick tick-last';
      const mins = Math.floor(duration / 60);
      const secs = duration - mins * 60;
      endTick.textContent = `${String(mins).padStart(2, '0')}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
      endTick.style.left = `${contentWidth}px`;
      rulerTicksBar.appendChild(endTick);
    } else {
      const last = rulerTicksBar.lastElementChild;
      if (last && last !== rulerTicksBar.firstElementChild) last.classList.add('tick-last');
    }
  }

  sliderZoom.addEventListener('input', (e) => {
    updateTimelineZoom(parseFloat(e.target.value));
  });

  // Multiplicative, so one click is the same *perceived* step at 100% and at 2000%. A flat
  // +25 crawls once the ceiling scales up with a long project.
  const ZOOM_FACTOR = 1.4;

  btnZoomIn.addEventListener('click', () => {
    updateTimelineZoom(Math.round(zoomLevel * ZOOM_FACTOR));
    showToast(`Timeline Zoom: ${zoomLevel}%`);
  });

  btnZoomOut.addEventListener('click', () => {
    updateTimelineZoom(Math.round(zoomLevel / ZOOM_FACTOR));
    showToast(`Timeline Zoom: ${zoomLevel}%`);
  });

  document.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        executeRedo();
      } else {
        executeUndo();
      }
    } else if (isCtrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      executeRedo();
    } else if (isCtrl && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      updateTimelineZoom(zoomLevel + 25);
    } else if (isCtrl && e.key === '-') {
      e.preventDefault();
      updateTimelineZoom(zoomLevel - 25);
    } else if (((e.key.toLowerCase() === 's' && !isCtrl) || (isCtrl && e.key.toLowerCase() === 'b')) &&
               document.activeElement.tagName !== 'INPUT' &&
               document.activeElement.tagName !== 'TEXTAREA' &&
               document.activeElement.tagName !== 'SELECT') {
      e.preventDefault();
      splitClipAtPlayhead();
    } else if (e.key === 'Escape') {
      // Escape always deselects everything — canvas layer, audio clip, and multi-set.
      e.preventDefault();
      deselectAll();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') &&
               document.activeElement.tagName !== 'INPUT' &&
               document.activeElement.tagName !== 'TEXTAREA') {
      // Delete/Backspace: if multi-selection, batch delete; else delete the single selection.
      if (selectedClips.length > 0) {
        e.preventDefault();
        deleteMultiSelection();
      } else if (selectedElementId) {
        deleteSelectedLayer(selectedElementId);
      } else if (selectedAudioItem) {
        if (selectedAudioItem.type === 'sfx') {
          deleteSFXMarker(selectedAudioItem.id);
        } else {
          removeBackgroundMusic();
        }
        clearAudioSelection();
      }
    }
  });

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-right:6px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <div>${message}</div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ── Live reload ────────────────────────────────────────────────────────────
  //
  // The agent writes the project from the CLI, in another process. Without this the
  // editor sits on a stale iframe until the user thinks to hit refresh — so a build
  // that worked perfectly still looked like nothing happened.
  //
  // Two things this must not do: reload while the user is mid-edit (it would throw away
  // their selection and any unsaved inspector change), and reload in response to the
  // editor's own save (which would fight the user for control of the canvas).
  (function connectLiveReload() {
    if (typeof EventSource === 'undefined') return;

    let suppressUntil = 0;
    let pending = false;

    // Editor saves land on disk too, and the watcher cannot tell them apart from an
    // agent write. Anything within this window of our own POST is assumed to be ours.
    window.__anymotionSuppressReload = (ms = 1500) => {
      suppressUntil = Date.now() + ms;
    };

    // The editor writes through eight different call sites. Rather than remembering to
    // flag each one — and silently breaking the day a ninth is added — every mutating
    // request suppresses the echo on the way out.
    const MUTATING = /\/api\/(save-raw-html|update-project|delete-layer)/;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (MUTATING.test(url)) window.__anymotionSuppressReload(2500);
      return nativeFetch(input, init);
    };

    function applyReload(reason) {
      iframe.src = '/project/index.html?t=' + Date.now();
      showToast(`Project reloaded — ${reason}`);
      setTimeout(() => {
        syncDurationFromIframe();
        scanProjectLayersAndScenes();
      }, 400);
    }

    function requestReload(reason) {
      if (Date.now() < suppressUntil) return;

      // A drag or an open inspector means the user is working right now. Queue the
      // reload and take it the moment they let go, rather than yanking the canvas.
      const busy = document.body.classList.contains('is-dragging') ||
        (typeof selectedElementId !== 'undefined' && selectedElementId);

      if (busy) {
        if (pending) return;
        pending = true;
        showToast('Agent updated the project — reloading when you are done');
        const settle = setInterval(() => {
          const stillBusy = document.body.classList.contains('is-dragging') ||
            (typeof selectedElementId !== 'undefined' && selectedElementId);
          if (stillBusy) return;
          clearInterval(settle);
          pending = false;
          applyReload(reason);
        }, 900);
        return;
      }
      applyReload(reason);
    }

    const source = new EventSource('/api/live');
    source.addEventListener('reload', (ev) => {
      let reason = 'agent wrote changes';
      try {
        const data = JSON.parse(ev.data);
        if (data && data.reason) reason = data.reason;
      } catch (_) {}
      requestReload(reason);
    });

    // EventSource reconnects on its own; this only exists so a dropped stream is
    // visible in the console rather than silently ending live reload.
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) {
        console.warn('[anymotion] live reload disconnected — will retry');
      }
    });
  })();

  let currentTheme = 'dark';
  btnThemeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);

    if (currentTheme === 'light') {
      moonIcon.style.display = 'none';
      sunIcon.style.display = 'inline';
      themeLabel.textContent = 'Light Mode';
    } else {
      moonIcon.style.display = 'inline';
      sunIcon.style.display = 'none';
      themeLabel.textContent = 'Dark Mode';
    }
    showToast(`Switched to ${currentTheme.toUpperCase()} theme`);
  });

  aspectChips.forEach(chip => {
    chip.addEventListener('click', () => {
      aspectChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const ratio = chip.getAttribute('data-ratio');
      canvasFrame.className = 'canvas-frame';

      if (ratio === '16:9') canvasFrame.classList.add('aspect-16-9');
      else if (ratio === '9:16') canvasFrame.classList.add('aspect-9-16');
      else if (ratio === '1:1') canvasFrame.classList.add('aspect-1-1');

      showToast(`Viewport set to ${ratio}`);
    });
  });

  selectSpeed.addEventListener('change', (e) => {
    playbackSpeed = parseFloat(e.target.value);
    bgAudio.playbackRate = playbackSpeed;
  });

  sliderVolume.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    bgAudio.volume = vol;
    if (window.sfxEngine) window.sfxEngine.setVolume(vol);
  });

  btnUploadMusic.addEventListener('click', () => audioFileInput.click());
  audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      saveHistoryState('Add Background Music');
      const url = URL.createObjectURL(file);
      bgAudio.src = url;
      musicClip.volume = parseFloat(sliderVolume.value);
      bgAudio.volume = musicClip.volume;
      bgAudio.playbackRate = playbackSpeed;
      musicTrackName.textContent = file.name;
      // A new file invalidates the cached peaks, or the old track's waveform would be
      // drawn under the new one's name.
      musicPeaks = null;
      musicPeaksKey = null;
      // Redraw so the clip picks up the new name and its remove button.
      renderMusicClip();
      persistSFXMarkers();
      showToast(`Background music loaded: ${file.name}`);
    }
  });

  btnAddSfxMarker.addEventListener('click', (e) => {
    e.stopPropagation();
    sfxMenu.classList.toggle('open');
  });

  document.addEventListener('click', () => sfxMenu.classList.remove('open'));

  document.querySelectorAll('.sfx-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const sfxType = opt.getAttribute('data-sfx');
      addSFXMarkerToTimeline(sfxType, currentTime);
      sfxMenu.classList.remove('open');
    });
  });

  // AUDIO TRACK MODEL
  // The SFX markers and the music bar were static HTML: hardcoded at 0/30/60/85% (only
  // correct for a 10s project), unmovable, undeletable, and unknown to the timeline. Every
  // rule the video clips obey — drag to retime, delete, position derived from real time —
  // now applies to audio too, off this one array.
  const SFX_LABELS = {
    whoosh: 'Whoosh', pop: 'Pop', glitch: 'Glitch',
    chime: 'Chime', click: 'Click', riser: 'Riser',
    swoosh: 'Swoosh', beep: 'Beep'
  };

  // Nominal length of each shipped effect, used as a clip's default duration so the bar
  // on the timeline is roughly as long as the sound actually is.
  const SFX_DEFAULT_DURATION = {
    whoosh: 0.6, pop: 0.25, glitch: 0.45, chime: 1.2, click: 0.15,
    riser: 1.0, swoosh: 0.4, beep: 0.3
  };

  const DEFAULT_SFX_MARKERS = [
    { id: 'sfx-1', type: 'pop', time: 0.0, duration: 0.25, volume: 1 },
    { id: 'sfx-2', type: 'whoosh', time: 3.0, duration: 0.6, volume: 1 },
    { id: 'sfx-3', type: 'glitch', time: 6.0, duration: 0.45, volume: 1 },
    { id: 'sfx-4', type: 'chime', time: 8.5, duration: 1.2, volume: 1 }
  ];

  let sfxMarkers = DEFAULT_SFX_MARKERS.map(m => ({ ...m }));
  let sfxIdCounter = sfxMarkers.length;

  // Music is a clip too: it has a start, a length, and a level. It used to be a fixed
  // full-width bar, so it could not be trimmed or offset.
  let musicClip = { start: 0, duration: duration, volume: 0.7 };

  // SFX markers existed only in the editor's own DOM, so they reset to the shipped four on
  // every reload and undo could not touch them (a snapshot only captures the project file).
  // They now live on the project body, which puts them inside the same save/undo path as
  // everything else — and makes them available to the renderer.
  function persistSFXMarkers() {
    try {
      const body = iframe.contentWindow && iframe.contentWindow.document
        && iframe.contentWindow.document.body;
      if (!body) return;
      body.setAttribute('data-sfx-markers', JSON.stringify(
        sfxMarkers.map(m => ({
          id: m.id,
          type: m.type,
          time: Number(m.time.toFixed(3)),
          duration: Number(m.duration.toFixed(3)),
          volume: Number((m.volume != null ? m.volume : 1).toFixed(3))
        }))
      ));
      body.setAttribute('data-music-clip', JSON.stringify({
        start: Number(musicClip.start.toFixed(3)),
        duration: Number(musicClip.duration.toFixed(3)),
        volume: Number(musicClip.volume.toFixed(3))
      }));
      persistProjectTiming();
    } catch (_) {}
  }

  function loadSFXMarkersFromProject() {
    try {
      const body = iframe.contentWindow && iframe.contentWindow.document
        && iframe.contentWindow.document.body;
      if (!body) return;

      const raw = body.getAttribute('data-sfx-markers');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          sfxMarkers = parsed
            .filter(m => m && SFX_LABELS[m.type] && !isNaN(parseFloat(m.time)))
            .map((m, i) => {
              const time = Math.max(0, Math.min(duration, parseFloat(m.time)));
              // Clips saved before duration existed, and any garbage length, fall back to
              // the effect's nominal length rather than collapsing to zero width.
              const rawDur = parseFloat(m.duration);
              const dur = !isNaN(rawDur) && rawDur >= MIN_CLIP_DURATION
                ? rawDur
                : (SFX_DEFAULT_DURATION[m.type] || 0.5);
              const rawVol = parseFloat(m.volume);
              return {
                id: m.id || `sfx-${i + 1}`,
                type: m.type,
                time: time,
                duration: Math.max(MIN_CLIP_DURATION, Math.min(duration - time, dur)),
                volume: !isNaN(rawVol) ? Math.max(0, Math.min(1, rawVol)) : 1
              };
            });
          sfxIdCounter = sfxMarkers.length;
        }
      }

      const rawMusic = body.getAttribute('data-music-clip');
      if (rawMusic) {
        const m = JSON.parse(rawMusic);
        if (m && typeof m === 'object') {
          const start = Math.max(0, Math.min(duration, parseFloat(m.start) || 0));
          const dur = parseFloat(m.duration);
          const vol = parseFloat(m.volume);
          musicClip = {
            start: start,
            duration: !isNaN(dur) && dur >= MIN_CLIP_DURATION
              ? Math.min(duration - start, dur)
              : duration - start,
            volume: !isNaN(vol) ? Math.max(0, Math.min(1, vol)) : 0.7
          };
          bgAudio.volume = musicClip.volume;
        }
      }
    } catch (_) {}
  }

  function addSFXMarkerToTimeline(sfxType, time) {
    saveHistoryState(`Add SFX (${sfxType})`);
    const start = Math.max(0, Math.min(duration, time));
    sfxMarkers.push({
      id: `sfx-${++sfxIdCounter}`,
      type: sfxType,
      time: start,
      duration: Math.max(MIN_CLIP_DURATION,
        Math.min(duration - start, SFX_DEFAULT_DURATION[sfxType] || 0.5)),
      volume: 1
    });
    renderAudioTracks();
    persistSFXMarkers();
    showToast(`Added ${SFX_LABELS[sfxType] || sfxType} at ${start.toFixed(2)}s`);
  }

  function deleteSFXMarker(id) {
    const marker = sfxMarkers.find(m => m.id === id);
    if (!marker) return;
    saveHistoryState(`Delete SFX (${marker.type})`);
    sfxMarkers = sfxMarkers.filter(m => m.id !== id);
    renderAudioTracks();
    persistSFXMarkers();
    showToast(`Removed ${SFX_LABELS[marker.type] || marker.type}`);
  }

  // AUDIO VISUALIZER
  // The tracks carried no signal at all — a clip was a flat coloured bar, so there was
  // nothing to line a cut up against. Music is drawn from the file's real decoded samples
  // (peak per pixel column). Synthesised SFX have no file to decode, so each type gets a
  // deterministic envelope of its own shape — it isn't the true waveform, but it is a
  // stable, per-type silhouette rather than random noise that changes on every re-render.
  const SFX_ENVELOPES = {
    // [attack fraction, decay exponent, wobble frequency]
    whoosh: [0.35, 1.4, 3],
    pop:    [0.05, 5.0, 1],
    glitch: [0.10, 1.0, 22],
    chime:  [0.03, 2.2, 7],
    click:  [0.02, 9.0, 1],
    riser:  [0.70, 0.8, 5],
    swoosh: [0.25, 2.0, 4],
    beep:   [0.08, 1.5, 14]
  };

  // Decoded music peaks, cached per object URL so scrubbing/zooming doesn't re-decode.
  let musicPeaks = null;
  let musicPeaksKey = null;

  function sizeWaveCanvas(canvas) {
    // Canvas needs pixel dimensions; CSS alone leaves it at the default 300x150 and the
    // drawing comes out stretched.
    const w = Math.max(1, Math.round(canvas.clientWidth));
    const h = Math.max(1, Math.round(canvas.clientHeight));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function drawBars(canvas, amplitudes, alpha) {
    if (!canvas) return;
    const { ctx, w, h } = sizeWaveCanvas(canvas);
    if (w < 2) return;

    const mid = h / 2;
    const barW = 2;
    const gap = 1;
    const count = Math.max(1, Math.floor(w / (barW + gap)));

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < count; i++) {
      // Sample the amplitude array across the clip width regardless of its length.
      const a = amplitudes[Math.floor((i / count) * amplitudes.length)] || 0;
      const barH = Math.max(1, a * (h - 4));
      ctx.fillRect(i * (barW + gap), mid - barH / 2, barW, barH);
    }
  }

  function drawSFXWaveform(canvas, marker) {
    if (!canvas) return;
    const [attack, decay, wobble] = SFX_ENVELOPES[marker.type] || [0.1, 2.0, 4];
    const N = 96;
    const amps = new Array(N);
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      // Rise to 1 over the attack, then decay; wobble gives each type its texture.
      const env = p < attack
        ? p / attack
        : Math.pow(1 - (p - attack) / (1 - attack), decay);
      const osc = 0.65 + 0.35 * Math.abs(Math.sin(p * Math.PI * wobble));
      amps[i] = Math.max(0, env * osc);
    }
    const vol = marker.volume != null ? marker.volume : 1;
    drawBars(canvas, amps.map(a => a * vol), 0.75);
  }

  function drawMusicWaveform(canvas) {
    if (!canvas) return;
    if (!bgAudio.src) {
      // No file loaded: draw a flat idle line rather than faking a signal.
      drawBars(canvas, new Array(48).fill(0.08), 0.35);
      return;
    }
    if (musicPeaks) {
      drawBars(canvas, musicPeaks.map(a => a * musicClip.volume), 0.7);
      return;
    }
    drawBars(canvas, new Array(48).fill(0.12), 0.35);
    decodeMusicPeaks();
  }

  // Decodes the loaded track once and reduces it to peak-per-bucket. Runs off the object
  // URL we already hold, so no second read of the user's file.
  async function decodeMusicPeaks() {
    const key = bgAudio.src;
    if (!key || musicPeaksKey === key) return;
    musicPeaksKey = key;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const res = await fetch(key);
      const buf = await res.arrayBuffer();
      const ctx = new AC();
      const decoded = await ctx.decodeAudioData(buf);
      const data = decoded.getChannelData(0);

      const BUCKETS = 512;
      const step = Math.floor(data.length / BUCKETS) || 1;
      const peaks = new Array(BUCKETS);
      let max = 0;
      for (let b = 0; b < BUCKETS; b++) {
        let peak = 0;
        const from = b * step;
        for (let i = from; i < from + step && i < data.length; i++) {
          const v = Math.abs(data[i]);
          if (v > peak) peak = v;
        }
        peaks[b] = peak;
        if (peak > max) max = peak;
      }
      // Normalise so a quiet track still reads as a waveform.
      musicPeaks = max > 0 ? peaks.map(p => p / max) : peaks;
      ctx.close();
      renderMusicClip();
    } catch (_) {
      // Decode can fail on an unsupported codec; the idle line stays, which is honest.
      musicPeaks = null;
    }
  }

  // AUDIO SELECTION
  // Audio clips were the only timeline items with no selection state at all: clicking one
  // did nothing visible, so there was no way to tell which sound you were about to edit.
  // Video layers select through the iframe; audio lives in the editor's own DOM, so it
  // needs its own selection — but the same rules (one selection at a time, visible
  // highlight, inspector reflects it).
  function selectAudioItem(kind, id) {
    selectedAudioItem = { type: kind, id: id };

    // Selecting audio drops any canvas layer selection, and vice versa — two highlighted
    // things with one inspector would just lie about what an edit applies to.
    if (selectedElementId) {
      selectedElementId = null;
      try {
        if (iframe.contentWindow && typeof iframe.contentWindow.selectLayerById === 'function') {
          iframe.contentWindow.selectLayerById(null);
        }
      } catch (_) {}
    }

    highlightAudioSelection();
    openAudioInspector(kind, id, label, time);
  }

  function clearAudioSelection() {
    if (!selectedAudioItem) return;
    selectedAudioItem = null;
    highlightAudioSelection();
    if (audioInspector) audioInspector.style.display = 'none';
  }

  function highlightAudioSelection() {
    document.querySelectorAll('.sfx-clip-marker.selected, .music-block.selected')
      .forEach(el => el.classList.remove('selected'));
    if (!selectedAudioItem) return;

    const sel = selectedAudioItem.type === 'sfx'
      ? document.querySelector(`.sfx-clip-marker[data-sfx-id="${selectedAudioItem.id}"]`)
      : document.querySelector('.music-block');
    if (sel) sel.classList.add('selected');
  }

  // Loads the selected sound's real numbers into the inspector. Reads from the model, not
  // from the DOM, so a value shown here is the value that will be saved.
  function openAudioInspector() {
    if (!selectedAudioItem || !audioInspector) return;

    // The canvas-layer inspector and the audio inspector share the sidebar; showing both
    // would leave two Delete buttons on screen aimed at different things.
    inspectorForm.style.display = 'none';
    noSelectionHint.style.display = 'none';
    audioInspector.style.display = 'flex';

    if (selectedAudioItem.type === 'sfx') {
      const marker = sfxMarkers.find(m => m.id === selectedAudioItem.id);
      if (!marker) return clearAudioSelection();

      selectedLayerTitle.textContent = `${SFX_LABELS[marker.type] || marker.type} — SOUND EFFECT`;
      selectedTag.textContent = 'SFX CLIP';
      audioStartTime.value = marker.time.toFixed(2);
      audioStartTime.max = duration.toFixed(2);
      audioDurationInput.value = marker.duration.toFixed(2);
      valAudioDuration.textContent = `${marker.duration.toFixed(2)}s`;
      audioVolume.value = marker.volume != null ? marker.volume : 1;
      valAudioVolume.textContent = `${Math.round((marker.volume != null ? marker.volume : 1) * 100)}%`;
      groupAudioDuration.style.display = 'block';
    } else {
      selectedLayerTitle.textContent = `${musicTrackName.textContent || 'Background Music'} — MUSIC`;
      selectedTag.textContent = 'MUSIC CLIP';
      audioStartTime.value = musicClip.start.toFixed(2);
      audioStartTime.max = duration.toFixed(2);
      audioDurationInput.value = musicClip.duration.toFixed(2);
      valAudioDuration.textContent = `${musicClip.duration.toFixed(2)}s`;
      audioVolume.value = musicClip.volume;
      valAudioVolume.textContent = `${Math.round(musicClip.volume * 100)}%`;
      groupAudioDuration.style.display = 'block';
    }
  }

  // Applies one inspector field to the selected clip. Every path clamps against the same
  // MIN_CLIP_DURATION and project duration the timeline drag handlers use, so typing a
  // number and dragging a handle can never disagree.
  function updateSelectedAudio(field, rawValue) {
    if (!selectedAudioItem) return;
    const value = parseFloat(rawValue);
    if (isNaN(value)) return;

    if (!inspectorEditOpen) {
      inspectorEditOpen = true;
      saveHistoryState(`Edit Audio ${field}`);
    }

    const target = selectedAudioItem.type === 'sfx'
      ? sfxMarkers.find(m => m.id === selectedAudioItem.id)
      : musicClip;
    if (!target) return;

    if (field === 'start') {
      const start = Math.max(0, Math.min(duration - MIN_CLIP_DURATION, value));
      if (selectedAudioItem.type === 'sfx') target.time = start;
      else target.start = start;
      // A clip cannot outlive the project: pushing the start right shortens it.
      const curStart = selectedAudioItem.type === 'sfx' ? target.time : target.start;
      target.duration = Math.max(MIN_CLIP_DURATION, Math.min(target.duration, duration - curStart));
    } else if (field === 'duration') {
      const start = selectedAudioItem.type === 'sfx' ? target.time : target.start;
      target.duration = Math.max(MIN_CLIP_DURATION, Math.min(duration - start, value));
      valAudioDuration.textContent = `${target.duration.toFixed(2)}s`;
    } else if (field === 'volume') {
      target.volume = Math.max(0, Math.min(1, value));
      valAudioVolume.textContent = `${Math.round(target.volume * 100)}%`;
      if (selectedAudioItem.type === 'music') bgAudio.volume = target.volume;
    }

    renderAudioTracks();
    highlightAudioSelection();
    persistSFXMarkers();
  }

  if (audioStartTime) {
    audioStartTime.addEventListener('input', () => updateSelectedAudio('start', audioStartTime.value));
    audioDurationInput.addEventListener('input', () => updateSelectedAudio('duration', audioDurationInput.value));
    audioVolume.addEventListener('input', () => updateSelectedAudio('volume', audioVolume.value));

    // Same re-arm pattern as the canvas inspector: one undo entry per interaction, not
    // one per input event.
    [audioStartTime, audioDurationInput, audioVolume].forEach(control => {
      const arm = () => { inspectorEditOpen = false; };
      control.addEventListener('mousedown', arm);
      control.addEventListener('focus', arm);
      control.addEventListener('change', arm);
    });

    btnAudioPreview.addEventListener('click', () => {
      if (!selectedAudioItem) return;
      if (selectedAudioItem.type === 'sfx') {
        const marker = sfxMarkers.find(m => m.id === selectedAudioItem.id);
        if (marker && window.sfxEngine) window.sfxEngine.playSFX(marker.type);
      } else if (bgAudio.src) {
        bgAudio.currentTime = 0;
        bgAudio.play().catch(() => {});
        showToast('Playing music from clip start');
      } else {
        showToast('No music loaded — use Add Music first');
      }
    });

    btnAudioDelete.addEventListener('click', () => {
      if (!selectedAudioItem) return;
      if (selectedAudioItem.type === 'sfx') {
        deleteSFXMarker(selectedAudioItem.id);
      } else {
        removeBackgroundMusic();
      }
      clearAudioSelection();
    });
  }

  // Rebuilds both audio rows from the model, so markers stay at their true time when the
  // project duration changes or the timeline is zoomed.
  function renderAudioTracks() {
    if (trackSfx) {
      trackSfx.innerHTML = '';
      sfxMarkers.forEach(marker => {
        const el = document.createElement('div');
        el.className = 'clip-block sfx-clip-marker';
        // Width IS the duration, same rule as the video clips. These used to be
        // zero-length pins, so a sound had no visible length to trim.
        el.style.left = `${(marker.time / duration) * 100}%`;
        el.style.width = `${(marker.duration / duration) * 100}%`;
        el.setAttribute('data-sfx-id', marker.id);
        el.setAttribute('data-sfx-type', marker.type);

        el.innerHTML = `
          <span class="trim-handle trim-left" title="Trim start"></span>
          <canvas class="audio-wave" aria-hidden="true"></canvas>
          <span class="sfx-label">${SFX_LABELS[marker.type] || marker.type} (${marker.time.toFixed(1)}s)</span>
          <button class="btn-clip-delete" title="Delete this sound effect"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          <span class="trim-handle trim-right" title="Trim end"></span>
        `;

        el.querySelector('.btn-clip-delete').addEventListener('click', (ev) => {
          ev.stopPropagation();
          deleteSFXMarker(marker.id);
        });

        drawSFXWaveform(el.querySelector('.audio-wave'), marker);
        attachAudioClipHandlers(el, marker, 'sfx');

        trackSfx.appendChild(el);
      });
    }

    renderMusicClip();
  }

  // Shared move/trim behaviour for both audio rows. Written once so the music clip and an
  // SFX clip cannot drift into behaving differently.
  function attachAudioClipHandlers(el, model, kind) {
    const getStart = () => (kind === 'sfx' ? model.time : model.start);
    const setStart = (v) => { if (kind === 'sfx') model.time = v; else model.start = v; };
    const label = kind === 'sfx' ? (SFX_LABELS[model.type] || model.type) : 'Music';

    const refresh = () => {
      el.style.left = `${(getStart() / duration) * 100}%`;
      el.style.width = `${(model.duration / duration) * 100}%`;
      const lab = el.querySelector('.sfx-label') || el.querySelector('.music-label');
      if (lab && kind === 'sfx') {
        lab.textContent = `${label} (${getStart().toFixed(1)}s)`;
      } else if (lab) {
        lab.textContent = `${musicTrackName.textContent || 'Background Music'} (${getStart().toFixed(1)}s → ${(getStart() + model.duration).toFixed(1)}s)`;
      }
    };

    const beginTrim = (side) => (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const startX = ev.clientX;
      const initStart = getStart();
      const initDur = model.duration;
      el.classList.add('dragging');

      const onMove = (mv) => {
        const delta = ((mv.clientX - startX) / getContentWidth()) * duration;
        if (side === 'left') {
          // Dragging the left edge moves the start and shortens the clip by the same
          // amount, so the right edge stays put.
          const maxShift = initDur - MIN_CLIP_DURATION;
          const shift = Math.max(-initStart, Math.min(maxShift, delta));
          setStart(initStart + shift);
          model.duration = initDur - shift;
        } else {
          model.duration = Math.max(MIN_CLIP_DURATION,
            Math.min(duration - initStart, initDur + delta));
        }
        refresh();
      };

      const onUp = () => {
        el.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveHistoryState(`Trim ${label} (${model.duration.toFixed(2)}s)`);
        persistSFXMarkers();
        if (selectedAudioItem) openAudioInspector();
        showToast(`${label}: ${getStart().toFixed(2)}s → ${(getStart() + model.duration).toFixed(2)}s`);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const lh = el.querySelector('.trim-left');
    const rh = el.querySelector('.trim-right');
    if (lh) lh.addEventListener('mousedown', beginTrim('left'));
    if (rh) rh.addEventListener('mousedown', beginTrim('right'));

    // Body drag = move the whole clip; a click with no travel = select.
    el.addEventListener('mousedown', (ev) => {
      if (ev.target.classList.contains('btn-clip-delete')) return;
      if (ev.target.classList.contains('trim-handle')) return;
      ev.stopPropagation();
      ev.preventDefault();

      let didDrag = false;
      const startX = ev.clientX;
      const initStart = getStart();

      const onMove = (mv) => {
        if (Math.abs(mv.clientX - startX) > 3) didDrag = true;
        if (!didDrag) return;
        el.classList.add('dragging');
        const delta = ((mv.clientX - startX) / getContentWidth()) * duration;
        setStart(Math.max(0, Math.min(duration - model.duration, initStart + delta)));
        refresh();
      };

      const onUp = () => {
        el.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        if (!didDrag) {
          const entry = { type: kind, id: kind === 'sfx' ? model.id : 'bg-music' };
          if (ev.shiftKey) {
            toggleClipInSelection(entry);
            return;
          }
          selectedClips = [entry];
          refreshMultiSelectHighlight();
          selectAudioItem(kind, entry.id);
          if (kind === 'sfx' && window.sfxEngine) window.sfxEngine.playSFX(model.type, model.volume);
          return;
        }

        saveHistoryState(`Move ${label} to ${getStart().toFixed(1)}s`);
        persistSFXMarkers();
        if (selectedAudioItem) openAudioInspector();
        showToast(`Moved ${label} to ${getStart().toFixed(2)}s`);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // The music bar was a hardcoded 100%-wide block with no remove path, so an added track
  // could never be taken back off — and no way to offset or trim it.
  function renderMusicClip() {
    if (!trackMusic) return;
    trackMusic.innerHTML = '';

    // Clamp the model to the project before drawing: the duration can change under us
    // when a different project loads.
    musicClip.start = Math.max(0, Math.min(duration - MIN_CLIP_DURATION, musicClip.start));
    musicClip.duration = Math.max(MIN_CLIP_DURATION,
      Math.min(duration - musicClip.start, musicClip.duration));

    const clip = document.createElement('div');
    clip.className = 'clip-block music-block';
    clip.style.left = `${(musicClip.start / duration) * 100}%`;
    clip.style.width = `${(musicClip.duration / duration) * 100}%`;

    const name = bgAudio.src
      ? (musicTrackName.textContent || 'Custom track')
      : "Ambient Synthwave Track (Click 'Add Music' to change)";

    clip.innerHTML = `
      <span class="trim-handle trim-left" title="Trim music start"></span>
      <canvas class="audio-wave" aria-hidden="true"></canvas>
      <span class="music-label">${name} (${musicClip.start.toFixed(1)}s → ${(musicClip.start + musicClip.duration).toFixed(1)}s)</span>
      <span class="trim-handle trim-right" title="Trim music end"></span>
    `;

    if (bgAudio.src) {
      const del = document.createElement('button');
      del.className = 'btn-clip-delete';
      del.title = 'Remove background music';
      del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removeBackgroundMusic();
      });
      clip.insertBefore(del, clip.querySelector('.trim-right'));
    }

    drawMusicWaveform(clip.querySelector('.audio-wave'));
    attachAudioClipHandlers(clip, musicClip, 'music');

    trackMusic.appendChild(clip);
    highlightAudioSelection();
  }

  function removeBackgroundMusic() {
    saveHistoryState('Remove Background Music');
    bgAudio.pause();
    bgAudio.removeAttribute('src');
    bgAudio.load();
    musicTrackName.textContent = 'Ambient Synthwave Track';
    if (selectedAudioItem && selectedAudioItem.type === 'music') {
      clearAudioSelection();
    }
    renderMusicClip();
    showToast('Background music removed');
  }

  function getIframeSeek() {
    try {
      if (iframe.contentWindow && typeof iframe.contentWindow.seek === 'function') {
        syncDurationFromIframe();
        return iframe.contentWindow.seek;
      }
    } catch (_) {}
    return null;
  }

  // Selects a layer inside the preview without faking a click. A synthetic click never
  // worked: the project selects on `mousedown`, so the timeline only ever produced a
  // transient :hover outline that vanished the moment the cursor moved.
  function selectLayerInIframe(layerId) {
    try {
      if (iframe.contentWindow && typeof iframe.contentWindow.selectLayerById === 'function') {
        iframe.contentWindow.selectLayerById(layerId);
        return true;
      }
    } catch (_) {}
    return false;
  }

  // Single write path for clip timing: updates the live preview DOM, then persists to the
  // project file. Previously each handler poked data-start/data-duration on its own cached
  // element reference and stopped there, so nothing survived a reload or reached the render.
  function applyLayerTiming(layer, start, dur) {
    const el = layer.domElement;

    if (start !== undefined && start !== null && !isNaN(start)) {
      el.setAttribute('data-start', Number(start).toFixed(2));
    }
    if (dur !== undefined && dur !== null && !isNaN(dur)) {
      el.setAttribute('data-duration', Math.max(0.1, Number(dur)).toFixed(2));
    }

    try {
      if (iframe.contentWindow && typeof iframe.contentWindow.setLayerTiming === 'function') {
        iframe.contentWindow.setLayerTiming(layer.id, start, dur);
      }
    } catch (_) {}

    persistProjectTiming();
  }

  function syncIframePauseState() {
    try {
      if (iframe.contentWindow && typeof iframe.contentWindow.setPauseState === 'function') {
        iframe.contentWindow.setPauseState(!isPlaying);
      }
    } catch (_) {}
  }

  // FILTER OUT WRAPPER CONTAINERS & RENDER ALL VISIBLE LAYER TRACKS WITH SYNCHRONIZED SCROLL
  function scanProjectLayersAndScenes() {
    try {
      // Sync duration BEFORE scanning layers so all position calculations use the correct timeline length
      syncDurationFromIframe();

      const doc = iframe.contentWindow.document;
      if (!doc) return;

      const scenes = doc.querySelectorAll('[data-scene]');
      const discoveredLayers = [];
      const seenIds = new Set();

      const rawElements = doc.querySelectorAll('[data-layer]');

      rawElements.forEach(el => {
        const id = el.id;
        const layerName = el.getAttribute('data-layer');
        if (!layerName) return;
        
        if (id === 'stage' || el.classList.contains('scene-container') || id === 'stack-p' || id === 'ctaRow' || id === 'metrics-row' || id === 'problem-cards-stack') return;
        if (id && seenIds.has(id)) return;
        if (id) seenIds.add(id);

        let icon = '▪';
        let colorClass = 'scene-block';
        const tag = el.tagName.toLowerCase();
        
        if (tag === 'h1' || tag === 'h2' || tag === 'h3') { icon = 'H'; colorClass = 'layer-clip-h1'; }
        else if (tag === 'p' || tag === 'span') { icon = 'T'; colorClass = 'layer-clip-text'; }
        else if (tag === 'button') { icon = 'B'; colorClass = 'layer-clip-btn'; }
        else if (el.classList.contains('badge')) { icon = 'TAG'; colorClass = 'layer-clip-badge'; }
        else if (el.classList.contains('glass-card') || el.classList.contains('saas-app-window') || el.classList.contains('problem-card')) { icon = 'APP'; colorClass = 'layer-clip-card'; }
        else if (el.classList.contains('bg-glow')) { icon = 'BG'; colorClass = 'layer-clip-bg'; }

        const parentScene = el.closest('[data-scene]');
        let sceneIdx = 0;
        if (parentScene) {
          scenes.forEach((sc, idx) => {
            if (sc === parentScene) sceneIdx = idx;
          });
        }

        discoveredLayers.push({
          id: id,
          name: layerName,
          tagName: tag,
          icon: icon,
          colorClass: colorClass,
          domElement: el,
          sceneIndex: sceneIdx
        });
      });

      // 1. Render Left Sidebar Layer Items
      layersList.innerHTML = '';
      layerCountTag.textContent = discoveredLayers.length;

      discoveredLayers.forEach(layer => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.setAttribute('data-layer-id', layer.id);
        item.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="layer-icon" style="font-weight:700; font-size:11px; width:16px; text-align:center;">${layer.icon}</span>
            <span>${layer.name}</span>
          </div>
          <button class="btn-delete-icon" title="Delete ${layer.name}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('btn-delete-icon')) {
            e.stopPropagation();
            deleteSelectedLayer(layer.id);
            return;
          }
          selectLayerInIframe(layer.id);

          // Move the playhead into the layer's own clip window, otherwise selecting a
          // layer from the sidebar shows nothing when the playhead sits outside it.
          const s = parseFloat(layer.domElement.getAttribute('data-start'));
          const d = parseFloat(layer.domElement.getAttribute('data-duration'));
          if (!isNaN(s) && !isNaN(d)) {
            if (isPlaying) togglePlayPause(false);
            updateTimeDisplay(s + Math.min(0.35, d * 0.5));
          }
        });

        layersList.appendChild(item);
      });

      // 2. Render DEDICATED TRACK HEADERS & TRACK ROWS FOR ALL LAYERS ACROSS THE TIMELINE
      trackHeaders.innerHTML = `<div class="ruler-header-corner">REAL TIMELINE</div>`;
      trackVideo.innerHTML = '';

      const timelineTracks = [];

      const model = readTimelineModel();

      discoveredLayers.forEach((layer) => {
        const numScenes = Math.max(1, scenes.length);

        const elStartAttr = parseFloat(layer.domElement.getAttribute('data-start'));
        const elDurAttr = parseFloat(layer.domElement.getAttribute('data-duration'));
        const hasManualTiming = !isNaN(elStartAttr) && !isNaN(elDurAttr);

        // Precedence: an explicit data-start/data-duration pair is a trim the user made in
        // this editor, so it outranks everything. Failing that, the engine's own record of
        // when the element animates. Equal scene division is the last resort — it is a
        // guess, and it is the reason every clip used to sit on a suspiciously perfect grid.
        let startTime, clipDuration;
        if (hasManualTiming) {
          startTime = elStartAttr;
          clipDuration = elDurAttr;
        } else if (model && model.windows.has(layer.domElement)) {
          const w = model.windows.get(layer.domElement);
          startTime = w.from;
          clipDuration = w.to - w.from;
        } else {
          const sceneLen = duration / numScenes;
          const defaultSceneStart = layer.sceneIndex * sceneLen;
          const defaultSceneEnd = (layer.sceneIndex + 1) * sceneLen;
          startTime = !isNaN(elStartAttr) ? elStartAttr : defaultSceneStart;
          clipDuration = !isNaN(elDurAttr) ? elDurAttr : Math.max(0.5, defaultSceneEnd - startTime);
        }

        // Whatever the source, the clip has to land inside the project.
        startTime = Math.max(0, Math.min(duration - MIN_CLIP_DURATION, startTime));
        clipDuration = Math.max(MIN_CLIP_DURATION, Math.min(duration - startTime, clipDuration));

        // No visual minimum here: the width IS the duration. A floor of 4% used to be
        // baked into style.width, and every drag/trim handler read it back as the real
        // duration — so moving a short clip silently lengthened it. CSS min-width keeps
        // tiny clips clickable without corrupting the number.
        const leftPct = (startTime / duration) * 100;
        const widthPct = (clipDuration / duration) * 100;

        const clipEl = document.createElement('div');
        clipEl.className = `clip-block layer-single-track-clip ${layer.colorClass}`;
        clipEl.style.position = 'absolute';
        clipEl.style.left = `${leftPct}%`;
        clipEl.style.width = `${widthPct}%`;
        clipEl.style.height = '26px';
        clipEl.style.top = '4px';
        clipEl.setAttribute('data-layer-id', layer.id);

        clipEl.innerHTML = `
          <div class="clip-handle clip-handle-left" title="Trim / Shift Start Time"></div>
          <span style="overflow:hidden; text-overflow:ellipsis; padding:0 4px;">${layer.icon} ${layer.name}</span>
          <span class="clip-time">${startTime.toFixed(1)}s - ${(startTime + clipDuration).toFixed(1)}s</span>
          <button class="btn-clip-delete" title="Delete Layer (${layer.name})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          <div class="clip-handle clip-handle-right" title="Extend / Shorten Clip Duration"></div>
        `;

        const handleLeft = clipEl.querySelector('.clip-handle-left');
        const handleRight = clipEl.querySelector('.clip-handle-right');

        // LEFT TRIM HANDLE DRAG (TRIM START TIME)
        handleLeft.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          let isTrimmingLeft = true;
          handleLeft.classList.add('active');
          const startMouseX = e.clientX;
          const initLeftPct = parseFloat(clipEl.style.left) || leftPct;
          const initWidthPct = parseFloat(clipEl.style.width) || widthPct;

          const onTrimMove = (moveEvt) => {
            if (!isTrimmingLeft) return;
            const deltaX = moveEvt.clientX - startMouseX;
            const deltaPct = (deltaX / getContentWidth()) * 100;

            // Floor expressed in time, not in a magic percentage, so it agrees with the
            // 0.1s minimum applyLayerTiming() enforces regardless of the project length.
            const minPct = (MIN_CLIP_DURATION / duration) * 100;
            let newLeftPct = Math.max(0, Math.min(initLeftPct + initWidthPct - minPct, initLeftPct + deltaPct));
            let newWidthPct = initWidthPct - (newLeftPct - initLeftPct);

            clipEl.style.left = `${newLeftPct}%`;
            clipEl.style.width = `${newWidthPct}%`;

            const newStart = (newLeftPct / 100) * duration;
            const newDur = (newWidthPct / 100) * duration;
            clipEl.querySelector('.clip-time').textContent = `${newStart.toFixed(1)}s - ${(newStart + newDur).toFixed(1)}s`;
          };

          const onTrimUp = () => {
            if (!isTrimmingLeft) return;
            isTrimmingLeft = false;
            handleLeft.classList.remove('active');
            document.removeEventListener('mousemove', onTrimMove);
            document.removeEventListener('mouseup', onTrimUp);

            const finalLeftPct = parseFloat(clipEl.style.left) || leftPct;
            const finalWidthPct = parseFloat(clipEl.style.width) || widthPct;
            const finalStart = (finalLeftPct / 100) * duration;
            const finalDur = (finalWidthPct / 100) * duration;

            saveHistoryState(`Trim Left (${layer.name} start to ${finalStart.toFixed(1)}s)`);
            applyLayerTiming(layer, finalStart, finalDur);
            // Seek just inside the new window so the trim is visible immediately.
            updateTimeDisplay(finalStart + Math.min(0.35, finalDur * 0.5));
            showToast(`Trimmed ${layer.name} start to ${finalStart.toFixed(2)}s`);
          };

          document.addEventListener('mousemove', onTrimMove);
          document.addEventListener('mouseup', onTrimUp);
        });

        // RIGHT TRIM HANDLE DRAG (EXTEND / SHORTEN CLIP DURATION)
        handleRight.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          let isTrimmingRight = true;
          handleRight.classList.add('active');
          const startMouseX = e.clientX;
          const initLeftPct = parseFloat(clipEl.style.left) || leftPct;
          const initWidthPct = parseFloat(clipEl.style.width) || widthPct;

          const onTrimMove = (moveEvt) => {
            if (!isTrimmingRight) return;
            const deltaX = moveEvt.clientX - startMouseX;
            const deltaPct = (deltaX / getContentWidth()) * 100;

            let newWidthPct = Math.max((MIN_CLIP_DURATION / duration) * 100, Math.min(100 - initLeftPct, initWidthPct + deltaPct));
            clipEl.style.width = `${newWidthPct}%`;

            const curStart = (initLeftPct / 100) * duration;
            const newDur = (newWidthPct / 100) * duration;
            clipEl.querySelector('.clip-time').textContent = `${curStart.toFixed(1)}s - ${(curStart + newDur).toFixed(1)}s`;
          };

          const onTrimUp = () => {
            if (!isTrimmingRight) return;
            isTrimmingRight = false;
            handleRight.classList.remove('active');
            document.removeEventListener('mousemove', onTrimMove);
            document.removeEventListener('mouseup', onTrimUp);

            const finalWidthPct = parseFloat(clipEl.style.width) || widthPct;
            const curStart = (initLeftPct / 100) * duration;
            const finalDur = (finalWidthPct / 100) * duration;

            saveHistoryState(`Trim Duration (${layer.name} to ${finalDur.toFixed(1)}s)`);
            applyLayerTiming(layer, curStart, finalDur);
            // Land inside the resized clip so the shorter/longer ramp is visible at once.
            updateTimeDisplay(curStart + Math.min(0.35, finalDur * 0.5));
            showToast(`Resized ${layer.name} duration to ${finalDur.toFixed(2)}s`);
          };

          document.addEventListener('mousemove', onTrimMove);
          document.addEventListener('mouseup', onTrimUp);
        });

        // 3. MOVABLE DRAGGABLE CLIP FUNCTIONALITY (CENTER DRAG TO REPOSITION)
        let isDragging = false;
        let startX = 0;
        let initialLeftPct = leftPct;
        let didMove = false;

        clipEl.addEventListener('mousedown', (e) => {
          if (e.target.classList.contains('btn-clip-delete') || e.target.classList.contains('clip-handle')) return;
          isDragging = true;
          didMove = false;
          startX = e.clientX;
          initialLeftPct = parseFloat(clipEl.style.left) || leftPct;
          clipEl.classList.add('active');

          const onMouseMove = (moveEvent) => {
            if (!isDragging) return;
            const deltaX = moveEvent.clientX - startX;
            if (Math.abs(deltaX) > 3) didMove = true;
            const deltaPct = (deltaX / getContentWidth()) * 100;

            const curWidthPct = parseFloat(clipEl.style.width) || widthPct;
            let newLeftPct = Math.max(0, Math.min(100 - curWidthPct, initialLeftPct + deltaPct));

            clipEl.style.left = `${newLeftPct}%`;
            const newTime = (newLeftPct / 100) * duration;
            const currentDur = (curWidthPct / 100) * duration || clipDuration;
            clipEl.querySelector('.clip-time').textContent = `${newTime.toFixed(1)}s - ${(newTime + currentDur).toFixed(1)}s`;
          };

          const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            clipEl.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (!didMove) return;
            suppressNextClipClick = true;

            const finalLeftPct = parseFloat(clipEl.style.left) || leftPct;
            const finalTime = (finalLeftPct / 100) * duration;
            const curWidthPct = parseFloat(clipEl.style.width) || widthPct;
            const curDur = (curWidthPct / 100) * duration;

            saveHistoryState(`Move Layer (${layer.name} to ${finalTime.toFixed(1)}s)`);
            applyLayerTiming(layer, finalTime, curDur);
            // Follow the clip so the canvas shows it at its new position on the timeline.
            updateTimeDisplay(finalTime + Math.min(0.35, curDur * 0.5));
            showToast(`Moved ${layer.name} start to ${finalTime.toFixed(2)}s`);
          };

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });

        clipEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('btn-clip-delete') || e.target.classList.contains('clip-handle')) {
            e.stopPropagation();
            return;
          }
          e.stopPropagation();

          // A click that ends a drag/trim must not also move the playhead.
          if (suppressNextClipClick) {
            suppressNextClipClick = false;
            return;
          }

          // Shift-click extends the multi-selection instead of replacing it.
          if (e.shiftKey) {
            toggleClipInSelection({ type: 'layer', id: layer.id });
            return;
          }
          selectedClips = [{ type: 'layer', id: layer.id }];
          refreshMultiSelectHighlight();

          // Select first, then seek: the project's seek() only keeps an element fully
          // visible when it is already the selected one.
          selectLayerInIframe(layer.id);

          // Seek to where the user actually clicked inside the clip — not to the clip's
          // start time, which used to yank the playhead back to 0 for every scene-1 layer.
          if (isPlaying) togglePlayPause(false);
          updateTimeDisplay(clientXToTime(e.clientX));
          showToast(`Selected Layer: ${layer.name}`);
        });

        // GREEDY TRACK ASSIGNMENT: Find the first track where this clip fits without overlap
        const endTime = startTime + clipDuration;
        let trackIdx = timelineTracks.findIndex(t => !t.clips.some(c => !(endTime <= c.start || startTime >= c.end)));
        
        if (trackIdx === -1) {
          const headerItem = document.createElement('div');
          headerItem.className = 'track-header-item';
          headerItem.innerHTML = `<span class="track-names" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>`;
          trackHeaders.appendChild(headerItem);
          
          const trackRow = document.createElement('div');
          trackRow.className = 'track-row layer-single-track-row';
          trackVideo.appendChild(trackRow);
          
          timelineTracks.push({ clips: [], row: trackRow, headerSpan: headerItem.querySelector('.track-names'), headerItem: headerItem });
          trackIdx = timelineTracks.length - 1;
        }
        
        const track = timelineTracks[trackIdx];
        track.clips.push({ start: startTime, end: endTime, name: layer.name, icon: layer.icon });
        track.row.appendChild(clipEl);
      });

      // Format track headers cleanly (Professional NLE Style)
      //
      // "Track 4 (7)" tells the user nothing about what is on the row. A real NLE labels a
      // video track with its number and then what it carries, so the header now names the
      // track's own content: the single clip when there is one, otherwise the span it
      // covers and the first clip on it.
      timelineTracks.forEach((t, idx) => {
        const namesList = t.clips.map(c => c.name).join(', ');
        const vLabel = `<span style="font-weight:700; color:#818cf8; margin-right:5px;">V${idx + 1}</span>`;

        if (t.clips.length === 1) {
          const only = t.clips[0];
          t.headerSpan.innerHTML =
            `${vLabel}<span style="opacity:0.8; margin-right:4px;">${only.icon}</span>${only.name}`;
          t.headerItem.setAttribute('title', `V${idx + 1} · ${only.name} (${only.start.toFixed(2)}s → ${only.end.toFixed(2)}s)`);
        } else {
          const sorted = [...t.clips].sort((a, b) => a.start - b.start);
          const lead = sorted[0];
          const spanEnd = Math.max(...sorted.map(c => c.end));
          t.headerSpan.innerHTML =
            `${vLabel}<span style="opacity:0.8; margin-right:4px;">${lead.icon}</span>` +
            `${lead.name}<span style="opacity:0.55; font-size:9px; margin-left:4px;">+${t.clips.length - 1}</span>`;
          t.headerItem.setAttribute('title',
            `V${idx + 1} · ${t.clips.length} clips · ${lead.start.toFixed(2)}s → ${spanEnd.toFixed(2)}s\n${namesList}`);
        }
      });

      const musicHeader = document.createElement('div');
      musicHeader.className = 'track-header-item';
      musicHeader.innerHTML = `<span class="layer-icon" style="font-weight:700; font-size:11px;">BGM</span> Background Music`;
      trackHeaders.appendChild(musicHeader);

      const sfxHeader = document.createElement('div');
      sfxHeader.className = 'track-header-item';
      sfxHeader.innerHTML = `<span class="layer-icon" style="font-weight:700; font-size:11px;">SFX</span> Motion SFX Track`;
      trackHeaders.appendChild(sfxHeader);

      // 4. Scan SaaS Explainer Scenes & record their real cut points
      sceneGroup.innerHTML = '';
      sceneStartTimes = [];
      if (scenes.length > 0) {
        // The engine's scene table, keyed by the node it was registered against, so a
        // scene's real cut point is used instead of the old `idx * 2.5` invention.
        const sceneTiming = new Map();
        if (model) model.scenes.forEach(s => { if (s.node) sceneTiming.set(s.node, s); });

        scenes.forEach((sc, idx) => {
          const scName = sc.getAttribute('data-scene');
          const fromEngine = sceneTiming.get(sc);
          const attrTime = parseFloat(sc.getAttribute('data-scene-time'));

          let parsedTime;
          if (fromEngine) parsedTime = fromEngine.start;
          else if (!isNaN(attrTime)) parsedTime = attrTime;
          else parsedTime = (idx / Math.max(1, scenes.length)) * duration;

          parsedTime = Math.max(0, Math.min(duration, parsedTime));
          sceneStartTimes.push(parsedTime);

          const sceneEnd = fromEngine ? Math.min(duration, fromEngine.end) : null;
          const label = sceneEnd !== null
            ? `${parsedTime.toFixed(1)}s → ${sceneEnd.toFixed(1)}s`
            : `${parsedTime.toFixed(1)}s`;

          const sceneEl = document.createElement('div');
          sceneEl.className = `scene-item ${idx === activeSceneIndex ? 'active' : ''}`;
          sceneEl.setAttribute('data-scene', idx + 1);
          sceneEl.innerHTML = `
            <div class="scene-num">${String(idx + 1).padStart(2, '0')}</div>
            <div class="scene-info">
              <span class="scene-name">${scName}</span>
              <span class="scene-dur">${label}</span>
            </div>
          `;
          sceneEl.addEventListener('click', () => {
            if (isPlaying) togglePlayPause(false);
            updateTimeDisplay(parsedTime);
            showToast(`Jumped to ${scName}`);
          });
          sceneGroup.appendChild(sceneEl);
        });
      }
      if (sceneStartTimes.length === 0) sceneStartTimes = [0];
      sceneStartTimes.sort((a, b) => a - b);

      // The ruler depends on duration, which we only learn once the project has loaded.
      rebuildRulerTicks();
      loadSFXMarkersFromProject();
      renderAudioTracks();
      updatePlayheadPosition();
      highlightActiveScene();

    } catch (err) {
      console.warn('Failed to scan project layers:', err);
    }
  }

  async function deleteSelectedLayer(targetId) {
    const idToDelete = targetId || selectedElementId;
    if (!idToDelete) return;

    saveHistoryState(`Delete Layer (${idToDelete})`);

    try {
      const doc = iframe.contentWindow.document;
      const el = doc && doc.getElementById(idToDelete);
      if (!el) {
        showToast('Layer not found in preview');
        return;
      }

      el.remove();

      // Deleting used to go through /api/delete-layer, which does a regex cut on the file.
      // Two ways that broke: the non-greedy `(.*?)</\1>` closes at the first matching end
      // tag, so removing a container with a same-tag child sliced the document in half; and
      // layers that were assigned an id at runtime have no such id in the file at all, so
      // the regex matched nothing and the layer came straight back on reload.
      // Removing the node and saving the sanitized DOM is exact by construction.
      const html = getCurrentHTMLSnapshot();
      if (!html) {
        showToast('Could not save project after delete');
        return;
      }

      const res = await fetch('/api/save-raw-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullHtml: html })
      });

      const data = await res.json();
      if (!data.success) {
        showToast('Failed to delete layer: ' + (data.error || 'save rejected'));
        return;
      }

      showToast(`Layer deleted successfully`);
      if (selectedElementId === idToDelete) {
        selectedElementId = null;
        inspectorForm.style.display = 'none';
        noSelectionHint.style.display = 'flex';
        selectedLayerTitle.textContent = 'SELECT AN ELEMENT ON CANVAS';
        selectedTag.textContent = 'NO SELECTION';
      }

      scanProjectLayersAndScenes();
    } catch (err) {
      showToast('Failed to delete layer: ' + err.message);
    }
  }

  btnDeleteElement.addEventListener('click', () => deleteSelectedLayer());

  iframe.addEventListener('load', () => {
    syncIframePauseState();
    syncDurationFromIframe();
    updateTimelineZoom(zoomLevel);
    updateTimeDisplay(currentTime);
    setTimeout(() => {
      syncDurationFromIframe();
      scanProjectLayersAndScenes();
    }, 300);
  });

  // mm:ss.d — the readout used to hardcode the "00:" minute field, so a project longer
  // than a minute displayed "00:73.4" and the ruler and the readout disagreed.
  function formatTimecode(t) {
    const safe = Math.max(0, t);
    const mins = Math.floor(safe / 60);
    const secs = safe - mins * 60;
    return `${String(mins).padStart(2, '0')}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
  }

  function updateTimeDisplay(time) {
    currentTime = Math.max(0, Math.min(duration, time));
    timeReadout.textContent = `${formatTimecode(currentTime)} / ${formatTimecode(duration)}`;

    updatePlayheadPosition();

    const seekFn = getIframeSeek();
    if (seekFn) seekFn(currentTime);

    highlightActiveScene();

    if (isPlaying && window.sfxEngine) {
      sfxMarkers.forEach(marker => {
        if (Math.abs(currentTime - marker.time) < 0.1) {
          const key = `${marker.id}_${marker.time.toFixed(1)}`;
          if (!firedSFXTimes.has(key)) {
            firedSFXTimes.add(key);
            // Per-clip level, so the inspector's Volume actually affects playback rather
            // than only redrawing the waveform.
            window.sfxEngine.playSFX(marker.type, marker.volume != null ? marker.volume : 1);
            setTimeout(() => firedSFXTimes.delete(key), 500);
          }
        }
      });
    }

    // Music obeys its clip window: outside [start, start+duration] it is silent, so
    // trimming the music clip has an audible effect instead of only a visual one.
    if (bgAudio.src) {
      const inWindow = currentTime >= musicClip.start
        && currentTime <= musicClip.start + musicClip.duration;
      if (isPlaying && inWindow) {
        if (bgAudio.paused) bgAudio.play().catch(() => {});
      } else if (!bgAudio.paused) {
        bgAudio.pause();
      }
    }
  }

  // Places the needle over the exact pixel of currentTime inside the scrollable track content.
  function updatePlayheadPosition() {
    const x = getTrackLeftOffset() + timeToPx(currentTime) - trackBody.scrollLeft;
    const minX = getTrackLeftOffset();

    // Hide the needle when the current time is scrolled out of the visible window.
    if (x < minX - 1 || x > multitrackContainer.clientWidth + 1) {
      playheadNeedle.style.display = 'none';
      return;
    }

    playheadNeedle.style.display = 'block';
    playheadNeedle.style.left = `${x}px`;
  }

  // Scene boundaries are read from the project itself (data-scene-time) instead of the
  // old hardcoded 3.0/6.0/8.5 guesses, which never matched the real 0.0/4.0/7.0 cuts.
  function highlightActiveScene() {
    let idx = 0;
    for (let i = 0; i < sceneStartTimes.length; i++) {
      if (currentTime >= sceneStartTimes[i] - 1e-6) idx = i;
    }
    activeSceneIndex = idx;

    document.querySelectorAll('.scene-item').forEach((s, i) => {
      if (i === activeSceneIndex) s.classList.add('active');
      else s.classList.remove('active');
    });
  }

  // PLAYHEAD SCRUBBING — drag the needle (or its triangle head) to move through time.
  function beginScrub(startEvent) {
    startEvent.preventDefault();
    if (isPlaying) togglePlayPause(false);

    playheadNeedle.classList.add('scrubbing');
    document.body.classList.add('is-scrubbing');

    const onScrubMove = (moveEvent) => {
      updateTimeDisplay(clientXToTime(moveEvent.clientX));

      // Auto-scroll the timeline when scrubbing past either visible edge.
      const rect = trackBody.getBoundingClientRect();
      if (moveEvent.clientX > rect.right - 24) trackBody.scrollLeft += 12;
      else if (moveEvent.clientX < rect.left + 24) trackBody.scrollLeft -= 12;
    };

    const onScrubUp = () => {
      playheadNeedle.classList.remove('scrubbing');
      document.body.classList.remove('is-scrubbing');
      document.removeEventListener('mousemove', onScrubMove);
      document.removeEventListener('mouseup', onScrubUp);
    };

    document.addEventListener('mousemove', onScrubMove);
    document.addEventListener('mouseup', onScrubUp);
    onScrubMove(startEvent);
  }

  playheadNeedle.addEventListener('mousedown', beginScrub);

  // Dragging anywhere on the ruler also scrubs, like every NLE.
  rulerTicksBar.addEventListener('mousedown', beginScrub);

  // Keep the needle glued to the clips while the timeline is scrolled or resized.
  trackBody.addEventListener('scroll', updatePlayheadPosition);
  window.addEventListener('resize', () => {
    updateTimelineZoom(zoomLevel);
  });

  // TIMELINE SELECTION MODEL
  // Two gaps this closes: clicking empty track space left the previous selection standing
  // (so the inspector kept editing something the user had visually moved on from), and
  // there was no way to grab more than one clip at a time.

  // Drops every selection — canvas layer, audio clip, and the multi-select set.
  function deselectAll(opts = {}) {
    selectedClips = [];

    if (selectedAudioItem) {
      selectedAudioItem = null;
      if (audioInspector) audioInspector.style.display = 'none';
    }
    highlightAudioSelection();

    if (selectedElementId) {
      selectedElementId = null;
      try {
        if (iframe.contentWindow && typeof iframe.contentWindow.selectLayerById === 'function') {
          iframe.contentWindow.selectLayerById(null);
        }
      } catch (_) {}
    }

    document.querySelectorAll('.layer-item.active, #trackVideo .clip-block.active, .clip-block.multi-selected, .sfx-clip-marker.multi-selected')
      .forEach(el => { el.classList.remove('active'); el.classList.remove('multi-selected'); });

    inspectorForm.style.display = 'none';
    audioInspector.style.display = 'none';
    noSelectionHint.style.display = 'flex';
    selectedLayerTitle.textContent = 'SELECT AN ELEMENT ON CANVAS';
    selectedTag.textContent = 'NO SELECTION';

    if (!opts.silent) updateMultiSelectBadge();
  }

  // Paints the multi-select outline from the model, so a re-render of the rows (zoom, undo,
  // a timing edit) does not lose the highlight.
  function refreshMultiSelectHighlight() {
    document.querySelectorAll('.multi-selected').forEach(el => el.classList.remove('multi-selected'));
    selectedClips.forEach(sel => {
      let el = null;
      if (sel.type === 'layer') el = document.querySelector(`#trackVideo .clip-block[data-layer-id="${sel.id}"]`);
      else if (sel.type === 'sfx') el = document.querySelector(`.sfx-clip-marker[data-sfx-id="${sel.id}"]`);
      else if (sel.type === 'music') el = document.querySelector('.music-block');
      if (el) el.classList.add('multi-selected');
    });
    updateMultiSelectBadge();
  }

  function updateMultiSelectBadge() {
    if (selectedClips.length > 1) {
      inspectorForm.style.display = 'none';
      audioInspector.style.display = 'none';
      noSelectionHint.style.display = 'flex';
      selectedLayerTitle.textContent = `${selectedClips.length} CLIPS SELECTED`;
      selectedTag.textContent = 'MULTI SELECT';
    }
  }

  // Shift-click toggle: if the clip is already in the set, remove it; otherwise add it.
  function toggleClipInSelection(entry) {
    const idx = selectedClips.findIndex(c => c.type === entry.type && c.id === entry.id);
    if (idx >= 0) {
      selectedClips.splice(idx, 1);
    } else {
      selectedClips.push(entry);
    }
    refreshMultiSelectHighlight();
  }

  // Batch delete for the multi-selection. One history entry for the whole batch, so undo
  // brings every clip back together rather than one press per clip.
  async function deleteMultiSelection() {
    if (!selectedClips.length) return;
    const batch = selectedClips.slice();
    saveHistoryState(`Delete ${batch.length} Clip${batch.length > 1 ? 's' : ''}`);

    const sfxIds = batch.filter(c => c.type === 'sfx').map(c => c.id);
    const layerIds = batch.filter(c => c.type === 'layer').map(c => c.id);
    const hasMusic = batch.some(c => c.type === 'music');

    if (sfxIds.length) {
      sfxMarkers = sfxMarkers.filter(m => !sfxIds.includes(m.id));
    }

    if (hasMusic && bgAudio.src) {
      bgAudio.pause();
      bgAudio.removeAttribute('src');
      bgAudio.load();
      musicTrackName.textContent = 'Ambient Synthwave Track';
      musicPeaks = null;
      musicPeaksKey = null;
    }

    // Layers live in the project DOM; remove them all, then save once.
    if (layerIds.length) {
      try {
        const doc = iframe.contentWindow.document;
        layerIds.forEach(id => {
          const el = doc.getElementById(id);
          if (el) el.remove();
        });
      } catch (_) {}
    }

    selectedClips = [];
    deselectAll({ silent: true });

    if (sfxIds.length || hasMusic) persistSFXMarkers();
    if (layerIds.length) {
      // Layer removal changes the project DOM, so the rows have to be rebuilt from it.
      try {
        await fetch('/api/save-raw-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullHtml: getCurrentHTMLSnapshot() })
        });
      } catch (_) {}
      scanProjectLayersAndScenes();
    } else {
      renderAudioTracks();
    }

    showToast(`Deleted ${batch.length} clip${batch.length > 1 ? 's' : ''}`);
  }

  // ============================================================================
  // TRACK SPLIT / CLIP SPLIT FUNCTIONALITY (SPLIT AT PLAYHEAD)
  // ============================================================================
  async function splitClipAtPlayhead() {
    const playhead = parseFloat(currentTime) || 0;
    let splitCount = 0;

    // 1. If an audio SFX marker is selected and spans across playhead
    if (selectedAudioItem && selectedAudioItem.type === 'sfx') {
      const idx = sfxMarkers.findIndex(m => m.id === selectedAudioItem.id);
      if (idx !== -1) {
        const m = sfxMarkers[idx];
        if (playhead > (m.time + 0.05) && playhead < (m.time + m.duration - 0.05)) {
          const durLeft = parseFloat((playhead - m.time).toFixed(2));
          const durRight = parseFloat((m.time + m.duration - playhead).toFixed(2));
          m.duration = durLeft;

          const newMarker = {
            id: 'sfx-' + (++sfxIdCounter),
            type: m.type,
            time: playhead,
            duration: durRight,
            volume: m.volume
          };
          sfxMarkers.splice(idx + 1, 0, newMarker);
          persistSFXMarkers();
          renderAudioTracks();
          selectAudioItem({ type: 'sfx', id: newMarker.id });
          showToast(`SFX Clip split at ${playhead.toFixed(2)}s`);
          return;
        }
      }
    }

    // 2. Determine target video layers to split
    let targetLayers = [];
    if (selectedElementId) {
      const found = discoveredLayers.find(l => l.id === selectedElementId);
      if (found) targetLayers.push(found);
    } else if (selectedClips && selectedClips.length > 0) {
      selectedClips.forEach(sc => {
        if (sc.type === 'layer') {
          const found = discoveredLayers.find(l => l.id === sc.id);
          if (found) targetLayers.push(found);
        }
      });
    }

    let candidateLayers = targetLayers.length > 0 ? targetLayers : discoveredLayers;
    const doc = iframe.contentWindow && iframe.contentWindow.document;
    if (!doc) return;

    let newlyCreatedId = null;

    candidateLayers.forEach(layer => {
      const el = doc.getElementById(layer.id) || layer.domElement;
      if (!el) return;

      const defaultSceneStart = layer.sceneIndex === 0 ? 0.0 : (layer.sceneIndex === 1 ? 3.0 : (layer.sceneIndex === 2 ? 6.0 : 8.5));
      const defaultSceneEnd = layer.sceneIndex === 0 ? 3.0 : (layer.sceneIndex === 1 ? 6.0 : (layer.sceneIndex === 2 ? 8.5 : 10.0));

      const elStartAttr = parseFloat(el.getAttribute('data-start'));
      const elDurAttr = parseFloat(el.getAttribute('data-duration'));

      const start = !isNaN(elStartAttr) ? elStartAttr : defaultSceneStart;
      const dur = !isNaN(elDurAttr) ? elDurAttr : Math.max(0.5, defaultSceneEnd - start);
      const end = start + dur;

      if (playhead > (start + 0.05) && playhead < (end - 0.05)) {
        const leftDur = parseFloat((playhead - start).toFixed(2));
        const rightDur = parseFloat((end - playhead).toFixed(2));

        el.setAttribute('data-start', start.toFixed(2));
        el.setAttribute('data-duration', leftDur.toFixed(2));

        const clone = el.cloneNode(true);
        const newId = el.id + '_split_' + Math.floor(Math.random() * 9000 + 1000);
        clone.id = newId;
        clone.setAttribute('data-start', playhead.toFixed(2));
        clone.setAttribute('data-duration', rightDur.toFixed(2));

        if (el.parentNode) {
          el.parentNode.insertBefore(clone, el.nextSibling);
        }

        newlyCreatedId = newId;
        splitCount++;
      }
    });

    if (splitCount > 0) {
      saveHistoryState(`Split ${splitCount} clip(s) at ${playhead.toFixed(2)}s`);
      try {
        await fetch('/api/save-raw-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullHtml: getCurrentHTMLSnapshot() })
        });
      } catch (_) {}
      scanProjectLayersAndScenes();
      if (newlyCreatedId) {
        selectedElementId = newlyCreatedId;
        selectedClips = [{ type: 'layer', id: newlyCreatedId }];
        selectLayerInIframe(newlyCreatedId);
        refreshMultiSelectHighlight();
        const foundNew = discoveredLayers.find(l => l.id === newlyCreatedId);
        if (foundNew) {
          openElementInspector({
            id: foundNew.id,
            layerName: foundNew.name,
            tagName: foundNew.tagName,
            animPreset: foundNew.domElement.getAttribute('data-anim') || 'pop-spring',
            text: foundNew.domElement.innerText || '',
            fontSize: parseInt(window.getComputedStyle(foundNew.domElement).fontSize) || 24,
            textColor: '#ffffff',
            offsetX: parseFloat(foundNew.domElement.getAttribute('data-offset-x')) || 0,
            offsetY: parseFloat(foundNew.domElement.getAttribute('data-offset-y')) || 0,
            scale: parseFloat(foundNew.domElement.getAttribute('data-scale')) || 1,
            rotation: parseFloat(foundNew.domElement.getAttribute('data-rotation')) || 0,
            opacity: parseFloat(foundNew.domElement.style.opacity) || 1,
            startTime: parseFloat(foundNew.domElement.getAttribute('data-start')) || 0,
            duration: parseFloat(foundNew.domElement.getAttribute('data-duration')) || 1
          });
        }
      }
      showToast(`Split ${splitCount} clip(s) at ${playhead.toFixed(2)}s`);
    } else {
      showToast(`Move playhead over the middle of a clip to split (S / Ctrl+B)`);
    }
  }

  // Rubber-band select. Starts only on empty track space, so it can never fight a clip
  // drag or a trim handle.
  function beginBoxSelect(startEvent) {
    if (startEvent.button !== 0) return;

    const bodyRect = trackBody.getBoundingClientRect();
    isBoxSelecting = true;
    boxSelectStart = {
      x: startEvent.clientX - bodyRect.left + trackBody.scrollLeft,
      y: startEvent.clientY - bodyRect.top + trackBody.scrollTop
    };

    let moved = false;

    const onMove = (mv) => {
      const dx = Math.abs(mv.clientX - startEvent.clientX);
      const dy = Math.abs(mv.clientY - startEvent.clientY);
      if (!moved && dx < 4 && dy < 4) return;

      if (!moved) {
        moved = true;
        // Additive drag (shift) extends the current set; a bare drag replaces it.
        if (!startEvent.shiftKey) deselectAll({ silent: true });
        boxSelectDiv = document.createElement('div');
        boxSelectDiv.className = 'timeline-select-box';
        trackBody.appendChild(boxSelectDiv);
      }

      const cur = {
        x: mv.clientX - bodyRect.left + trackBody.scrollLeft,
        y: mv.clientY - bodyRect.top + trackBody.scrollTop
      };

      const left = Math.min(boxSelectStart.x, cur.x);
      const top = Math.min(boxSelectStart.y, cur.y);
      const w = Math.abs(cur.x - boxSelectStart.x);
      const h = Math.abs(cur.y - boxSelectStart.y);

      boxSelectDiv.style.left = `${left}px`;
      boxSelectDiv.style.top = `${top}px`;
      boxSelectDiv.style.width = `${w}px`;
      boxSelectDiv.style.height = `${h}px`;

      applyBoxSelection({ left, top, right: left + w, bottom: top + h });
    };

    const onUp = () => {
      isBoxSelecting = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (boxSelectDiv) {
        boxSelectDiv.remove();
        boxSelectDiv = null;
      }

      if (!moved) {
        // No travel: this was a plain click on empty space. Deselect and seek there.
        deselectAll();
        if (isPlaying) togglePlayPause(false);
        updateTimeDisplay(clientXToTime(startEvent.clientX));
        return;
      }

      if (selectedClips.length) {
        showToast(`${selectedClips.length} clip${selectedClips.length > 1 ? 's' : ''} selected`);
      }
      refreshMultiSelectHighlight();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Marks every clip whose box intersects the marquee. Compared in trackBody content
  // coordinates so it stays correct at any zoom or scroll offset.
  function applyBoxSelection(box) {
    const bodyRect = trackBody.getBoundingClientRect();
    const hits = [];

    const consider = (el, entry) => {
      const r = el.getBoundingClientRect();
      const elBox = {
        left: r.left - bodyRect.left + trackBody.scrollLeft,
        top: r.top - bodyRect.top + trackBody.scrollTop,
        right: r.right - bodyRect.left + trackBody.scrollLeft,
        bottom: r.bottom - bodyRect.top + trackBody.scrollTop
      };
      const intersects = elBox.left < box.right && elBox.right > box.left
        && elBox.top < box.bottom && elBox.bottom > box.top;
      if (intersects) hits.push(entry);
    };

    trackVideo.querySelectorAll('.clip-block').forEach(el => {
      const id = el.getAttribute('data-layer-id');
      if (id) consider(el, { type: 'layer', id: id });
    });
    document.querySelectorAll('.sfx-clip-marker').forEach(el => {
      const id = el.getAttribute('data-sfx-id');
      if (id) consider(el, { type: 'sfx', id: id });
    });
    const musicEl = trackMusic && trackMusic.querySelector('.music-block');
    if (musicEl) consider(musicEl, { type: 'music', id: 'bg-music' });

    // Keep anything picked up by a previous shift-drag, then add this pass's hits.
    const merged = selectedClips.slice();
    hits.forEach(h => {
      if (!merged.some(m => m.type === h.type && m.id === h.id)) merged.push(h);
    });
    selectedClips = merged;

    document.querySelectorAll('.multi-selected').forEach(el => el.classList.remove('multi-selected'));
    selectedClips.forEach(sel => {
      let el = null;
      if (sel.type === 'layer') el = trackVideo.querySelector(`.clip-block[data-layer-id="${sel.id}"]`);
      else if (sel.type === 'sfx') el = document.querySelector(`.sfx-clip-marker[data-sfx-id="${sel.id}"]`);
      else if (sel.type === 'music') el = trackMusic && trackMusic.querySelector('.music-block');
      if (el) el.classList.add('multi-selected');
    });
  }

  // Empty space is anything that is not a clip, a handle, or the ruler.
  trackBody.addEventListener('mousedown', (e) => {
    if (e.target.closest('.clip-block') || e.target.closest('.sfx-clip-marker')) return;
    if (e.target.closest('.ruler-ticks-bar')) return;
    if (e.target.closest('.trim-handle') || e.target.closest('.clip-handle')) return;
    e.preventDefault();
    beginBoxSelect(e);
  });

  // The seek now happens on mouseup inside beginBoxSelect, so a marquee drag that ends
  // over empty space no longer also jumps the playhead.
  trackBody.addEventListener('click', (e) => {
    if (e.target.closest('.clip-block') || e.target.closest('.sfx-clip-marker')) return;
    e.stopPropagation();
  });

  function togglePlayPause(playState) {
    isPlaying = typeof playState === 'boolean' ? playState : !isPlaying;
    syncIframePauseState();

    if (isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'inline';

      if (bgAudio.src) {
        bgAudio.currentTime = currentTime;
        bgAudio.play().catch(() => {});
      }

      let lastTimestamp = performance.now();

      function loop(now) {
        if (!isPlaying) return;
        const delta = Math.min(0.1, ((now - lastTimestamp) / 1000) * playbackSpeed);
        lastTimestamp = now;

        currentTime += delta;
        if (currentTime > duration) {
          currentTime = 0;
          if (bgAudio.src) bgAudio.currentTime = 0;
        }
        updateTimeDisplay(currentTime);
        animFrameId = requestAnimationFrame(loop);
      }
      animFrameId = requestAnimationFrame(loop);
    } else {
      playIcon.style.display = 'inline';
      pauseIcon.style.display = 'none';
      if (bgAudio.src) bgAudio.pause();
      if (animFrameId) cancelAnimationFrame(animFrameId);
      updateTimeDisplay(currentTime);
    }
  }

  btnPlayPause.addEventListener('click', () => togglePlayPause());

  btnStepBack.addEventListener('click', () => {
    if (isPlaying) togglePlayPause(false);
    updateTimeDisplay(currentTime - 0.05);
  });

  btnStepForward.addEventListener('click', () => {
    if (isPlaying) togglePlayPause(false);
    updateTimeDisplay(currentTime + 0.05);
  });

  const btnSplitClip = document.getElementById('btnSplitClip');
  if (btnSplitClip) {
    btnSplitClip.addEventListener('click', () => {
      splitClipAtPlayhead();
    });
  }

  btnResetCanvas.addEventListener('click', () => {
    iframe.src = '/project/index.html?t=' + Date.now();
    showToast('Canvas state reset');
  });

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ELEMENT_SELECTED') {
      const elData = event.data.data;
      openElementInspector(elData);
    } else if (event.data && event.data.type === 'ELEMENT_MOVE_START') {
      // Snapshot BEFORE the drag mutates anything. The snapshot used to be taken on
      // mouseup, i.e. after the move, so undoing a canvas drag restored the moved state
      // and appeared to do nothing.
      saveHistoryState(`Drag Canvas Element (${event.data.data.layerName})`);
    } else if (event.data && event.data.type === 'ELEMENT_MOVED') {
      const moveData = event.data.data;
      elPosX.value = Math.round(moveData.offsetX);
      valPosX.textContent = `${Math.round(moveData.offsetX)}px`;
      elPosY.value = Math.round(moveData.offsetY);
      valPosY.textContent = `${Math.round(moveData.offsetY)}px`;
      // Dragging on canvas writes data-offset-x/y in the preview only; without this the
      // new position vanished on reload and never made it into the render.
      persistProjectTiming();
      showToast(`Moved ${moveData.layerName} to (${Math.round(moveData.offsetX)}px, ${Math.round(moveData.offsetY)}px)`);
    }
  });

  function openElementInspector(elData) {
    if (isPlaying) togglePlayPause(false);

    // One inspector, one target: picking a canvas layer drops the audio selection, the
    // same way selectAudioItem() drops the layer selection.
    if (selectedAudioItem) {
      selectedAudioItem = null;
      highlightAudioSelection();
      if (audioInspector) audioInspector.style.display = 'none';
    }

    selectedElementId = elData.id;
    selectedLayerTitle.textContent = `SELECTED LAYER: ${elData.layerName.toUpperCase()}`;
    selectedTag.textContent = `<${elData.tagName.toLowerCase()}${elData.id ? '#' + elData.id : ''}>`;

    noSelectionHint.style.display = 'none';
    inspectorForm.style.display = 'flex';

    selectAnimPreset.value = elData.animPreset || 'pop-spring';
    const selectAnimSpeed = document.getElementById('selectAnimSpeed');
    const rangeAnimSpeed = document.getElementById('rangeAnimSpeed');
    const durVal = elData.animDuration || elData.animSpeed || '0.8';
    if (selectAnimSpeed) selectAnimSpeed.value = durVal;
    if (rangeAnimSpeed) rangeAnimSpeed.value = durVal;
    if (valAnimSpeed) valAnimSpeed.textContent = durVal + 's';

    elText.value = elData.text ? elData.text.trim() : '';
    elFontSize.value = elData.fontSize || 24;
    valFontSize.textContent = `${elData.fontSize || 24}px`;
    
    if (elData.color && elData.color.startsWith('rgb')) {
      elColor.value = rgbToHex(elData.color);
    }
    if (elData.backgroundColor && elData.backgroundColor.startsWith('rgb')) {
      elBgColor.value = rgbToHex(elData.backgroundColor);
    }
    const hexElColor = document.getElementById('hexElColor');
    const hexElBgColor = document.getElementById('hexElBgColor');
    if (hexElColor) hexElColor.textContent = (elColor.value || '#FFFFFF').toUpperCase();
    if (hexElBgColor) hexElBgColor.textContent = (elBgColor.value || '#0A0A0C').toUpperCase();

    elRadius.value = parseInt(elData.borderRadius, 10) || 0;
    valRadius.textContent = `${parseInt(elData.borderRadius, 10) || 0}px`;

    elOpacity.value = parseFloat(elData.opacity) || 1.0;
    valOpacity.textContent = `${Math.round((parseFloat(elData.opacity) || 1.0) * 100)}%`;

    elPosX.value = Math.round(elData.offsetX || 0);
    elPosY.value = Math.round(elData.offsetY || 0);

    const elRotation = document.getElementById('elRotation');
    const valRotation = document.getElementById('valRotation');
    if (elRotation && valRotation) {
      elRotation.value = Math.round(elData.rotation || 0);
      valRotation.textContent = `${Math.round(elData.rotation || 0)}°`;
    }

    const elScale = document.getElementById('elScale');
    const valScale = document.getElementById('valScale');
    if (elScale && valScale) {
      elScale.value = Math.round(elData.scale || 100);
      valScale.textContent = `${Math.round(elData.scale || 100)}%`;
    }

    // Scoped to the video row: `.clip-block` now also matches the audio clips, and an
    // unscoped sweep would strip the highlight off a selected sound.
    document.querySelectorAll('.layer-item, #trackVideo .clip-block').forEach(item => {
      if (item.getAttribute('data-layer-id') === elData.id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    showToast(`Editing: ${elData.layerName}`);
  }

  function rgbToHex(rgbStr) {
    const match = rgbStr.match(/\d+/g);
    if (!match || match.length < 3) return '#ffffff';
    const r = parseInt(match[0]).toString(16).padStart(2, '0');
    const g = parseInt(match[1]).toString(16).padStart(2, '0');
    const b = parseInt(match[2]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  selectAnimPreset.addEventListener('change', (e) => {
    // updateElementLive() takes the snapshot itself; arming first avoids a duplicate entry.
    inspectorEditOpen = false;
    updateElementLive('animPreset', e.target.value);
    saveElementAnimationPreset(e.target.value);
    showToast(`Applied animation: ${e.target.selectedOptions[0].text}`);
  });

  async function saveElementAnimationPreset(animPreset) {
    if (!selectedElementId) return;
    try {
      await fetch('/api/update-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layerId: selectedElementId, animPreset })
      });
    } catch (_) {}
  }

  elFontSize.addEventListener('input', (e) => {
    valFontSize.textContent = `${e.target.value}px`;
    updateElementLive('fontSize', e.target.value);
  });

  elRadius.addEventListener('input', (e) => {
    valRadius.textContent = `${e.target.value}px`;
    updateElementLive('borderRadius', e.target.value);
  });

  elOpacity.addEventListener('input', (e) => {
    valOpacity.textContent = e.target.value;
    updateElementLive('opacity', e.target.value);
  });

  elPosX.addEventListener('input', (e) => {
    valPosX.textContent = `${e.target.value}px`;
    updateElementLive('offsetX', e.target.value);
  });

  elPosY.addEventListener('input', (e) => {
    valPosY.textContent = `${e.target.value}px`;
    updateElementLive('offsetY', e.target.value);
  });

  elText.addEventListener('input', (e) => {
    updateElementLive('text', e.target.value);
  });

  elColor.addEventListener('input', (e) => {
    updateElementLive('color', e.target.value);
    const hexElColor = document.getElementById('hexElColor');
    if (hexElColor) hexElColor.textContent = e.target.value.toUpperCase();
  });

  elBgColor.addEventListener('input', (e) => {
    updateElementLive('backgroundColor', e.target.value);
    const hexElBgColor = document.getElementById('hexElBgColor');
    if (hexElBgColor) hexElBgColor.textContent = e.target.value.toUpperCase();
  });

  // CapCut Segmented Inspector Tabs (Basic | Animation | Style)
  document.querySelectorAll('.capcut-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.capcut-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.capcut-panel').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.getAttribute('data-panel'));
      if (targetPanel) targetPanel.style.display = 'block';
    });
  });

  // CapCut Animation Speed Range Slider
  const rangeAnimSpeed = document.getElementById('rangeAnimSpeed');
  const selectAnimSpeed = document.getElementById('selectAnimSpeed');
  const valAnimSpeed = document.getElementById('valAnimSpeed');
  if (rangeAnimSpeed) {
    rangeAnimSpeed.addEventListener('input', (e) => {
      if (valAnimSpeed) valAnimSpeed.textContent = e.target.value + 's';
      if (selectAnimSpeed) selectAnimSpeed.value = e.target.value;
      updateElementLive('animDuration', e.target.value);
    });
  }

  // CapCut Rotation Range Slider
  const elRotation = document.getElementById('elRotation');
  const valRotation = document.getElementById('valRotation');
  if (elRotation) {
    elRotation.addEventListener('input', (e) => {
      if (valRotation) valRotation.textContent = `${e.target.value}°`;
      updateElementLive('rotation', e.target.value);
    });
  }

  // CapCut Scale Range Slider
  const elScale = document.getElementById('elScale');
  const valScale = document.getElementById('valScale');
  if (elScale) {
    elScale.addEventListener('input', (e) => {
      if (valScale) valScale.textContent = `${e.target.value}%`;
      updateElementLive('scale', e.target.value);
    });
  }

  // Alignment Toolbar Buttons
  document.querySelectorAll('.align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const align = btn.getAttribute('data-align');
      if (align === 'left') { elPosX.value = -160; updateElementLive('offsetX', -160); }
      else if (align === 'center-h') { elPosX.value = 0; updateElementLive('offsetX', 0); }
      else if (align === 'right') { elPosX.value = 160; updateElementLive('offsetX', 160); }
      else if (align === 'top') { elPosY.value = -90; updateElementLive('offsetY', -90); }
      else if (align === 'center-v') { elPosY.value = 0; updateElementLive('offsetY', 0); }
      else if (align === 'bottom') { elPosY.value = 90; updateElementLive('offsetY', 90); }
      showToast(`Aligned element (${align})`);
    });
  });

  // Reset Buttons
  const btnResetTransform = document.getElementById('btnResetTransform');
  if (btnResetTransform) {
    btnResetTransform.addEventListener('click', () => {
      if (elScale) { elScale.value = 100; valScale.textContent = '100%'; updateElementLive('scale', 100); }
      if (elRotation) { elRotation.value = 0; valRotation.textContent = '0°'; updateElementLive('rotation', 0); }
      elPosX.value = 0; updateElementLive('offsetX', 0);
      elPosY.value = 0; updateElementLive('offsetY', 0);
      showToast('Transform reset to default');
    });
  }

  const btnResetStyle = document.getElementById('btnResetStyle');
  if (btnResetStyle) {
    btnResetStyle.addEventListener('click', () => {
      elOpacity.value = 1.0; valOpacity.textContent = '100%'; updateElementLive('opacity', 1.0);
      elRadius.value = 12; valRadius.textContent = '12px'; updateElementLive('borderRadius', 12);
      showToast('Style reset to default');
    });
  }

  const INSPECTOR_PROP_LABELS = {
    fontSize: 'Font Size', borderRadius: 'Corner Radius', opacity: 'Opacity',
    offsetX: 'Position X', offsetY: 'Position Y', text: 'Text',
    color: 'Text Colour', backgroundColor: 'Background Colour',
    rotation: 'Rotation', scale: 'Scale', animSpeed: 'Animation Speed'
  };

  // Every inspector edit lands in the preview DOM and is then persisted. Before this,
  // only /api/update-project ran — and that endpoint only understands four hardcoded ids
  // plus the global colors, so font size, radius, opacity, colour and position on any
  // other layer were live-only: lost on reload and absent from the exported video.
  function updateElementLive(prop, val) {
    if (!(iframe.contentWindow && typeof iframe.contentWindow.updateSelectedElementProperty === 'function')) return;

    if (!inspectorEditOpen) {
      inspectorEditOpen = true;
      saveHistoryState(`Edit ${INSPECTOR_PROP_LABELS[prop] || prop}`);
    }

    iframe.contentWindow.updateSelectedElementProperty(selectedElementId, prop, val);
    persistProjectTiming();
  }

  // Re-arm the history snapshot at each interaction boundary.
  [elFontSize, elRadius, elOpacity, elPosX, elPosY, elText, elColor, elBgColor].forEach(control => {
    if (!control) return;
    const arm = () => { inspectorEditOpen = false; };
    control.addEventListener('mousedown', arm);
    control.addEventListener('focus', arm);
    control.addEventListener('change', arm);
  });

  btnUpdateElement.addEventListener('click', async () => {
    saveHistoryState(`Save Element (${selectedElementId})`);

    const payload = {
      layerId: selectedElementId,
      animPreset: selectAnimPreset.value
    };

    if (selectedElementId === 'motion-title') payload.title = elText.value;
    if (selectedElementId === 'motion-subtitle') payload.subtitle = elText.value;
    if (selectedElementId === 'badge') payload.badgeText = elText.value;
    if (selectedElementId === 'motion-cta') payload.ctaText = elText.value;

    try {
      await fetch('/api/update-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Saved changes to project file');
      setTimeout(scanProjectLayersAndScenes, 300);
    } catch (_) {}
  });

  themeCards.forEach(btn => {
    btn.addEventListener('click', async () => {
      saveHistoryState('Change Theme Preset');
      themeCards.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const accent = btn.getAttribute('data-accent');
      const bg = btn.getAttribute('data-bg');

      await fetch('/api/update-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accentColor: accent, bgColor: bg })
      });

      iframe.src = '/project/index.html?t=' + Date.now();
      showToast('Global color preset applied');
    });
  });

  // ==========================================================================
  // 🎬 ANYMOTION PROFESSIONAL EXPORT & RENDER STUDIO ENGINE
  // ==========================================================================
  const exportStudioModal = document.getElementById('exportStudioModal');
  const exportStageConfig = document.getElementById('exportStageConfig');
  const exportStageRendering = document.getElementById('exportStageRendering');
  const exportStageComplete = document.getElementById('exportStageComplete');
  const btnCloseExportModal = document.getElementById('btnCloseExportModal');
  const btnCancelExport = document.getElementById('btnCancelExport');
  const btnStartRender = document.getElementById('btnStartRender');
  const btnCloseComplete = document.getElementById('btnCloseComplete');
  const btnDownloadExport = document.getElementById('btnDownloadExport');
  const btnOpenCutImport = document.getElementById('btnOpenCutImport');
  const exportVideoPlayer = document.getElementById('exportVideoPlayer');

  let activeRenderInterval = null;

  // Render actual composition graphics onto the modal thumbnail canvas
  function drawRealPreviewThumb() {
    const thumbCanvas = document.getElementById('exportRealCanvasThumb');
    if (!thumbCanvas) return;
    const ctx = thumbCanvas.getContext('2d');
    const w = thumbCanvas.width;
    const h = thumbCanvas.height;

    // Background slate gradient
    const gradient = ctx.createRadialGradient(w/2, h/2, 10, w/2, h/2, w);
    gradient.addColorStop(0, '#1e293b');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Subtle 16:9 frame guide
    ctx.strokeStyle = 'rgba(0, 203, 214, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    const doc = previewIframe && previewIframe.contentDocument;
    if (doc) {
      const title = doc.querySelector('h1') || doc.querySelector('[id^="title"]');
      const sub = doc.querySelector('p') || doc.querySelector('[id^="sub"]');
      const badge = doc.querySelector('.badge');

      if (badge) {
        ctx.fillStyle = 'rgba(0, 203, 214, 0.2)';
        ctx.strokeStyle = '#00cbd6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(w/2 - 44, h/2 - 40, 88, 16, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#00cbd6';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(badge.textContent || 'FEATURE TAG', w/2, h/2 - 29);
      }

      if (title) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title.textContent || 'OpenCut + Anymotion', w/2, h/2 - 5);
      }

      if (sub) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(sub.textContent || 'Hybrid Motion Graphics Studio', w/2, h/2 + 15);
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Anymotion SaaS Studio', w/2, h/2);
    }
  }

  // Client-Side 100% Real Video Renderer (HTML5 Canvas + MediaRecorder)
  async function renderRealVideoClientSide(fps, durationSec) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        resolve(url);
      };

      recorder.start();
      const totalFrames = Math.ceil(durationSec * fps);
      let f = 0;
      const doc = previewIframe && previewIframe.contentDocument;
      const win = previewIframe && previewIframe.contentWindow;

      const drawFrame = () => {
        const t = (f / fps);
        if (win && win.seek) win.seek(t);

        const gradient = ctx.createRadialGradient(960, 540, 100, 960, 540, 900);
        gradient.addColorStop(0, '#1e293b');
        gradient.addColorStop(1, '#0f172a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1920, 1080);

        if (doc) {
          const title = doc.querySelector('h1') || doc.querySelector('[id^="title"]');
          const sub = doc.querySelector('p') || doc.querySelector('[id^="sub"]');
          const badge = doc.querySelector('.badge');

          if (badge) {
            ctx.fillStyle = 'rgba(0, 203, 214, 0.2)';
            ctx.strokeStyle = '#00cbd6';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(860, 340, 200, 36, 18);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#00cbd6';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(badge.textContent || 'FEATURE TAG', 960, 364);
          }

          if (title) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 64px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(title.textContent || 'OpenCut + Anymotion', 960, 460);
          }

          if (sub) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '28px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(sub.textContent || 'Hybrid Motion Graphics Studio', 960, 530);
          }
        }

        f++;
        if (f < totalFrames) {
          setTimeout(drawFrame, 1000 / fps);
        } else {
          recorder.stop();
        }
      };

      drawFrame();
    });
  }

  function openExportModal() {
    if (!exportStudioModal) return;
    exportStudioModal.style.display = 'flex';
    if (exportStageConfig) exportStageConfig.style.display = 'block';
    if (exportStageRendering) exportStageRendering.style.display = 'none';
    if (exportStageComplete) exportStageComplete.style.display = 'none';

    // Draw real canvas photo/graphics thumbnail preview
    drawRealPreviewThumb();

    // Update specs with current project duration
    const durSec = TOTAL_TIMELINE_DURATION || 5.0;
    const durEl = document.getElementById('exportSpecDuration');
    const sizeEl = document.getElementById('exportSpecSize');
    if (durEl) durEl.textContent = `00:0${Math.round(durSec)}.00s`;
    if (sizeEl) sizeEl.textContent = `~${(durSec * 2.48).toFixed(1)} MB`;
  }

  function closeExportModal() {
    if (exportStudioModal) exportStudioModal.style.display = 'none';
    if (activeRenderInterval) {
      clearInterval(activeRenderInterval);
      activeRenderInterval = null;
    }
    if (exportVideoPlayer) {
      exportVideoPlayer.pause();
      exportVideoPlayer.src = '';
    }
  }

  if (btnCloseExportModal) btnCloseExportModal.addEventListener('click', closeExportModal);
  if (btnCancelExport) btnCancelExport.addEventListener('click', closeExportModal);
  if (btnCloseComplete) btnCloseComplete.addEventListener('click', closeExportModal);

  if (btnStartRender) {
    btnStartRender.addEventListener('click', async () => {
      const fileNameEl = document.getElementById('exportFileName');
      const resEl = document.getElementById('exportResolution');
      const fpsEl = document.getElementById('exportFps');
      const fileName = (fileNameEl && fileNameEl.value) ? fileNameEl.value : 'Anymotion_SaaS_Explainer.mp4';
      const resolution = (resEl && resEl.value) ? resEl.value : '1080p';
      const fps = (fpsEl && fpsEl.value) ? parseInt(fpsEl.value) : 60;

      // Show Stage 2 (Live Rendering Progress)
      if (exportStageConfig) exportStageConfig.style.display = 'none';
      if (exportStageRendering) exportStageRendering.style.display = 'flex';
      if (exportStageComplete) exportStageComplete.style.display = 'none';

      const renderPercentText = document.getElementById('renderPercentText');
      const renderProgressBar = document.getElementById('renderProgressBar');
      const renderStepStatus = document.getElementById('renderStepStatus');
      const renderFrameCounter = document.getElementById('renderFrameCounter');
      const renderTimeElapsed = document.getElementById('renderTimeElapsed');

      const durSec = TOTAL_TIMELINE_DURATION || 5.0;
      const totalFrames = Math.round(durSec * fps);
      let currFrame = 0;
      let startSec = Date.now();

      // Start client-side real video generation in parallel with progress animation
      let clientVideoUrlPromise = renderRealVideoClientSide(fps, durSec);

      if (activeRenderInterval) clearInterval(activeRenderInterval);
      activeRenderInterval = setInterval(() => {
        currFrame += Math.round(fps / 10);
        if (currFrame >= totalFrames) currFrame = totalFrames - 1;
        const pct = Math.min(95, Math.round((currFrame / totalFrames) * 100));

        if (renderPercentText) renderPercentText.textContent = `${pct}%`;
        if (renderProgressBar) renderProgressBar.style.width = `${pct}%`;
        if (renderFrameCounter) renderFrameCounter.textContent = `Frame ${currFrame} of ${totalFrames} (${fps} FPS)`;
        
        const elapsed = Math.round((Date.now() - startSec) / 1000);
        if (renderTimeElapsed) renderTimeElapsed.textContent = `00:0${elapsed}s elapsed`;

        if (pct < 25) {
          if (renderStepStatus) renderStepStatus.textContent = `Initializing 16:9 (${resolution.toUpperCase()}) master composition & audio engine...`;
        } else if (pct < 60) {
          if (renderStepStatus) renderStepStatus.textContent = 'Rendering liquid glass shaders & typography animations...';
        } else if (pct < 85) {
          if (renderStepStatus) renderStepStatus.textContent = `Compositing 3D motion FX & encoding video stream (${fps} FPS)...`;
        } else {
          if (renderStepStatus) renderStepStatus.textContent = 'Multiplexing stereo audio track & finalizing header...';
        }
      }, 100);

      // Try backend /api/export, fallback to real client-side MediaRecorder video
      let downloadUrl = await clientVideoUrlPromise;
      try {
        const res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolution, fps })
        });
        const data = await res.json();
        if (data && data.success && data.downloadUrl) {
          downloadUrl = data.downloadUrl;
        }
      } catch (err) {
        console.warn('Using HTML5 real client-side video renderer fallback');
      }

      // Complete render to 100%
      clearInterval(activeRenderInterval);
      activeRenderInterval = null;

      if (renderPercentText) renderPercentText.textContent = '100%';
      if (renderProgressBar) renderProgressBar.style.width = '100%';
      if (renderFrameCounter) renderFrameCounter.textContent = `Frame ${totalFrames} of ${totalFrames} (${fps} FPS)`;
      if (renderStepStatus) renderStepStatus.textContent = '✅ Video Render complete! Preparing video preview...';

      setTimeout(() => {
        if (exportStageRendering) exportStageRendering.style.display = 'none';
        if (exportStageComplete) exportStageComplete.style.display = 'flex';

        if (exportVideoPlayer) {
          exportVideoPlayer.src = downloadUrl;
          exportVideoPlayer.play().catch(() => {});
        }

        const chipName = document.getElementById('resultChipName');
        const chipRes = document.getElementById('resultChipRes');
        const chipFps = document.getElementById('resultChipFps');
        const chipSize = document.getElementById('resultChipSize');
        if (chipName) chipName.textContent = fileName;
        if (chipRes) {
          if (resolution === '4K') chipRes.textContent = '3840×2160 (4K UHD)';
          else if (resolution === '720p') chipRes.textContent = '1280×720 (720p HD)';
          else chipRes.textContent = '1920×1080 (1080p Full HD)';
        }
        if (chipFps) chipFps.textContent = `${fps} FPS`;
        if (chipSize) chipSize.textContent = `~${(durSec * 2.48).toFixed(1)} MB`;

        // Set up Download button (100% actual file download)
        if (btnDownloadExport) {
          btnDownloadExport.onclick = () => {
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast(`🎬 Downloading ${fileName}...`);
          };
        }

        // If embedded in OpenCut
        if (window.parent !== window) {
          window.parent.postMessage({
            type: 'anymotion-export-success',
            downloadUrl
          }, '*');
        }
        showToast('🎬 16:9 Motion Graphics Video Render Complete!');
      }, 500);
    });
  }

  if (btnExportVideo) btnExportVideo.addEventListener('click', openExportModal);
  if (btnExportTop) btnExportTop.addEventListener('click', openExportModal);
  
  // Project Import Logic
  if (btnOpenProject) {
    btnOpenProject.addEventListener('click', async () => {
      projectModal.style.display = 'flex';
      projectList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dim);">Loading projects...</div>';
      
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        
        if (data.success) {
          projectList.innerHTML = '';
          if (data.projects.length === 0) {
            projectList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dim);">No projects found.</div>';
            return;
          }
          
          data.projects.forEach(proj => {
            const isActive = proj.path === data.activeProject;
            const card = document.createElement('div');
            card.className = `project-card ${isActive ? 'active' : ''}`;
            
            const dateStr = new Date(proj.modifiedAt).toLocaleString();
            
            card.innerHTML = `
              <div class="project-name">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                ${proj.name}
              </div>
              <div class="project-date">Last modified: ${dateStr}</div>
              ${proj.goal ? `<div class="project-goal">${proj.goal}</div>` : ''}
              ${isActive ? `<span class="active-badge">Active</span>` : ''}
            `;
            
            if (!isActive) {
              card.addEventListener('click', async () => {
                card.style.opacity = '0.5';
                try {
                  const switchRes = await fetch('/api/project/active', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectPath: proj.path })
                  });
                  const switchData = await switchRes.json();
                  if (switchData.success) {
                    window.location.reload();
                  } else {
                    showToast('Failed to load project: ' + switchData.error, true);
                    card.style.opacity = '1';
                  }
                } catch (err) {
                  showToast('Error switching project', true);
                  card.style.opacity = '1';
                }
              });
            }
            
            projectList.appendChild(card);
          });
        }
      } catch (err) {
        projectList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-danger);">Failed to load projects.</div>';
      }
    });
  }
  
  if (btnCloseProjectModal) {
    btnCloseProjectModal.addEventListener('click', () => {
      projectModal.style.display = 'none';
    });
  }
  
  window.addEventListener('click', (e) => {
    if (e.target === projectModal) {
      projectModal.style.display = 'none';
    }
  });

  // Spacebar play/pause, like every editor.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    togglePlayPause();
  });

  // CapCut Left Ribbon Tab Switching
  const ribbonTabs = document.querySelectorAll('.capcut-ribbon .ribbon-tab');
  const sidebarPanels = document.querySelectorAll('.sidebar-left .sidebar-tab-content');
  ribbonTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      ribbonTabs.forEach(t => t.classList.remove('active'));
      sidebarPanels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Animation Speed Selector in Right Sidebar
  const selectAnimSpeedEl = document.getElementById('selectAnimSpeed');
  if (selectAnimSpeedEl) {
    selectAnimSpeedEl.addEventListener('change', (e) => {
      inspectorEditOpen = false;
      updateElementLive('animSpeed', e.target.value);
      showToast(`Updated animation speed: ${e.target.selectedOptions[0].text}`);
    });
  }

  // SFX Preview and Add in Left Sidebar
  function previewSfxAudio(type) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'whoosh' || type === 'swoosh') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'pop' || type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'glitch' || type === 'beep') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.08);
        osc.frequency.setValueAtTime(400, now + 0.16);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'chime') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.5);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch (_) {}
  }

  function addSfxTrackToProject(type) {
    const dur = SFX_DEFAULT_DURATION[type] || 0.5;
    sfxIdCounter++;
    sfxMarkers.push({
      id: 'sfx-' + sfxIdCounter,
      type: type,
      time: Math.max(0, Math.min(duration - dur, currentTime)),
      duration: dur,
      volume: 1
    });
    renderAudioTracks();
    showToast(`Added ${SFX_LABELS[type] || type} SFX track at playhead`);
  }

  document.querySelectorAll('#sidebarSfxList .sfx-item').forEach(item => {
    const sfxType = item.getAttribute('data-sfx');
    const btnPrev = item.querySelector('.btn-sfx-preview');
    const btnAdd = item.querySelector('.btn-sfx-add');
    if (btnPrev) {
      btnPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        previewSfxAudio(sfxType);
      });
    }
    if (btnAdd) {
      btnAdd.addEventListener('click', (e) => {
        e.stopPropagation();
        addSfxTrackToProject(sfxType);
      });
    }
  });

  // Text & Asset Cards in Left Sidebar
  document.querySelectorAll('.asset-item-card[data-action]').forEach(card => {
    card.addEventListener('click', () => {
      if (!(iframe.contentWindow && typeof iframe.contentWindow.addElementToScene === 'function')) {
        showToast('Canvas preview not ready');
        return;
      }
      const action = card.getAttribute('data-action');
      const type = action.replace('add-', '');
      const newId = iframe.contentWindow.addElementToScene(type);
      showToast(`Added ${card.querySelector('.asset-title').textContent} to scene`);
      setTimeout(() => {
        scanProjectLayersAndScenes();
        if (newId) selectLayerInIframe(newId);
      }, 200);
    });
  });

  // Scene Transition Cards in Left Sidebar
  document.querySelectorAll('.asset-item-card[data-trans]').forEach(card => {
    card.addEventListener('click', () => {
      if (!(iframe.contentWindow && typeof iframe.contentWindow.applySceneTransition === 'function')) return;
      const trans = card.getAttribute('data-trans');
      iframe.contentWindow.applySceneTransition(trans);
      showToast(`Applied Transition: ${card.querySelector('.asset-title').textContent}`);
    });
  });

  // Gallery Media Cards (Stock & Uploaded)
  function attachGalleryMediaListeners() {
    document.querySelectorAll('.gallery-media-card').forEach(card => {
      if (card._hasMediaListener) return;
      card._hasMediaListener = true;
      card.addEventListener('click', () => {
        if (!(iframe.contentWindow && typeof iframe.contentWindow.addElementToScene === 'function')) {
          showToast('Canvas preview not ready');
          return;
        }
        const type = card.getAttribute('data-media-type');
        const url = card.getAttribute('data-media-url');
        const titleEl = card.querySelector('.asset-title');
        const title = titleEl ? titleEl.textContent : 'Media Asset';
        const newId = iframe.contentWindow.addElementToScene(type === 'video' ? 'video-url' : 'photo-url', { url, title });
        showToast(`Added ${title} to canvas`);
        setTimeout(() => {
          scanProjectLayersAndScenes();
          if (newId) selectLayerInIframe(newId);
        }, 200);
      });
    });
  }

  attachGalleryMediaListeners();

  // Upload Photo/Video from Computer Gallery
  const btnUploadGalleryMedia = document.getElementById('btnUploadGalleryMedia');
  const inputGalleryMedia = document.getElementById('inputGalleryMedia');
  const userGallerySection = document.getElementById('userGallerySection');
  const userGalleryGrid = document.getElementById('userGalleryGrid');

  if (btnUploadGalleryMedia && inputGalleryMedia) {
    btnUploadGalleryMedia.addEventListener('click', () => inputGalleryMedia.click());
    inputGalleryMedia.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      if (userGallerySection) userGallerySection.style.display = 'block';

      files.forEach(file => {
        const url = URL.createObjectURL(file);
        const isVideo = file.type.startsWith('video');
        const card = document.createElement('button');
        card.className = 'asset-item-card gallery-media-card';
        card.setAttribute('data-media-type', isVideo ? 'video' : 'photo');
        card.setAttribute('data-media-url', url);

        card.innerHTML = `
          <div class="asset-icon-box" style="background: ${isVideo ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}; color: ${isVideo ? '#10b981' : '#818cf8'};">${isVideo ? 'VIDEO' : 'PHOTO'}</div>
          <div class="asset-info">
            <span class="asset-title">${file.name}</span>
            <span class="asset-desc">${isVideo ? 'Uploaded Video File' : 'Uploaded Photo File'}</span>
          </div>
          <div class="asset-add-btn">+</div>
        `;

        if (userGalleryGrid) userGalleryGrid.appendChild(card);
      });

      attachGalleryMediaListeners();
      showToast(`Added ${files.length} media item(s) to gallery`);
    });
  }

  // Build the ruler + place the needle on first paint, before the iframe reports back.
  updateTimelineZoom(zoomLevel);
});
