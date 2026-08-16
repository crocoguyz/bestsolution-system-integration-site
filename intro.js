(() => {
  const intro = document.getElementById('bsIntro');
  if (!intro) return;

  const canvas = document.getElementById('bsIntroCanvas');
  const ctx = canvas?.getContext('2d', { alpha: true });
  const fxCanvas = document.getElementById('bsIntroFxCanvas');
  const fxCtx = fxCanvas?.getContext('2d', { alpha: true });
  const shatterLayer = document.getElementById('bsIntroShatter');
  const modelZone = document.getElementById('bsIntroModelZone');
  const model = document.getElementById('bsIntroModel');
  const soundButton = document.getElementById('bsIntroSound');
  const persistentSoundButton = document.getElementById('bsPersistentSound');
  const soundStatus = document.getElementById('bsIntroAudioStatus');
  const audio = document.getElementById('bsIntroAudio');
  const menuButton = document.getElementById('bsIntroMenuButton');
  const menuOverlay = document.getElementById('bsIntroMenuOverlay');
  const menuClose = document.getElementById('bsIntroMenuClose');
  const introLinks = [...document.querySelectorAll('[data-intro-target]')];


  // V8 transient electrical SFX. These are intentionally separate from the
  // looping soundtrack and fire only for a real signal-line contact strike.
  const electricSfxSources = [
    'assets/electric-sfx-1.mp3',
    'assets/electric-sfx-2.mp3',
    'assets/electric-sfx-3.mp3'
  ];
  const hoverSfxSource = 'assets/hover-sfx.mp3';
  const clickSfxSource = 'assets/click-sfx.mp3';
  let liveElectricSfx = null;
  let liveElectricStopTimer = 0;
  let lastHoverSfxAt = 0;
  let lastClickSfxAt = 0;

  // Screen-wide shatter layer. The center 3D model remains as the dark
  // foundation while the logo casing + interface fragments fly outward.
  const pageShatterLayer = document.createElement('div');
  pageShatterLayer.className = 'bs-intro-page-shatter-layer';
  pageShatterLayer.setAttribute('aria-hidden', 'true');
  intro.appendChild(pageShatterLayer);

  const pointer = { x: innerWidth * .5, y: innerHeight * .5, active: false, down: false };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AUDIO_STATE_KEY = 'bestSolution.siteMusic.v2';
  let audioWasManuallyMuted = false;
  let audioUnlocked = false;
  let introClosed = false;
  let raf = null;
  let lastTime = performance.now();
  let lastSavedSecond = -1;
  let touchArcSeed = 1;
  let lastTouchArcShuffle = 0;
  let shatterTimer = 0;
  let reassembleTimer = 0;
  let shatterActive = false;
  let shatterBusy = false;
  let shatterSnapshotUrl = '';
  let shatterSnapshotSize = '';

  document.body.classList.add('intro-active');
  requestAnimationFrame(() => intro.dataset.ready = 'true');

  // ------------------------------
  // PERSISTENT SITE AUDIO
  // Music continues after the intro closes and can resume across
  // same-tab page loads when this script exists on the destination.
  // ------------------------------
  function readAudioState() {
    try {
      const raw = sessionStorage.getItem(AUDIO_STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveAudioState() {
    if (!audio) return;
    try {
      sessionStorage.setItem(AUDIO_STATE_KEY, JSON.stringify({
        time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        volume: audio.volume,
        muted: audioWasManuallyMuted || audio.muted,
        shouldPlay: !audio.paused && !audioWasManuallyMuted,
        savedAt: Date.now()
      }));
    } catch (_) {}
  }

  const savedAudio = readAudioState();
  if (audio) {
    audio.loop = true;
    audio.volume = savedAudio?.volume ?? 0.28;
    audioWasManuallyMuted = Boolean(savedAudio?.muted);
    audio.muted = false; // Pause is used for manual mute so position is preserved.

    const restoreTime = () => {
      if (savedAudio && Number.isFinite(savedAudio.time) && savedAudio.time > 0 && audio.duration) {
        audio.currentTime = Math.min(savedAudio.time, Math.max(0, audio.duration - 0.15));
      }
    };
    if (audio.readyState >= 1) restoreTime();
    else audio.addEventListener('loadedmetadata', restoreTime, { once: true });
  }

  function isSoundOn() {
    return Boolean(audio && !audio.paused && !audioWasManuallyMuted && !audio.muted);
  }

  function syncOneSoundButton(button) {
    if (!button || !audio) return;
    const on = isSoundOn();
    button.classList.toggle('is-muted', !on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Pause site music' : 'Play site music');
  }

  function setSoundUi() {
    syncOneSoundButton(soundButton);
    syncOneSoundButton(persistentSoundButton);
    if (soundStatus) {
      soundStatus.textContent = isSoundOn()
        ? 'Audio: Space Ambient / Lo-fi Chiptune'
        : (audioWasManuallyMuted ? 'Audio: paused' : 'Audio: ready on interaction');
    }
  }

  async function tryPlayAudio(force = false) {
    if (!audio || (audioWasManuallyMuted && !force)) return false;
    try {
      audioWasManuallyMuted = false;
      audio.muted = false;
      await audio.play();
      audioUnlocked = true;
      setSoundUi();
      saveAudioState();
      return true;
    } catch (_) {
      setSoundUi();
      return false;
    }
  }

  async function toggleAudio(event) {
    event?.stopPropagation?.();
    if (!audio) return;
    if (isSoundOn()) {
      audio.pause();
      audioWasManuallyMuted = true;
    } else {
      await tryPlayAudio(true);
    }
    setSoundUi();
    saveAudioState();
  }

  setSoundUi();
  // Resume only when the previous page says audio was playing; otherwise
  // normal first-interaction unlock starts it on the intro.
  if (savedAudio?.shouldPlay && !audioWasManuallyMuted) tryPlayAudio();
  else if (!savedAudio) tryPlayAudio();

  const unlockOnce = () => {
    if (!audioUnlocked && !audioWasManuallyMuted && audio?.paused) tryPlayAudio();
  };
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });

  soundButton?.addEventListener('click', toggleAudio);
  persistentSoundButton?.addEventListener('click', toggleAudio);

  function initInteractiveButtonSfx() {
    const targets = new Set([
      ...document.querySelectorAll('.bs-intro a, .bs-intro button, .main-nav a, .hero-actions .btn, .btn, .brand, .bs-persistent-sound')
    ]);
    targets.forEach((el) => {
      el.addEventListener('mouseenter', () => playUiSfx('hover'), { passive: true });
      el.addEventListener('focus', () => playUiSfx('hover'), { passive: true });
      el.addEventListener('pointerdown', () => playUiSfx('click'), { passive: true });
      el.addEventListener('click', () => playUiSfx('click'), { passive: true });
    });
  }
  initInteractiveButtonSfx();

  audio?.addEventListener('timeupdate', () => {
    const sec = Math.floor(audio.currentTime || 0);
    if (sec !== lastSavedSecond && sec % 2 === 0) {
      lastSavedSecond = sec;
      saveAudioState();
    }
  });
  audio?.addEventListener('play', setSoundUi);
  audio?.addEventListener('pause', setSoundUi);
  window.addEventListener('pagehide', saveAudioState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveAudioState();
  });


  function playElectricSfx(durationMs) {
    // Respect the user's site-audio choice. Browser autoplay policy may also
    // reject a hover-triggered sound before the first user gesture; that is OK.
    if (audioWasManuallyMuted) return;
    clearTimeout(liveElectricStopTimer);
    try {
      if (liveElectricSfx) {
        liveElectricSfx.pause();
        liveElectricSfx.currentTime = 0;
      }
      const src = electricSfxSources[Math.floor(Math.random() * electricSfxSources.length)];
      const sfx = new Audio(src);
      liveElectricSfx = sfx;
      sfx.volume = 0.46;
      sfx.playbackRate = 0.96 + Math.random() * 0.08;
      sfx.play().catch(() => {});
      liveElectricStopTimer = window.setTimeout(() => {
        if (liveElectricSfx !== sfx) return;
        try { sfx.pause(); sfx.currentTime = 0; } catch (_) {}
        liveElectricSfx = null;
      }, durationMs);
    } catch (_) {}
  }

  function playUiSfx(kind = 'hover') {
    if (audioWasManuallyMuted) return;
    const now = performance.now();
    const src = kind === 'click' ? clickSfxSource : hoverSfxSource;
    if (kind === 'hover') {
      if (now - lastHoverSfxAt < 90) return;
      lastHoverSfxAt = now;
    } else {
      if (now - lastClickSfxAt < 55) return;
      lastClickSfxAt = now;
    }
    try {
      const sfx = new Audio(src);
      sfx.volume = kind === 'click' ? 0.36 : 0.24;
      sfx.playbackRate = kind === 'click' ? 1.0 : 1.04;
      sfx.play().catch(() => {});
    } catch (_) {}
  }

  // ------------------------------
  // MENU
  // ------------------------------
  const openMenu = () => {
    menuOverlay?.classList.add('is-open');
    menuOverlay?.setAttribute('aria-hidden', 'false');
    menuButton?.setAttribute('aria-expanded', 'true');
  };

  const closeMenu = () => {
    menuOverlay?.classList.remove('is-open');
    menuOverlay?.setAttribute('aria-hidden', 'true');
    menuButton?.setAttribute('aria-expanded', 'false');
  };

  menuButton?.addEventListener('click', () => {
    if (menuOverlay?.classList.contains('is-open')) closeMenu();
    else openMenu();
  });
  menuClose?.addEventListener('click', closeMenu);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  // ------------------------------
  // INTRO EXIT / TARGET NAVIGATION
  // ------------------------------
  function focusTarget(target) {
    const el = target === '#home' ? document.getElementById('home') : document.querySelector(target);
    if (!el) return;

    requestAnimationFrame(() => {
      if (target === '#home') window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      else el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }

  function exitIntro(target = '#home') {
    if (introClosed) return;
    introClosed = true;
    closeMenu();
    pointer.down = false;
    resetShatter(true);

    // IMPORTANT: do NOT pause/reset the audio here. The audio element lives
    // outside the intro layer so the soundtrack continues seamlessly.
    saveAudioState();
    intro.classList.add('is-leaving');
    document.body.classList.remove('intro-active');
    document.body.classList.add('intro-finished');

    setTimeout(() => {
      intro.hidden = true;
      intro.setAttribute('aria-hidden', 'true');
      if (persistentSoundButton) persistentSoundButton.hidden = false;
      setSoundUi();
      if (raf) cancelAnimationFrame(raf);
      window.dispatchEvent(new CustomEvent('bs:intro-closed'));
      focusTarget(target);
    }, reduceMotion ? 0 : 700);
  }

  introLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      exitIntro(link.dataset.introTarget || '#home');
    });
  });

  // ------------------------------
  // POINTER / MODEL / HOLD-TO-BLAST — V8
  // V7 uses the Web Animations API for every shard. This is intentionally
  // frame-by-frame motion (not a CSS state jump): shards accelerate out from
  // the logo over ~1.1s, then drift subtly while held, and animate back into
  // place when the pointer is released.
  // ------------------------------
  function setPointer(event) {
    if (!event) return;
    pointer.x = event.clientX ?? pointer.x;
    pointer.y = event.clientY ?? pointer.y;
    pointer.active = true;
  }

  intro.addEventListener('pointermove', setPointer, { passive: true });
  intro.addEventListener('pointerleave', () => { pointer.active = false; }, { passive: true });

  modelZone?.addEventListener('pointermove', (event) => {
    if (!model || shatterActive || pointer.down) return;
    const rect = modelZone.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = ((event.clientX - rect.left) / rect.width - .5) * 2;
    const ny = ((event.clientY - rect.top) / rect.height - .5) * 2;
    model.style.transform = `translate3d(${nx * 5}px, ${ny * 4}px, 0) rotateX(${ny * -1.15}deg) rotateY(${nx * 1.6}deg)`;
  }, { passive: true });

  modelZone?.addEventListener('pointerleave', () => {
    if (model && !shatterActive && !pointer.down) model.style.transform = '';
  }, { passive: true });

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  const HOLD_TO_BLAST_MS = reduceMotion ? 620 : 520;
  const SNAPSHOT_TIMEOUT_MS = 1400;
  const FALLBACK_BLAST_IMAGE = 'images/logo-icon.png';
  const BLAST_DURATION = reduceMotion ? 1350 : 2750;
  const REASSEMBLE_DURATION = reduceMotion ? 1150 : 2100;
  let cachedBlastSnapshot = '';
  let preparedBlastKey = '';
  let snapshotPrimePromise = null;
  let holdProgressRaf = 0;
  let holdStartedAt = 0;
  let holdPointerId = null;
  let blastFlashTimer = 0;
  let modelFadeAnimation = null;
  const liveShardAnimations = new Set();
  const liveSparkAnimations = new Set();

  const livePageAnimations = new Set();
  const pageFragmentSources = [
    '.bs-intro-brand',
    '.bs-intro-controls',
    '.bs-intro-copy',
    '.bs-intro-side',
    '.bs-intro-scroll-cue',
    '.bs-intro-hold',
    '.bs-intro-audio-status'
  ];
  let pageFragmentsBuilt = false;

  function withTimeout(promise, ms, fallback = '') {
    return Promise.race([
      Promise.resolve(promise).catch(() => fallback),
      new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
    ]);
  }

  async function captureModelSnapshot() {
    if (!model || typeof model.toDataURL !== 'function') return '';
    try {
      const result = await withTimeout(model.toDataURL('image/png'), SNAPSHOT_TIMEOUT_MS, '');
      return typeof result === 'string' && result.startsWith('data:image/') ? result : '';
    } catch (_) {
      return '';
    }
  }

  function blastGeometryKey() {
    if (!model || !modelZone) return '';
    const rect = model.getBoundingClientRect();
    return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  }

  function clearAnimationSet(set, commit = false) {
    for (const anim of set) {
      try { if (commit && typeof anim.commitStyles === 'function') anim.commitStyles(); } catch (_) {}
      try { anim.cancel(); } catch (_) {}
    }
    set.clear();
  }

  function clearBlastFragments() {
    clearAnimationSet(liveShardAnimations);
    clearAnimationSet(liveSparkAnimations);
    shatterLayer?.replaceChildren();
    preparedBlastKey = '';
  }

  function addBlastSparks(width, height) {
    if (!shatterLayer) return;
    const cx = width * .5;
    const cy = height * .49;
    const count = reduceMotion ? 10 : 18;
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('i');
      spark.className = `bs-intro-blast-spark${i % 5 === 0 ? ' is-warm' : ''}`;
      const angle = randRange(0, Math.PI * 2);
      const radius = randRange(42, Math.min(width, height) * .30);
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      spark.dataset.angle = String(angle);
      spark.dataset.length = String(randRange(28, 84));
      spark.dataset.delay = String(randRange(0, 120));
      shatterLayer.appendChild(spark);
    }
  }

  function buildBlastFragments(imageUrl, force = false) {
    if (!shatterLayer || !modelZone || !model) return false;

    const rect = model.getBoundingClientRect();
    const zoneRect = modelZone.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const key = `${width}x${height}:${imageUrl === cachedBlastSnapshot ? 'model' : 'fallback'}`;

    if (!force && preparedBlastKey === key && shatterLayer.querySelector('.bs-intro-shard')) return true;

    clearAnimationSet(liveShardAnimations);
    clearAnimationSet(liveSparkAnimations);
    shatterLayer.replaceChildren();
    shatterLayer.style.left = `${rect.left - zoneRect.left}px`;
    shatterLayer.style.top = `${rect.top - zoneRect.top}px`;
    shatterLayer.style.width = `${width}px`;
    shatterLayer.style.height = `${height}px`;

    // Smaller cells + restrained Z travel produce a controlled premium blast
    // instead of a few huge flat triangles flying across the whole viewport.
    const cols = width < 520 ? 7 : 8;
    const rows = height < 460 ? 6 : 7;
    const cellW = width / cols;
    const cellH = height / rows;
    const centerX = width * .5;
    const centerY = height * .49;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cellW;
        const y = row * cellH;
        for (let tri = 0; tri < 2; tri++) {
          const shard = document.createElement('span');
          shard.className = 'bs-intro-shard';
          if ((row * cols + col + tri) % 11 === 0) shard.classList.add('is-warm');
          if ((row + col + tri) % 13 === 0) shard.classList.add('is-bright');
          shard.style.left = `${x - .5}px`;
          shard.style.top = `${y - .5}px`;
          shard.style.width = `${cellW + 1}px`;
          shard.style.height = `${cellH + 1}px`;
          shard.style.backgroundImage = `url("${imageUrl}")`;
          shard.style.backgroundSize = `${width}px ${height}px`;
          shard.style.backgroundPosition = `${-x}px ${-y}px`;
          shard.style.clipPath = tri === 0
            ? 'polygon(0 0,100% 0,7% 92%)'
            : 'polygon(100% 0,100% 100%,7% 92%)';
          shard.style.opacity = '0';
          shard.style.transform = 'translate3d(0,0,0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)';

          const sx = x + cellW * (tri ? .70 : .30);
          const sy = y + cellH * (tri ? .68 : .32);
          // V11: keep logo shards INSIDE the viewport, including the farthest pieces.
          const originVX = rect.left + sx;
          const originVY = rect.top + sy;
          const marginX = Math.max(36, Math.min(76, innerWidth * .036));
          const marginY = Math.max(36, Math.min(68, innerHeight * .046));
          let targetX = randRange(marginX, Math.max(marginX + 1, innerWidth - marginX));
          let targetY = randRange(marginY, Math.max(marginY + 1, innerHeight - marginY));
          for (let tries = 0; tries < 6 && Math.hypot(targetX-originVX, targetY-originVY) < 190; tries++) {
            targetX = randRange(marginX, Math.max(marginX + 1, innerWidth - marginX));
            targetY = randRange(marginY, Math.max(marginY + 1, innerHeight - marginY));
          }
          const tx = targetX - originVX;
          const ty = targetY - originVY;
          const tz = randRange(-520, 700);
          const rx = randRange(-98, 98);
          const ry = randRange(-132, 132);
          const rz = randRange(-42, 42);
          const delay = randRange(0, 260);
          const duration = BLAST_DURATION + randRange(-120, 520);

          shard.dataset.tx = tx.toFixed(3);
          shard.dataset.ty = ty.toFixed(3);
          shard.dataset.tz = tz.toFixed(3);
          shard.dataset.rx = rx.toFixed(3);
          shard.dataset.ry = ry.toFixed(3);
          shard.dataset.rz = rz.toFixed(3);
          shard.dataset.delay = delay.toFixed(1);
          shard.dataset.duration = duration.toFixed(1);
          shard.dataset.driftX = randRange(-32, 32).toFixed(2);
          shard.dataset.driftY = randRange(-26, 26).toFixed(2);
          shard.dataset.driftZ = randRange(-40, 46).toFixed(2);
          shard.dataset.driftR = randRange(-7, 7).toFixed(2);
          shard.dataset.driftDuration = randRange(4200, 6200).toFixed(0);
          shatterLayer.appendChild(shard);
        }
      }
    }

    addBlastSparks(width, height);
    preparedBlastKey = key;
    return true;
  }

  async function primeBlastSnapshot(force = false) {
    if (!model || !shatterLayer || !modelZone) return '';
    if (!force && cachedBlastSnapshot && preparedBlastKey.startsWith(blastGeometryKey())) return cachedBlastSnapshot;
    if (snapshotPrimePromise) return snapshotPrimePromise;

    snapshotPrimePromise = (async () => {
      const snap = await captureModelSnapshot();
      if (snap) cachedBlastSnapshot = snap;
      buildBlastFragments(cachedBlastSnapshot || FALLBACK_BLAST_IMAGE, true);
      return cachedBlastSnapshot;
    })();

    try {
      return await snapshotPrimePromise;
    } finally {
      snapshotPrimePromise = null;
    }
  }

  function ensureBlastFragmentsNow() {
    const image = cachedBlastSnapshot || FALLBACK_BLAST_IMAGE;
    const geometry = blastGeometryKey();
    const mode = cachedBlastSnapshot ? 'model' : 'fallback';
    const expected = `${geometry}:${mode}`;
    if (preparedBlastKey !== expected || !shatterLayer?.querySelector('.bs-intro-shard')) {
      return buildBlastFragments(image, true);
    }
    return true;
  }

  function updateHoldProgress() {
    if (!pointer.down || shatterActive) return;
    const elapsed = performance.now() - holdStartedAt;
    const progress = Math.max(0, Math.min(1, elapsed / HOLD_TO_BLAST_MS));
    intro.style.setProperty('--blast-progress', progress.toFixed(4));
    if (progress < 1) holdProgressRaf = requestAnimationFrame(updateHoldProgress);
  }


  function clearPageFragments(restoreSources = true) {
    for (const anim of livePageAnimations) {
      try { anim.cancel(); } catch (_) {}
    }
    livePageAnimations.clear();
    pageShatterLayer.replaceChildren();
    pageFragmentsBuilt = false;
    if (restoreSources) {
      pageFragmentSources.forEach(sel => document.querySelector(sel)?.classList.remove('bs-page-source-hidden'));
    }
  }

  function sanitizeFragmentClone(clone) {
    clone.removeAttribute?.('id');
    clone.querySelectorAll?.('[id]').forEach(el => el.removeAttribute('id'));
    clone.querySelectorAll?.('a,button,input,select,textarea,[tabindex]').forEach(el => {
      el.setAttribute('tabindex', '-1');
      el.style.pointerEvents = 'none';
    });
    clone.setAttribute('aria-hidden', 'true');
  }

  function buildPageFragments() {
    clearPageFragments(false);
    const viewportCx = innerWidth * .50;
    const viewportCy = innerHeight * .48;

    for (const selector of pageFragmentSources) {
      const source = document.querySelector(selector);
      if (!source || source.hidden) continue;
      const rect = source.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;

      // Larger slabs match the reference better than dozens of tiny confetti pieces.
      const cols = rect.width > 700 ? 4 : (rect.width > 360 ? 3 : 2);
      const rows = rect.height > 220 ? 3 : 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          for (let tri = 0; tri < 2; tri++) {
            const x0 = col / cols * 100;
            const x1 = (col + 1) / cols * 100;
            const y0 = row / rows * 100;
            const y1 = (row + 1) / rows * 100;
            const clone = source.cloneNode(true);
            sanitizeFragmentClone(clone);
            clone.classList.add('bs-intro-page-fragment');
            clone.style.position = 'fixed';
            clone.style.left = `${rect.left}px`;
            clone.style.top = `${rect.top}px`;
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            clone.style.margin = '0';
            clone.style.inset = 'auto';
            clone.style.zIndex = '1';
            clone.style.opacity = '1';
            clone.style.transform = 'perspective(1000px) translate3d(0,0,0) rotateX(0deg) rotateY(0deg) rotateZ(0deg)';
            clone.style.transformOrigin = `${(x0+x1)/2}% ${(y0+y1)/2}%`;
            clone.style.clipPath = tri === 0
              ? `polygon(${x0}% ${y0}%, ${x1}% ${y0}%, ${x0 + (x1-x0)*.12}% ${y1}%)`
              : `polygon(${x1}% ${y0}%, ${x1}% ${y1}%, ${x0 + (x1-x0)*.12}% ${y1}%)`;

            const pieceCx = rect.left + rect.width * ((x0+x1) / 200);
            const pieceCy = rect.top + rect.height * ((y0+y1) / 200);
            // V11: page pieces are scattered and mixed across the whole screen,
            // but every target stays inside a safe viewport boundary.
            const marginX = Math.max(44, Math.min(88, innerWidth * .042));
            const marginY = Math.max(44, Math.min(74, innerHeight * .052));
            let targetX = randRange(marginX, Math.max(marginX + 1, innerWidth - marginX));
            let targetY = randRange(marginY, Math.max(marginY + 1, innerHeight - marginY));
            for (let tries = 0; tries < 6 && Math.hypot(targetX-pieceCx, targetY-pieceCy) < 150; tries++) {
              targetX = randRange(marginX, Math.max(marginX + 1, innerWidth - marginX));
              targetY = randRange(marginY, Math.max(marginY + 1, innerHeight - marginY));
            }
            const tx = targetX - pieceCx;
            const ty = targetY - pieceCy;
            const tz = randRange(-430, 560);
            const rx = randRange(-88, 88);
            const ry = randRange(-112, 112);
            const rz = randRange(-32, 32);
            clone.dataset.tx = tx.toFixed(2);
            clone.dataset.ty = ty.toFixed(2);
            clone.dataset.tz = tz.toFixed(2);
            clone.dataset.rx = rx.toFixed(2);
            clone.dataset.ry = ry.toFixed(2);
            clone.dataset.rz = rz.toFixed(2);
            clone.dataset.delay = randRange(0, 220).toFixed(0);
            clone.dataset.duration = randRange(2450, 3150).toFixed(0);
            clone.dataset.driftX = randRange(-22, 22).toFixed(2);
            clone.dataset.driftY = randRange(-18, 18).toFixed(2);
            clone.dataset.driftZ = randRange(-32, 36).toFixed(2);
            clone.dataset.driftR = randRange(-5.2, 5.2).toFixed(2);
            pageShatterLayer.appendChild(clone);
          }
        }
      }
    }
    pageFragmentsBuilt = pageShatterLayer.children.length > 0;
    return pageFragmentsBuilt;
  }

  function pageFragmentTransform(piece, factor = 1, drift = null) {
    const tx = Number(piece.dataset.tx || 0) * factor + (drift?.x || 0);
    const ty = Number(piece.dataset.ty || 0) * factor + (drift?.y || 0);
    const tz = Number(piece.dataset.tz || 0) * factor + (drift?.z || 0);
    const rx = Number(piece.dataset.rx || 0) * factor;
    const ry = Number(piece.dataset.ry || 0) * factor;
    const rz = Number(piece.dataset.rz || 0) * factor + (drift?.r || 0);
    return `perspective(1000px) translate3d(${tx}px,${ty}px,${tz}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
  }

  function startPageFragmentDrift(piece) {
    if (!shatterActive || !pointer.down) return;
    const base = pageFragmentTransform(piece, 1);
    const drift = {
      x: Number(piece.dataset.driftX || 0),
      y: Number(piece.dataset.driftY || 0),
      z: Number(piece.dataset.driftZ || 0),
      r: Number(piece.dataset.driftR || 0)
    };
    const alt = pageFragmentTransform(piece, 1, drift);
    const anim = piece.animate([
      { transform: base, offset: 0 },
      { transform: alt, offset: .5 },
      { transform: base, offset: 1 }
    ], {
      duration: randRange(3000, 5200),
      iterations: Infinity,
      direction: 'alternate',
      easing: 'ease-in-out'
    });
    piece._bsPageDrift = anim;
    livePageAnimations.add(anim);
  }

  function animatePageBlast() {
    if (!pageFragmentsBuilt) buildPageFragments();
    if (!pageFragmentsBuilt) return;
    pageFragmentSources.forEach(sel => document.querySelector(sel)?.classList.add('bs-page-source-hidden'));

    [...pageShatterLayer.children].forEach(piece => {
      const delay = Number(piece.dataset.delay || 0);
      const duration = Number(piece.dataset.duration || 1050);
      const t0 = pageFragmentTransform(piece, 0);
      const t1 = pageFragmentTransform(piece, .10);
      const t2 = pageFragmentTransform(piece, .38);
      const t3 = pageFragmentTransform(piece, .73);
      const t4 = pageFragmentTransform(piece, 1);
      const anim = piece.animate([
        { transform: t0, opacity: 1, filter: 'brightness(1)', offset: 0 },
        { transform: t1, opacity: 1, filter: 'brightness(1.08) contrast(1.02)', offset: .16 },
        { transform: t2, opacity: 1, filter: 'brightness(1.04) contrast(1.03)', offset: .40 },
        { transform: t3, opacity: 1, filter: 'brightness(1.00) contrast(1.04)', offset: .72 },
        { transform: t4, opacity: 1, filter: 'brightness(.98) contrast(1.05)', offset: 1 }
      ], { duration, delay, fill: 'forwards', easing: 'cubic-bezier(.22,.56,.18,1)' });
      piece._bsPageBlast = anim;
      livePageAnimations.add(anim);
      anim.addEventListener('finish', () => {
        livePageAnimations.delete(anim);
        if (!shatterActive || !pointer.down) return;
        try { anim.commitStyles(); } catch (_) { piece.style.transform = t4; }
        try { anim.cancel(); } catch (_) {}
        startPageFragmentDrift(piece);
      }, { once: true });
    });
  }

  function commitAnimationFrame(element, animation, fallbackTransform, fallbackOpacity = '1') {
    if (!element || !animation) return false;
    try {
      // Commit the exact in-between frame before cancelling. This avoids the
      // release-time snap caused by cancelling an infinite drift animation.
      animation.commitStyles();
      animation.cancel();
      return true;
    } catch (_) {
      // Compatibility fallback. Only read computed style if commitStyles is
      // unavailable; modern Chromium normally stays on the fast path above.
      try {
        const cs = getComputedStyle(element);
        element.style.transform = cs.transform === 'none' ? fallbackTransform : cs.transform;
        element.style.opacity = cs.opacity || fallbackOpacity;
        element.style.filter = cs.filter || '';
      } catch (_) {
        element.style.transform = fallbackTransform;
        element.style.opacity = fallbackOpacity;
      }
      try { animation.cancel(); } catch (_) {}
      return false;
    }
  }

  function freezePageFragments() {
    const pieces = [...pageShatterLayer.children];
    pieces.forEach(piece => {
      const fallback = pageFragmentTransform(piece, 1);
      const active = piece._bsPageDrift || piece._bsPageBlast;
      if (active) commitAnimationFrame(piece, active, fallback, '1');
      else if (!piece.style.transform) piece.style.transform = fallback;
      try { piece._bsPageBlast?.cancel(); } catch (_) {}
      try { piece._bsPageDrift?.cancel(); } catch (_) {}
      piece._bsPageBlast = null;
      piece._bsPageDrift = null;
    });
    livePageAnimations.clear();
    return pieces;
  }

  function startPageReassemblyAnimations(pieces) {
    let longest = 0;
    pieces.forEach((piece, index) => {
      const from = piece.style.transform || pageFragmentTransform(piece, 1);
      const fromOpacity = Number.parseFloat(piece.style.opacity || '1') || 1;
      // Tiny stagger keeps depth without delaying the response to mouse-up.
      const delay = reduceMotion ? 0 : Math.min(54, (index % 11) * 3.2);
      longest = Math.max(longest, delay);
      const anim = piece.animate([
        { transform: from, opacity: fromOpacity, offset: 0 },
        { transform: pageFragmentTransform(piece, 0), opacity: 1, offset: 1 }
      ], {
        duration: REASSEMBLE_DURATION,
        delay,
        fill: 'forwards',
        easing: 'cubic-bezier(.16,.78,.20,1)'
      });
      piece._bsPageReturn = anim;
      livePageAnimations.add(anim);
    });
    window.setTimeout(() => clearPageFragments(true), REASSEMBLE_DURATION + longest + 90);
  }

  function animatePageReassembly() {
    const pieces = freezePageFragments();
    requestAnimationFrame(() => startPageReassemblyAnimations(pieces));
  }

  function flashBlast() {
    if (!modelZone) return;
    clearTimeout(blastFlashTimer);
    modelZone.classList.remove('is-blast-flash');
    void modelZone.offsetWidth;
    modelZone.classList.add('is-blast-flash');
    blastFlashTimer = window.setTimeout(() => modelZone.classList.remove('is-blast-flash'), 320);
  }

  function finalShardTransform(shard, factor = 1, drift = null) {
    const tx = Number(shard.dataset.tx || 0) * factor + (drift?.x || 0);
    const ty = Number(shard.dataset.ty || 0) * factor + (drift?.y || 0);
    const tz = Number(shard.dataset.tz || 0) * factor + (drift?.z || 0);
    const rx = Number(shard.dataset.rx || 0) * factor;
    const ry = Number(shard.dataset.ry || 0) * factor;
    const rz = Number(shard.dataset.rz || 0) * factor + (drift?.r || 0);
    return `translate3d(${tx}px, ${ty}px, ${tz}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(1)`;
  }

  function startShardDrift(shard) {
    if (!shatterActive || !pointer.down) return;
    const drift = {
      x: Number(shard.dataset.driftX || 0),
      y: Number(shard.dataset.driftY || 0),
      z: Number(shard.dataset.driftZ || 0),
      r: Number(shard.dataset.driftR || 0)
    };
    const base = finalShardTransform(shard, 1);
    const alt = finalShardTransform(shard, 1, drift);
    shard.style.opacity = '1';
    shard.style.transform = base;
    const anim = shard.animate([
      { transform: base, offset: 0 },
      { transform: alt, offset: .5 },
      { transform: base, offset: 1 }
    ], {
      duration: Number(shard.dataset.driftDuration || 1800),
      iterations: Infinity,
      easing: 'ease-in-out'
    });
    shard._bsDriftAnimation = anim;
    liveShardAnimations.add(anim);
  }

  function animateBlastShards() {
    if (!shatterLayer) return;
    const shards = [...shatterLayer.querySelectorAll('.bs-intro-shard')];
    const sparks = [...shatterLayer.querySelectorAll('.bs-intro-blast-spark')];

    clearAnimationSet(liveShardAnimations);
    clearAnimationSet(liveSparkAnimations);

    shards.forEach((shard) => {
      const delay = Number(shard.dataset.delay || 0);
      const duration = Number(shard.dataset.duration || BLAST_DURATION);
      const t0 = finalShardTransform(shard, 0);
      const t1 = finalShardTransform(shard, .10);
      const t2 = finalShardTransform(shard, .36);
      const t3 = finalShardTransform(shard, .72);
      const t4 = finalShardTransform(shard, 1);

      shard.style.opacity = '0';
      shard.style.transform = t0;

      const anim = shard.animate([
        { transform: t0, opacity: 0, filter: 'brightness(.92) contrast(1.02)', offset: 0 },
        { transform: t1, opacity: 1, filter: 'brightness(1.10) contrast(1.05)', offset: .12 },
        { transform: t2, opacity: 1, filter: 'brightness(1.02) contrast(1.04)', offset: .34 },
        { transform: t3, opacity: 1, filter: 'brightness(.98) contrast(1.03)', offset: .67 },
        { transform: t4, opacity: 1, filter: 'brightness(.96) contrast(1.03)', offset: 1 }
      ], {
        duration,
        delay,
        fill: 'forwards',
        easing: 'cubic-bezier(.20,.58,.16,1)'
      });

      shard._bsBlastAnimation = anim;
      liveShardAnimations.add(anim);
      anim.addEventListener('finish', () => {
        if (!shatterActive || !pointer.down) return;
        try { anim.commitStyles(); } catch (_) {
          shard.style.opacity = '1';
          shard.style.transform = t4;
        }
        try { anim.cancel(); } catch (_) {}
        liveShardAnimations.delete(anim);
        startShardDrift(shard);
      }, { once: true });
    });

    sparks.forEach((spark) => {
      const angle = Number(spark.dataset.angle || 0);
      const deg = angle * 180 / Math.PI;
      const length = Number(spark.dataset.length || 54);
      const delay = Number(spark.dataset.delay || 0);
      spark.style.opacity = '0';
      spark.style.width = `${length}px`;
      const anim = spark.animate([
        { opacity: 0, transform: `rotate(${deg}deg) scaleX(.08)`, offset: 0 },
        { opacity: .72, transform: `rotate(${deg}deg) scaleX(.65)`, offset: .28 },
        { opacity: .34, transform: `rotate(${deg}deg) scaleX(1)`, offset: .7 },
        { opacity: 0, transform: `rotate(${deg}deg) scaleX(1.15)`, offset: 1 }
      ], {
        duration: 520 + randRange(-60, 110),
        delay,
        fill: 'forwards',
        easing: 'cubic-bezier(.12,.74,.18,1)'
      });
      liveSparkAnimations.add(anim);
      anim.addEventListener('finish', () => {
        liveSparkAnimations.delete(anim);
        try { anim.cancel(); } catch (_) {}
      }, { once: true });
    });
  }

  function animateModelOut() {
    if (!model) return;
    try { modelFadeAnimation?.cancel(); } catch (_) {}
    modelFadeAnimation = model.animate([
      { opacity: 1, filter: 'brightness(1) saturate(1)', offset: 0 },
      { opacity: .42, filter: 'brightness(.72) saturate(.72)', offset: .38 },
      { opacity: .20, filter: 'brightness(.34) saturate(.26) contrast(1.30)', offset: 1 }
    ], {
      duration: reduceMotion ? 260 : 520,
      fill: 'forwards',
      easing: 'cubic-bezier(.16,.72,.16,1)'
    });
  }

  function blastModel() {
    if (shatterActive || shatterBusy || !modelZone || !pointer.down) return;
    shatterBusy = true;
    const ok = ensureBlastFragmentsNow();
    shatterBusy = false;
    if (!pointer.down || !ok) return;

    shatterActive = true;
    intro.style.setProperty('--blast-progress', '1');
    modelZone.classList.remove('is-charging', 'is-reassembling');
    modelZone.classList.add('is-shattered');
    flashBlast();
    animateModelOut();
    buildPageFragments();
    animatePageBlast();
    animateBlastShards();
  }

  function stopHoldProgress() {
    cancelAnimationFrame(holdProgressRaf);
    holdProgressRaf = 0;
  }

  function freezeAndCancelShardAnimations() {
    const shards = shatterLayer ? [...shatterLayer.querySelectorAll('.bs-intro-shard')] : [];
    for (const shard of shards) {
      const fallback = finalShardTransform(shard, 1);
      const active = shard._bsDriftAnimation || shard._bsBlastAnimation;
      if (active) commitAnimationFrame(shard, active, fallback, '1');
      else if (!shard.style.transform) shard.style.transform = fallback;
      try { shard._bsBlastAnimation?.cancel(); } catch (_) {}
      try { shard._bsDriftAnimation?.cancel(); } catch (_) {}
      shard._bsBlastAnimation = null;
      shard._bsDriftAnimation = null;
    }
    liveShardAnimations.clear();
    return shards;
  }

  function animateReassembly() {
    if (!modelZone || !shatterLayer) return;

    // First freeze every animated piece on its exact current visual frame.
    // No per-fragment getComputedStyle loop on Chromium => much less hitching.
    const shards = freezeAndCancelShardAnimations();
    const pagePieces = freezePageFragments();
    clearAnimationSet(liveSparkAnimations);

    modelZone.classList.remove('is-shattered');
    modelZone.classList.add('is-reassembling');

    // Start the return on the next paint. Separating freeze and playback by a
    // single frame prevents the release handler from doing all layout + animation
    // setup in the same event frame.
    requestAnimationFrame(() => {
      startPageReassemblyAnimations(pagePieces);

      shards.forEach((shard, index) => {
        const fromTransform = shard.style.transform || finalShardTransform(shard, 1);
        const fromOpacity = Number.parseFloat(shard.style.opacity || '1') || 1;
        const delay = reduceMotion ? 0 : Math.min(42, (index % 13) * 2.4);
        const anim = shard.animate([
          { transform: fromTransform, opacity: fromOpacity, offset: 0 },
          { transform: finalShardTransform(shard, 0), opacity: 0, offset: 1 }
        ], {
          duration: REASSEMBLE_DURATION,
          delay,
          fill: 'forwards',
          easing: 'cubic-bezier(.16,.78,.20,1)'
        });
        liveShardAnimations.add(anim);
        anim.addEventListener('finish', () => {
          liveShardAnimations.delete(anim);
          shard.style.opacity = '0';
          shard.style.transform = finalShardTransform(shard, 0);
          try { anim.cancel(); } catch (_) {}
        }, { once: true });
      });

      if (model) {
        try { modelFadeAnimation?.cancel(); } catch (_) {}
        // The ghost core is already visible during blast. Fade it back from the
        // known shattered opacity rather than forcing a synchronous style read.
        modelFadeAnimation = model.animate([
          { opacity: .13, filter: 'brightness(.34) saturate(.12) contrast(1.24)', offset: 0 },
          { opacity: .48, filter: 'brightness(.72) saturate(.74) contrast(1.12)', offset: .45 },
          { opacity: 1, filter: 'brightness(1) saturate(1) contrast(1)', offset: 1 }
        ], {
          duration: REASSEMBLE_DURATION,
          delay: 0,
          fill: 'forwards',
          easing: 'cubic-bezier(.16,.78,.20,1)'
        });
        modelFadeAnimation.addEventListener('finish', () => {
          try { modelFadeAnimation.commitStyles(); } catch (_) {}
          try { modelFadeAnimation.cancel(); } catch (_) {}
          model.style.opacity = '';
          model.style.filter = '';
          model.style.transform = '';
        }, { once: true });
      }
    });

    reassembleTimer = window.setTimeout(() => {
      modelZone.classList.remove('is-reassembling');
      intro.style.setProperty('--blast-progress', '0');
      for (const shard of shards) {
        shard.style.opacity = '0';
        shard.style.transform = finalShardTransform(shard, 0);
      }
    }, REASSEMBLE_DURATION + 180);
  }

  function resetShatter(immediate = false) {
    pointer.down = false;
    holdPointerId = null;
    stopHoldProgress();
    clearTimeout(shatterTimer);
    clearTimeout(reassembleTimer);
    shatterTimer = 0;
    modelZone?.classList.remove('is-charging');
    intro.classList.remove('is-blast-charging');

    if (!modelZone) return;
    if (immediate) {
      shatterActive = false;
      shatterBusy = false;
      clearAnimationSet(liveShardAnimations);
      clearAnimationSet(liveSparkAnimations);
      clearPageFragments(true);
      try { modelFadeAnimation?.cancel(); } catch (_) {}
      modelFadeAnimation = null;
      modelZone.classList.remove('is-shattered', 'is-reassembling', 'is-blast-flash');
      intro.style.setProperty('--blast-progress', '0');
      if (model) {
        model.style.opacity = '';
        model.style.filter = '';
        model.style.transform = '';
      }
      shatterLayer?.querySelectorAll('.bs-intro-shard').forEach((shard) => {
        shard.style.opacity = '0';
        shard.style.transform = finalShardTransform(shard, 0);
      });
      return;
    }

    if (shatterActive) {
      shatterActive = false;
      animateReassembly();
    } else {
      intro.style.setProperty('--blast-progress', '0');
    }
  }

  function beginBlast(event) {
    if (!modelZone || pointer.down || shatterActive) return;
    if (event?.button != null && event.button !== 0) return;

    if (event) {
      setPointer(event);
      try { event.preventDefault(); } catch (_) {}
    }

    clearTimeout(reassembleTimer);
    if (modelZone.classList.contains('is-reassembling')) modelZone.classList.remove('is-reassembling');

    pointer.down = true;
    holdPointerId = event?.pointerId ?? null;
    holdStartedAt = performance.now();
    intro.style.setProperty('--blast-progress', '0');
    intro.classList.add('is-blast-charging');
    modelZone.classList.add('is-charging');
    tryPlayAudio();

    stopHoldProgress();
    holdProgressRaf = requestAnimationFrame(updateHoldProgress);
    clearTimeout(shatterTimer);
    shatterTimer = window.setTimeout(blastModel, HOLD_TO_BLAST_MS);
  }

  function eventHitsModelZone(event) {
    if (!event || !modelZone) return false;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.includes(modelZone) || modelZone.contains(event.target);
  }

  window.addEventListener('pointerdown', (event) => {
    if (eventHitsModelZone(event)) beginBlast(event);
  }, { capture: true, passive: false });

  window.addEventListener('mousedown', (event) => {
    if (!pointer.down && eventHitsModelZone(event)) beginBlast(event);
  }, { capture: true, passive: false });

  window.addEventListener('pointerup', () => resetShatter(false), { capture: true });
  window.addEventListener('pointercancel', () => resetShatter(false), { capture: true });
  window.addEventListener('mouseup', () => { if (pointer.down) resetShatter(false); }, { capture: true });
  window.addEventListener('blur', () => resetShatter(false));

  modelZone?.addEventListener('keydown', (event) => {
    if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) {
      event.preventDefault();
      beginBlast();
    }
  });
  modelZone?.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') resetShatter(false);
  });

  if (model) {
    const prime = () => setTimeout(() => { primeBlastSnapshot(true); }, 260);
    model.addEventListener('load', prime);
    if (model.loaded) prime();
    setTimeout(() => { if (!cachedBlastSnapshot) primeBlastSnapshot(false); }, 1800);
  }

  let blastResizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(blastResizeTimer);
    blastResizeTimer = window.setTimeout(() => {
      preparedBlastKey = '';
      if (!pointer.down && !shatterActive) primeBlastSnapshot(true);
    }, 260);
  }, { passive: true });

  // ------------------------------
  // INTERACTIVE SIGNAL LINES — V8
  // The background strings stay calm. Electricity appears ONLY when the
  // pointer is actually close to one of the strings, then bridges that string
  // to its closest neighbour. The FX uses a separate upper canvas so the arc
  // remains visible above the grain/vignette instead of being buried by them.
  // ------------------------------
  if (!ctx || !canvas || !fxCtx || !fxCanvas) return;

  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let w = innerWidth;
  let h = innerHeight;
  let hoverLineIndex = -1;
  let hoverNeighborIndex = -1;
  let hoverDistance = Infinity;
  let arcStrength = 0;
  let lastArcContactAt = 0;
  let lastContactX = pointer.x;
  let lastContactY = pointer.y;
  let lineContactLatched = false;
  let lastRealLineHitAt = 0;
  let nextArcAllowedAt = 0;
  const arcStrike = { active: false, until: 0, lineA: -1, lineB: -1, x: 0, y: 0, seed: 0 };
  const diagonalLines = [];
  const particles = [];

  function resizeCanvasPlane(el, context) {
    el.width = Math.max(1, Math.round(w * dpr));
    el.height = Math.max(1, Math.round(h * dpr));
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetScene() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = innerWidth;
    h = innerHeight;
    resizeCanvasPlane(canvas, ctx);
    resizeCanvasPlane(fxCanvas, fxCtx);

    diagonalLines.length = 0;
    const count = Math.max(10, Math.min(14, Math.round(w / 150)));
    for (let i = 0; i < count; i++) {
      const y = (i / Math.max(1, count - 1)) * (h * 1.34) - h * .18;
      diagonalLines.push({
        baseY: y,
        slope: -(.15 + Math.random() * .24),
        drift: Math.random() * Math.PI * 2,
        speed: .00014 + Math.random() * .00015,
        alpha: .042 + Math.random() * .042,
        width: Math.random() < .14 ? .9 : .58
      });
    }

    particles.length = 0;
    const pCount = Math.max(12, Math.min(34, Math.round((w * h) / 52000)));
    for (let i = 0; i < pCount; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: .25 + Math.random() * .65,
        twinkle: Math.random() * Math.PI * 2,
        speed: .003 + Math.random() * .006,
        alpha: .03 + Math.random() * .10
      });
    }
  }

  function rawLineY(line, x, t) {
    const drift = reduceMotion ? 0 : Math.sin(t * line.speed + line.drift) * 7;
    return line.baseY + line.slope * x + drift;
  }

  function startOneShotArc(now, primaryIndex, neighbourIndex) {
    const duration = Math.round(randRange(540, 650));
    arcStrike.active = true;
    arcStrike.until = now + duration;
    arcStrike.lineA = primaryIndex;
    arcStrike.lineB = neighbourIndex;
    arcStrike.x = pointer.x;
    arcStrike.y = pointer.y;
    arcStrike.seed = Math.floor(Math.random() * 100000);
    lastArcContactAt = now;
    lastContactX = pointer.x;
    lastContactY = pointer.y;
    nextArcAllowedAt = now + duration + 120;
    playElectricSfx(duration);
  }

  function updateHoveredLines(now) {
    hoverLineIndex = -1;
    hoverNeighborIndex = -1;
    hoverDistance = Infinity;
    if (!pointer.active || pointer.down) {
      if (now - lastRealLineHitAt > 110) lineContactLatched = false;
      return;
    }

    const distances = diagonalLines.map((line, i) => {
      const y = rawLineY(line, pointer.x, now);
      return { i, y, d: Math.abs(y - pointer.y) };
    }).sort((a, b) => a.d - b.d);

    const hitRadius = Math.max(22, Math.min(31, w * .016));
    if (!distances.length || distances[0].d > hitRadius) {
      if (now - lastRealLineHitAt > 110) lineContactLatched = false;
      return;
    }

    hoverLineIndex = distances[0].i;
    hoverDistance = distances[0].d;
    const primaryY = distances[0].y;
    const neighbours = distances.slice(1)
      .map(item => ({ ...item, gap: Math.abs(item.y - primaryY) }))
      .filter(item => item.gap > 28 && item.gap < Math.min(250, h * .32))
      .sort((a, b) => a.gap - b.gap);
    if (!neighbours.length) return;

    hoverNeighborIndex = neighbours[0].i;
    lastRealLineHitAt = now;
    if (!lineContactLatched && now >= nextArcAllowedAt) {
      lineContactLatched = true;
      startOneShotArc(now, hoverLineIndex, hoverNeighborIndex);
    }
  }

  function lineY(line, index, x, t) {
    let y = rawLineY(line, x, t);
    if (index === hoverLineIndex || index === hoverNeighborIndex) {
      const dx = x - pointer.x;
      const influence = Math.exp(-(dx * dx) / (2 * 96 * 96));
      const direction = index === hoverLineIndex ? 1 : -1;
      y += Math.sin(dx * .026 + t * .0045) * influence * 7 + direction * influence * 2.4;
    }
    return y;
  }

  function seeded(seed) {
    const x = Math.sin(seed * 12.9898 + touchArcSeed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function makeBoltPoints(x1, y1, x2, y2, now, jitterScale = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const segments = Math.max(8, Math.min(16, Math.round(dist / 11)));
    const nx = -dy / dist;
    const ny = dx / dist;
    const points = [{ x: x1, y: y1 }];

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const envelope = Math.sin(Math.PI * t);
      const jitter = (seeded(i * 9.17 + now * .0009) - .5) * 12 * jitterScale * envelope;
      const micro = Math.sin(i * 2.13 + now * .016) * 2.1 * envelope;
      points.push({
        x: x1 + dx * t + nx * (jitter + micro),
        y: y1 + dy * t + ny * (jitter + micro)
      });
    }
    points.push({ x: x2, y: y2 });
    return points;
  }

  function strokeBolt(points, alpha = 1) {
    fxCtx.save();
    fxCtx.lineCap = 'round';
    fxCtx.lineJoin = 'round';

    // restrained blue bloom
    fxCtx.beginPath();
    points.forEach((p, i) => i ? fxCtx.lineTo(p.x, p.y) : fxCtx.moveTo(p.x, p.y));
    fxCtx.strokeStyle = `rgba(63,145,255,${.44 * alpha})`;
    fxCtx.lineWidth = 3.1;
    fxCtx.shadowColor = `rgba(77,166,255,${.78 * alpha})`;
    fxCtx.shadowBlur = 15;
    fxCtx.stroke();

    // bright white/ice core
    fxCtx.beginPath();
    points.forEach((p, i) => i ? fxCtx.lineTo(p.x, p.y) : fxCtx.moveTo(p.x, p.y));
    fxCtx.strokeStyle = `rgba(235,251,255,${.98 * alpha})`;
    fxCtx.lineWidth = .9;
    fxCtx.shadowColor = `rgba(208,246,255,${.90 * alpha})`;
    fxCtx.shadowBlur = 5;
    fxCtx.stroke();
    fxCtx.restore();
  }

  function drawLocalLineGlow(lineIndex, x, now, strength) {
    if (lineIndex < 0) return;
    const line = diagonalLines[lineIndex];
    const span = Math.min(118, w * .075);
    const steps = 18;
    fxCtx.save();
    fxCtx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const px = x - span + (i / steps) * span * 2;
      const py = lineY(line, lineIndex, px, now);
      if (!i) fxCtx.moveTo(px, py); else fxCtx.lineTo(px, py);
    }
    fxCtx.strokeStyle = `rgba(172,226,255,${.16 * strength})`;
    fxCtx.lineWidth = 1.2;
    fxCtx.shadowColor = `rgba(70,160,255,${.28 * strength})`;
    fxCtx.shadowBlur = 8;
    fxCtx.stroke();
    fxCtx.restore();
  }

  function drawTouchArc(now) {
    if (!arcStrike.active) return;
    if (now >= arcStrike.until) {
      arcStrike.active = false;
      arcStrength = 0;
      return;
    }

    // One-shot strike: ~0.54-0.65 s then it disappears even if the cursor stays
    // on the same string. It can fire again after the pointer leaves/re-enters.
    const remaining = arcStrike.until - now;
    const totalWindow = Math.max(1, arcStrike.until - lastArcContactAt);
    const life = 1 - remaining / totalWindow;
    const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, life)));
    const flicker = .70 + Math.random() * .30;
    arcStrength = Math.max(.18, envelope) * flicker;

    const primaryIndex = arcStrike.lineA;
    const neighbourIndex = arcStrike.lineB;
    if (primaryIndex < 0 || neighbourIndex < 0) return;
    if (now - lastTouchArcShuffle > 55) {
      lastTouchArcShuffle = now;
      touchArcSeed = (touchArcSeed + 1 + arcStrike.seed % 7) % 991;
    }

    const pX = arcStrike.x;
    const primary = diagonalLines[primaryIndex];
    const neighbour = diagonalLines[neighbourIndex];
    const dir = pX > w * .72 ? -1 : 1;
    const x1 = pX + dir * 2;
    const bridgeLength = Math.min(105, Math.max(60, w * .061));
    const x2 = pX + dir * bridgeLength;
    const y1 = lineY(primary, primaryIndex, x1, now);
    const y2 = lineY(neighbour, neighbourIndex, x2, now);

    drawLocalLineGlow(primaryIndex, pX, now, arcStrength);
    drawLocalLineGlow(neighbourIndex, pX + dir * bridgeLength * .55, now, arcStrength * .78);
    const main = makeBoltPoints(x1, y1, x2, y2, now, 1.0);
    strokeBolt(main, arcStrength);

    if (main.length > 8) {
      const k = Math.floor(main.length * .50);
      const p = main[k];
      const prev = main[Math.max(0, k - 1)];
      const vx = p.x - prev.x, vy = p.y - prev.y;
      const len = Math.max(1, Math.hypot(vx, vy));
      const nx = -vy / len, ny = vx / len;
      const side = seeded(77 + arcStrike.seed) > .5 ? 1 : -1;
      strokeBolt(makeBoltPoints(p.x, p.y, p.x + nx*19*side + vx/len*8, p.y + ny*19*side + vy/len*8, now, .55), arcStrength * .60);
    }

    fxCtx.save();
    fxCtx.beginPath();
    fxCtx.arc(x1, y1, 1.5, 0, Math.PI * 2);
    fxCtx.fillStyle = `rgba(246,253,255,${.96 * arcStrength})`;
    fxCtx.shadowColor = `rgba(91,180,255,${.84 * arcStrength})`;
    fxCtx.shadowBlur = 9;
    fxCtx.fill();
    fxCtx.restore();
  }

  function draw(now) {
    const dt = Math.min(34, now - lastTime);
    lastTime = now;
    ctx.clearRect(0, 0, w, h);
    fxCtx.clearRect(0, 0, w, h);
    updateHoveredLines(now);

    diagonalLines.forEach((line, index) => {
      ctx.beginPath();
      const steps = 64;
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * w;
        const y = lineY(line, index, x, now);
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const hot = index === hoverLineIndex || index === hoverNeighborIndex;
      ctx.lineWidth = line.width + (hot ? .20 : 0);
      ctx.strokeStyle = `rgba(91,135,166,${line.alpha + (hot ? .095 : 0)})`;
      ctx.stroke();
    });

    particles.forEach((p) => {
      if (!reduceMotion) p.twinkle += p.speed * dt;
      const flicker = reduceMotion ? .52 : .45 + Math.sin(p.twinkle) * .35;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(92,155,184,${p.alpha * flicker})`;
      ctx.fill();
    });

    drawTouchArc(now);
    raf = requestAnimationFrame(draw);
  }

  // Window-level fallback makes the contact detector work even when the mouse
  // is over model-viewer, buttons, or other children that handle pointer events.
  window.addEventListener('pointermove', setPointer, { passive: true });
  window.addEventListener('mousemove', setPointer, { passive: true });
  window.addEventListener('blur', () => { pointer.active = false; });

  resetScene();
  raf = requestAnimationFrame(draw);
  window.addEventListener('resize', resetScene, { passive: true });
})();
