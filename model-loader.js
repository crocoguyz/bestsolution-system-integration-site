(() => {
  const MODEL_URL = './images/3D-BS-logo.glb';
  const LOCAL_DATA_SCRIPT = './assets/3d-model-data.js';
  let blobUrl = null;

  function models() {
    return [...document.querySelectorAll('model-viewer[data-bs-model]')];
  }

  function markState(el, state) {
    el.dataset.modelState = state;
    if (el.id === 'bsIntroModel') {
      const zone = document.getElementById('bsIntroModelZone');
      zone?.classList.toggle('model-ready', state === 'ready');
      zone?.classList.toggle('model-error', state === 'error');
    }
  }

  function wireModel(el) {
    if (el.dataset.modelWired === 'true') return;
    el.dataset.modelWired = 'true';
    el.addEventListener('load', () => markState(el, 'ready'));
    el.addEventListener('error', () => markState(el, 'error'));
  }

  function applySource(src) {
    models().forEach((el) => {
      wireModel(el);
      markState(el, 'loading');
      el.setAttribute('src', src);
    });
  }

  function base64ToBlobUrl(base64) {
    const clean = String(base64 || '').replace(/\s+/g, '');
    const chunkChars = 1024 * 1024;
    const byteParts = [];
    for (let offset = 0; offset < clean.length; offset += chunkChars) {
      const binary = atob(clean.slice(offset, offset + chunkChars));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      byteParts.push(bytes);
    }
    return URL.createObjectURL(new Blob(byteParts, { type: 'model/gltf-binary' }));
  }

  function loadLocalEmbeddedModel() {
    if (window.BS_3D_MODEL_BASE64) {
      blobUrl = base64ToBlobUrl(window.BS_3D_MODEL_BASE64);
      applySource(blobUrl);
      return;
    }

    const script = document.createElement('script');
    script.src = LOCAL_DATA_SCRIPT;
    script.async = true;
    script.onload = () => {
      try {
        if (!window.BS_3D_MODEL_BASE64) throw new Error('Embedded 3D model data missing');
        blobUrl = base64ToBlobUrl(window.BS_3D_MODEL_BASE64);
        applySource(blobUrl);
        // Let the large base64 string be reclaimed after the Blob is built.
        try { delete window.BS_3D_MODEL_BASE64; } catch (_) { window.BS_3D_MODEL_BASE64 = null; }
      } catch (error) {
        console.error('[Best Solution] Local 3D model fallback failed:', error);
        models().forEach((el) => markState(el, 'error'));
      }
    };
    script.onerror = () => {
      console.error('[Best Solution] Could not load local 3D model data.');
      models().forEach((el) => markState(el, 'error'));
    };
    document.head.appendChild(script);
  }

  function init() {
    models().forEach(wireModel);
    // file:// blocks fetch/XHR access to sibling .glb files in Chromium.
    // Use an embedded Blob only for direct double-click previews.
    if (location.protocol === 'file:') loadLocalEmbeddedModel();
    else applySource(MODEL_URL);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.addEventListener('pagehide', () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, { once: true });
})();
