// Camera scanner for price-tag barcodes (EAN-13 / UPC-A / Code 128) and QR codes. Uses the browser's BarcodeDetector where
// available (Chrome on Android, Safari on macOS), otherwise our own 1D reader (bardecode.js) plus the bundled jsQR decoder
// (vendor/jsQR.js, Apache-2.0, loaded only when the camera is first used).
// The camera needs HTTPS (or localhost) and the user's permission.
import { h, t } from './core.js';
import { decodeImage, toGray } from './bardecode.js';

let jsqrLoading = null;
const loadJsQR = () => jsqrLoading || (jsqrLoading = new Promise((res, rej) => { if (window.jsQR) return res(window.jsQR); const s = document.createElement('script'); s.src = 'vendor/jsQR.js'; s.onload = () => res(window.jsQR); s.onerror = () => { jsqrLoading = null; rej(new Error('scanner')); }; document.head.append(s); }));

export const cameraSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// Returns { el, stop }. onCode(text) is called once per distinct code (the same code is ignored for 2.5 s).
export function scanner(onCode, { onError } = {}) {
  const video = h('video', { playsinline: true, muted: true, autoplay: true, class: 'scanvideo', 'aria-label': t('Camera') });
  const frame = h('div', { class: 'scanframe' }); const status = h('div', { class: 'scanstatus' }, t('Starting camera…'));
  const el = h('div', { class: 'scanbox' }, video, frame, status);
  let stream = null, stopped = false, timer = null, last = '', lastAt = 0, detector = null, decode = null, nframe = 0;
  const canvas = document.createElement('canvas'); const g = canvas.getContext('2d', { willReadFrequently: true });
  const hit = (txt) => { const now = Date.now(); if (!txt || (txt === last && now - lastAt < 2500)) return; last = txt; lastAt = now; if (navigator.vibrate) navigator.vibrate(60); el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 250); onCode(txt.trim()); };
  async function tick() {
    if (stopped) return;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        if (detector) { const r = await detector.detect(video); if (r[0]) hit(r[0].rawValue); }
        else if (decode) {
          const w = Math.min(640, video.videoWidth), hh = Math.round((video.videoHeight * w) / video.videoWidth); canvas.width = w; canvas.height = hh; g.drawImage(video, 0, 0, w, hh);
          const img = g.getImageData(0, 0, w, hh); nframe++;
          if (nframe % 2) { const r = decodeImage(toGray(img.data, w, hh), w, hh); if (r) hit(r.text); } // shop/mall barcodes
          else { const r = decode(img.data, w, hh, { inversionAttempts: 'dontInvert' }); if (r) hit(r.data); } // QR
        }
      }
    } catch { /* keep scanning */ }
    timer = setTimeout(tick, detector ? 150 : 120);
  }
  (async () => {
    try {
      if (!cameraSupported()) throw new Error(window.isSecureContext ? t('This device has no camera access') : t('The camera needs a secure (https) connection'));
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (stopped) { stream.getTracks().forEach((x) => x.stop()); return; }
      video.srcObject = stream; await video.play().catch(() => {});
      if ('BarcodeDetector' in window) { try { const f = await window.BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) detector = new window.BarcodeDetector({ formats: f.filter((x) => ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'].includes(x)) }); } catch { detector = null; } }
      if (!detector) decode = await loadJsQR();
      status.textContent = t('Point the camera at the barcode'); tick();
    } catch (e) {
      const msg = e && e.name === 'NotAllowedError' ? t('Camera permission was refused. Allow the camera for this site in the browser settings.') : (e && e.message) || t('Camera not available');
      status.textContent = msg; el.classList.add('err'); if (onError) onError(msg);
    }
  })();
  const stop = () => { stopped = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((x) => x.stop()); };
  // stop the camera when the view is replaced
  const obs = new MutationObserver(() => { if (!document.body.contains(el)) { stop(); obs.disconnect(); } });
  setTimeout(() => obs.observe(document.body, { childList: true, subtree: true }), 0);
  return { el, stop };
}
