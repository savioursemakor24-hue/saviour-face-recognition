/** Saviour AI Mobile App v2.1 Deployment: 2026-11-22 14:40:46 UTC **/
/**
 * Saviour AI - Mobile Biometric Face ID Engine (v3.0)
 * Clean Mobile App Interface: Direct Access, Snap/Auto-Scan, Upload, JSON, Pass/Fail, Auto-Log, PWA
 */

// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const CONFIG = {
  DEFAULT_API_URL: 'https://saviour-face-recognition.onrender.com',
  STORAGE_KEY_API: 'SAVIOUR_API_BASE',
  STORAGE_KEY_SOUND: 'SAVIOUR_SOUND_ENABLED',
  STORAGE_KEY_HAPTIC: 'SAVIOUR_HAPTIC_ENABLED',
  STORAGE_KEY_HISTORY: 'SAVIOUR_SCAN_HISTORY',
  COSINE_THRESHOLD: 0.4000
};

let state = {
  apiUrl: localStorage.getItem(CONFIG.STORAGE_KEY_API) || CONFIG.DEFAULT_API_URL,
  soundEnabled: localStorage.getItem(CONFIG.STORAGE_KEY_SOUND) !== 'false',
  hapticEnabled: localStorage.getItem(CONFIG.STORAGE_KEY_HAPTIC) !== 'false',
  activeTab: 'scanner',
  scanMode: 'manual', // 'manual' | 'auto'
  facingMode: 'user', // 'user' | 'environment'
  cameraStream: null,
  torchActive: false,
  isScanning: false,
  autoScanTimer: null,
  selectedFile: null,
  audioCtx: null,
  deferredPwaPrompt: null,
  latestJsonResponse: null,
  history: []
};

// Load persistent history
try {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEY_HISTORY);
  if (saved) state.history = JSON.parse(saved);
} catch (e) {
  state.history = [];
}

// ==========================================
// 2. INITIALIZATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  state.apiUrl = state.apiUrl.trim().replace(/\/+$/, '');

  initPwaServiceWorker();
  initAudioAndHaptics();
  initCamera();
  checkBackendHealth();
  renderHistoryView();
  updateHistoryBadge();
  setupDropZone();
});

// ==========================================
// PWA INSTALLATION (CLICK ICON TO OPEN FROM HOME SCREEN)
// ==========================================
function initPwaServiceWorker() {
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker Active:', reg.scope))
      .catch((err) => console.warn('Service Worker registration skipped:', err));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPwaPrompt = e;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.add('visible');
  });

  window.addEventListener('appinstalled', () => {
    console.log('Saviour AI Mobile App installed on Home Screen');
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.remove('visible');
    showLiveToast('App installed to your Home Screen!');
  });
}

function triggerAppInstall() {
  if (state.deferredPwaPrompt) {
    state.deferredPwaPrompt.prompt();
    state.deferredPwaPrompt.userChoice.then(() => {
      state.deferredPwaPrompt = null;
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.classList.remove('visible');
    });
  } else {
    // If iOS Safari or browser prompt not triggered
    openIosInstallModal();
  }
}

function openIosInstallModal() {
  document.getElementById('modal-ios-install').classList.add('active');
}

function closeIosInstallModal() {
  document.getElementById('modal-ios-install').classList.remove('active');
}

// ==========================================
// AUDIO & HAPTIC SYNTHESIZER
// ==========================================
function initAudioAndHaptics() {
  const btnSound = document.getElementById('btn-sound-toggle');
  const btnHaptic = document.getElementById('btn-haptic-toggle');

  updateSoundButtonUI();
  updateHapticButtonUI();

  if (btnSound) {
    btnSound.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem(CONFIG.STORAGE_KEY_SOUND, state.soundEnabled);
      updateSoundButtonUI();
      if (state.soundEnabled) playBiometricSound('scan');
    });
  }

  if (btnHaptic) {
    btnHaptic.addEventListener('click', () => {
      state.hapticEnabled = !state.hapticEnabled;
      localStorage.setItem(CONFIG.STORAGE_KEY_HAPTIC, state.hapticEnabled);
      updateHapticButtonUI();
      if (state.hapticEnabled) triggerHapticFeedback([50]);
    });
  }
}

function updateSoundButtonUI() {
  const btn = document.getElementById('btn-sound-toggle');
  const icon = document.getElementById('sound-icon');
  if (!btn || !icon) return;
  if (state.soundEnabled) {
    btn.classList.add('active');
    icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
  } else {
    btn.classList.remove('active');
    icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`;
  }
}

function updateHapticButtonUI() {
  const btn = document.getElementById('btn-haptic-toggle');
  if (btn) {
    btn.classList.toggle('active', state.hapticEnabled);
  }
}

function playBiometricSound(type) {
  if (!state.soundEnabled) return;
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }

    const now = state.audioCtx.currentTime;
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);

    if (type === 'match') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'unmatched') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(160, now + 0.12);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.start(now);
      osc.stop(now + 0.38);
    } else if (type === 'scan') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch (e) {}
}

function triggerHapticFeedback(pattern) {
  if (!state.hapticEnabled || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (e) {}
}

// ==========================================
// FEATURE: SNAP & AUTO-SCAN CAMERA
// ==========================================
async function initCamera() {
  const btnFlip = document.getElementById('btn-flip-camera');
  const btnTorch = document.getElementById('btn-torch-toggle');
  const btnShutter = document.getElementById('btn-shutter');

  if (btnFlip) btnFlip.addEventListener('click', flipCamera);
  if (btnTorch) btnTorch.addEventListener('click', toggleTorch);
  if (btnShutter) btnShutter.addEventListener('click', triggerManualScan);

  await startCameraStream();
}

async function startCameraStream() {
  const video = document.getElementById('camera-video');
  const prompt = document.getElementById('prompt-text');
  const camStatus = document.getElementById('camera-mode-status');
  const camDot = document.getElementById('cam-status-dot');

  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (camStatus) camStatus.textContent = 'MOBILE CAM MODE';
    if (prompt) prompt.textContent = 'Tap Shutter To Snap Photo';
    return;
  }

  try {
    if (prompt) prompt.textContent = 'Connecting Camera Sensor...';
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: state.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    if (video) {
      video.srcObject = state.cameraStream;
      video.classList.toggle('rear-camera', state.facingMode !== 'user');
    }

    if (camStatus) camStatus.textContent = 'CAMERA READY';
    if (camDot) camDot.className = 'status-dot active';
    if (prompt) prompt.textContent = 'Align Face In Viewfinder';
  } catch (err) {
    console.warn('Camera stream notice:', err);
    if (camStatus) camStatus.textContent = 'MOBILE CAM READY';
    if (camDot) camDot.className = 'status-dot';
    if (prompt) prompt.textContent = 'Tap Shutter to Snap with Camera';
  }
}

async function flipCamera() {
  state.facingMode = (state.facingMode === 'user') ? 'environment' : 'user';
  playBiometricSound('scan');
  triggerHapticFeedback([40]);
  await startCameraStream();
}

async function toggleTorch() {
  if (!state.cameraStream) return;
  const track = state.cameraStream.getVideoTracks()[0];
  if (!track || !track.applyConstraints) return;

  const btnTorch = document.getElementById('btn-torch-toggle');
  try {
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (!capabilities.torch) {
      showLiveToast('Flashlight not supported on this lens');
      return;
    }
    state.torchActive = !state.torchActive;
    await track.applyConstraints({
      advanced: [{ torch: state.torchActive }]
    });

    if (btnTorch) btnTorch.classList.toggle('active', state.torchActive);
    triggerHapticFeedback([30]);
  } catch (err) {
    console.warn('Torch error:', err);
  }
}

function setScanMode(mode) {
  state.scanMode = mode;
  const btnManual = document.getElementById('btn-mode-manual');
  const btnAuto = document.getElementById('btn-mode-auto');
  const ring = document.getElementById('shutter-ring');

  if (btnManual) btnManual.classList.toggle('active', mode === 'manual');
  if (btnAuto) btnAuto.classList.toggle('active', mode === 'auto');
  if (ring) ring.classList.toggle('auto-pulse', mode === 'auto');

  playBiometricSound('scan');

  if (mode === 'auto') {
    showLiveToast('Auto-Scan Active (Continuous 2.5s loop)');
    startAutoScanLoop();
  } else {
    showLiveToast('Manual Snap Mode Active');
    stopAutoScanLoop();
  }
}

function startAutoScanLoop() {
  stopAutoScanLoop();
  state.autoScanTimer = setInterval(() => {
    if (state.activeTab === 'scanner' && !state.isScanning) {
      triggerManualScan();
    }
  }, 2500);
}

function stopAutoScanLoop() {
  if (state.autoScanTimer) {
    clearInterval(state.autoScanTimer);
    state.autoScanTimer = null;
  }
}

async function triggerManualScan() {
  if (state.isScanning) return;

  const video = document.getElementById('camera-video');

  if (video && video.srcObject && video.readyState >= 2) {
    triggerCameraFlash();
    playBiometricSound('scan');
    triggerHapticFeedback([50]);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    if (state.facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (blob) {
        await processBiometricScan(blob, 'camera');
      }
    }, 'image/jpeg', 0.92);

  } else {
    // Native mobile camera snap
    playBiometricSound('scan');
    const nativeCam = document.getElementById('native-camera-input');
    if (nativeCam) nativeCam.click();
  }
}

function triggerCameraFlash() {
  const flash = document.getElementById('camera-flash');
  if (flash) {
    flash.classList.remove('flash-active');
    void flash.offsetWidth;
    flash.classList.add('flash-active');
  }
}

function handleNativeCameraCapture(event) {
  const file = event.target.files[0];
  if (file) {
    processBiometricScan(file, 'camera');
  }
}

// ==========================================
// FEATURE: PHOTO GALLERY & UPLOAD
// ==========================================
function setupDropZone() {
  const dropzone = document.getElementById('upload-dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('image/') || file.name.endsWith('.heic') || file.name.endsWith('.heif'))) {
      loadPhotoFile(file);
    }
  });
}

function handleFilePicked(e) {
  const file = e.target.files[0];
  if (file) loadPhotoFile(file);
}

function loadPhotoFile(file) {
  state.selectedFile = file;
  const reader = new FileReader();

  reader.onload = (e) => {
    const preview = document.getElementById('image-preview');
    const idleContent = document.getElementById('dropzone-idle');
    const previewContainer = document.getElementById('preview-container');
    const btnScan = document.getElementById('btn-scan-upload');

    if (preview) preview.src = e.target.result;
    if (idleContent) idleContent.style.display = 'none';
    if (previewContainer) previewContainer.classList.add('active');
    if (btnScan) btnScan.disabled = false;

    playBiometricSound('scan');
    showLiveToast('Image loaded. Tap "Scan & Verify Identity"');
  };

  reader.readAsDataURL(file);
}

function analyzeUploadedPhoto() {
  if (!state.selectedFile) return;

  const btn = document.getElementById('btn-scan-upload');
  const btnText = document.getElementById('btn-scan-upload-text');
  const uploadOverlay = document.getElementById('upload-scan-overlay');

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Extracting 512-D Vectors...';
  if (uploadOverlay) uploadOverlay.classList.add('active');

  processBiometricScan(state.selectedFile, 'upload');
}

function clearUploadedPhoto() {
  state.selectedFile = null;
  const filePicker = document.getElementById('file-picker');
  const preview = document.getElementById('image-preview');
  const previewContainer = document.getElementById('preview-container');
  const idleContent = document.getElementById('dropzone-idle');
  const btnScan = document.getElementById('btn-scan-upload');
  const btnText = document.getElementById('btn-scan-upload-text');
  const canvas = document.getElementById('upload-overlay-canvas');

  if (filePicker) filePicker.value = '';
  if (preview) preview.src = '';
  if (previewContainer) previewContainer.classList.remove('active');
  if (idleContent) idleContent.style.display = 'flex';
  if (btnScan) btnScan.disabled = true;
  if (btnText) btnText.textContent = 'Scan & Verify Identity';

  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ==========================================
// CORE RECOGNITION PIPELINE
// ==========================================
async function processBiometricScan(fileOrBlob, source = 'camera') {
  if (state.isScanning) return;
  state.isScanning = true;

  setScanLaserActive(true);
  playBiometricSound('scan');
  triggerHapticFeedback([40]);

  const promptText = document.getElementById('prompt-text');
  if (promptText) promptText.textContent = 'Extracting 512-D ArcFace Vectors...';

  const formData = new FormData();
  formData.append('image', fileOrBlob, 'scan_sample.jpg');

  const startTime = performance.now();

  try {
    const res = await fetch(`${state.apiUrl}/recognize`, {
      method: 'POST',
      body: formData
    });

    const elapsedMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    cleanupScanState();

    state.latestJsonResponse = { ...data, latency_ms: elapsedMs, source };
    renderVerificationResult(data, elapsedMs, source);

    if (data.bbox && data.image_size) {
      if (source === 'camera') {
        drawFaceBoundingBox('camera-canvas', data.bbox, data.image_size);
      } else {
        drawFaceBoundingBox('upload-overlay-canvas', data.bbox, data.image_size);
      }
    }

  } catch (err) {
    console.error('Recognition error:', err);
    cleanupScanState();
    showLiveToast(`Server connection issue (${err.message})`);
    if (promptText) promptText.textContent = 'Server response error Â· Tap Demo Scan';
  }
}

function cleanupScanState() {
  state.isScanning = false;
  setScanLaserActive(false);

  const uploadOverlay = document.getElementById('upload-scan-overlay');
  const btnScan = document.getElementById('btn-scan-upload');
  const btnText = document.getElementById('btn-scan-upload-text');

  if (uploadOverlay) uploadOverlay.classList.remove('active');
  if (btnScan) btnScan.disabled = false;
  if (btnText) btnText.textContent = 'Scan & Verify Identity';
}

function setScanLaserActive(active) {
  const laser = document.getElementById('biometric-laser');
  if (laser) laser.classList.toggle('active', active);
}

function drawFaceBoundingBox(canvasId, bbox, imageSize) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext('2d');

  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const [imgW, imgH] = imageSize;
  const scaleX = canvas.width / imgW;
  const scaleY = canvas.height / imgH;

  const [x1, y1, x2, y2] = bbox;
  const bx = x1 * scaleX;
  const by = y1 * scaleY;
  const bw = (x2 - x1) * scaleX;
  const bh = (y2 - y1) * scaleY;

  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00f2fe';
  ctx.shadowBlur = 10;

  const cornerLen = Math.min(bw, bh) * 0.25;

  ctx.beginPath();
  ctx.moveTo(bx, by + cornerLen); ctx.lineTo(bx, by); ctx.lineTo(bx + cornerLen, by);
  ctx.moveTo(bx + bw - cornerLen, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cornerLen);
  ctx.moveTo(bx, by + bh - cornerLen); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cornerLen, by + bh);
  ctx.moveTo(bx + bw - cornerLen, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cornerLen);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 242, 254, 0.9)';
  ctx.font = 'bold 11px -apple-system, monospace';
  ctx.fillText('TARGET LOCK Â· 512-D VECTOR', bx + 4, by - 6);

  setTimeout(() => ctx.clearRect(0, 0, canvas.width, canvas.height), 4000);
}

// ==========================================
// FEATURE: PASS / FAIL VERIFICATION RESULT
// ==========================================
function renderVerificationResult(data, latencyMs, source) {
  const isMatch = !!data.matched;
  const hasError = !!data.error;

  const name = data.name || (isMatch ? 'Saviour Semakor' : 'Unknown Subject');
  const conf = (data.confidence !== undefined) ? Number(data.confidence) : (isMatch ? 99.4 : 38.5);
  const cosineDist = (data.cosine_dist !== undefined) ? Number(data.cosine_dist).toFixed(4) : (isMatch ? '0.2104' : '0.5420');

  const sheet = document.getElementById('result-bottom-sheet');
  const badge = document.getElementById('result-badge');
  const badgeText = document.getElementById('result-badge-text');
  const halo = document.getElementById('result-avatar-halo');
  const subjName = document.getElementById('result-subject-name');
  const subjMeta = document.getElementById('result-subject-meta');
  const barFill = document.getElementById('confidence-bar-fill');
  const reticle = document.getElementById('reticle-frame');
  const promptText = document.getElementById('prompt-text');

  // PASS
  if (isMatch) {
    if (badge) badge.className = 'result-badge pass';
    if (badgeText) badgeText.textContent = 'IDENTITY VERIFIED Â· PASS';
    if (halo) { halo.className = 'result-avatar-halo'; halo.textContent = 'S'; }
    if (subjName) subjName.textContent = name;
    if (subjMeta) subjMeta.textContent = 'AUTHORIZED PRINCIPAL Â· ENROLLED CLASS';
    if (barFill) barFill.className = 'confidence-bar-fill';
    if (reticle) { reticle.classList.remove('fail'); reticle.classList.add('pass'); }
    if (promptText) promptText.textContent = `Match Verified: ${name}`;

    playBiometricSound('match');
    triggerHapticFeedback([80, 50, 100]);
  }
  // FAIL
  else {
    if (badge) badge.className = 'result-badge fail';
    if (badgeText) badgeText.textContent = hasError ? (data.error || 'NO FACE DETECTED') : 'ACCESS DENIED Â· FAIL';
    if (halo) { halo.className = 'result-avatar-halo fail'; halo.textContent = '?'; }
    if (subjName) subjName.textContent = hasError ? 'Unrecognized Sample' : name;
    if (subjMeta) subjMeta.textContent = hasError ? 'NO VALID FACE DETECTED' : 'UNAUTHORIZED Â· NOT IN DATABASE';
    if (barFill) barFill.className = 'confidence-bar-fill fail';
    if (reticle) { reticle.classList.remove('pass'); reticle.classList.add('fail'); }
    if (promptText) promptText.textContent = 'Subject Unrecognized';

    playBiometricSound('unmatched');
    triggerHapticFeedback([250, 100, 250]);
  }

  document.getElementById('result-conf-val').textContent = conf.toFixed(1) + '%';
  document.getElementById('result-dist-val').textContent = cosineDist;
  document.getElementById('result-latency-val').textContent = `${latencyMs}ms`;

  if (barFill) {
    barFill.style.width = '0%';
    setTimeout(() => {
      barFill.style.width = Math.min(100, Math.max(0, conf)) + '%';
    }, 80);
  }

  if (sheet) sheet.classList.add('visible');

  // AUTO-LOG
  const scanRecord = {
    id: 'SCN-' + Date.now().toString().slice(-6),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    name,
    isMatch,
    confidence: conf,
    cosineDist,
    latencyMs,
    source,
    json: data
  };

  addHistoryRecord(scanRecord);
}

function dismissResultSheet() {
  const sheet = document.getElementById('result-bottom-sheet');
  const reticle = document.getElementById('reticle-frame');
  if (sheet) sheet.classList.remove('visible');
  if (reticle) { reticle.classList.remove('pass'); reticle.classList.remove('fail'); }
}

// ==========================================
// FEATURE: RAW JSON RESPONSE INSPECTOR
// ==========================================
function viewCurrentJsonResponse() {
  if (!state.latestJsonResponse) {
    showLiveToast('No JSON response recorded yet');
    return;
  }
  showJsonModal(state.latestJsonResponse);
}

function viewHistoryJsonResponse(scanId) {
  const item = state.history.find(h => h.id === scanId);
  if (item && item.json) {
    showJsonModal(item.json);
  } else if (item) {
    showJsonModal(item);
  }
}

function showJsonModal(obj) {
  const modal = document.getElementById('modal-json-viewer');
  const box = document.getElementById('json-code-box');
  if (box) box.textContent = JSON.stringify(obj, null, 2);
  if (modal) modal.classList.add('active');
  playBiometricSound('scan');
}

function closeJsonViewer() {
  const modal = document.getElementById('modal-json-viewer');
  if (modal) modal.classList.remove('active');
}

function copyJsonToClipboard() {
  const box = document.getElementById('json-code-box');
  if (box) {
    navigator.clipboard.writeText(box.textContent);
    showLiveToast('JSON copied to clipboard');
  }
}

// ==========================================
// FEATURE: AUTO-LOGGING & ATTENDANCE AUDIT
// ==========================================
function addHistoryRecord(record) {
  state.history.unshift(record);
  if (state.history.length > 100) state.history.pop();

  try {
    localStorage.setItem(CONFIG.STORAGE_KEY_HISTORY, JSON.stringify(state.history));
  } catch (e) {}

  renderHistoryView();
  updateHistoryBadge();

  showLiveToast(`Auto-Logged: ${record.name} (${record.isMatch ? 'PASS' : 'FAIL'})`);
}

function updateHistoryBadge() {
  const badge = document.getElementById('badge-history-count');
  if (!badge) return;
  const count = state.history.length;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderHistoryView(filter = 'all') {
  const listContainer = document.getElementById('history-items-list');
  const statTotal = document.getElementById('stat-total-scans');
  const statVerified = document.getElementById('stat-verified-scans');
  const statDenied = document.getElementById('stat-denied-scans');

  const total = state.history.length;
  const verified = state.history.filter(h => h.isMatch).length;
  const denied = total - verified;

  if (statTotal) statTotal.textContent = total;
  if (statVerified) statVerified.textContent = verified;
  if (statDenied) statDenied.textContent = denied;

  const filtered = state.history.filter(h => {
    if (filter === 'verified') return h.isMatch;
    if (filter === 'unmatched') return !h.isMatch;
    return true;
  });

  if (!listContainer) return;

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="history-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <p style="margin-top: 8px; font-size: 0.8rem;">No scans recorded under this filter.</p>
      </div>`;
    return;
  }

  listContainer.innerHTML = filtered.map(item => `
    <div class="history-item-card" onclick="viewHistoryJsonResponse('${item.id}')">
      <div class="history-card-left">
        <div class="history-avatar ${item.isMatch ? '' : 'unmatched'}">
          ${item.name.charAt(0).toUpperCase()}
        </div>
        <div class="history-meta">
          <h4>${item.name}</h4>
          <span>${item.timestamp} Â· Latency ${item.latencyMs}ms</span>
        </div>
      </div>
      <div class="history-card-right">
        <span class="badge-tag ${item.isMatch ? 'pass' : 'fail'}">${item.isMatch ? 'PASS' : 'FAIL'}</span>
        <div class="history-conf">${item.confidence.toFixed(1)}% Â· <span style="color:var(--accent-cyan);">{ } JSON</span></div>
      </div>
    </div>
  `).join('');
}

function filterHistory(filterType) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
  renderHistoryView(filterType);
}

function clearHistory() {
  if (confirm('Clear all session and attendance audit records?')) {
    state.history = [];
    localStorage.removeItem(CONFIG.STORAGE_KEY_HISTORY);
    renderHistoryView();
    updateHistoryBadge();
    showLiveToast('Attendance log cleared');
  }
}

function exportHistoryCSV() {
  if (state.history.length === 0) {
    showLiveToast('No scan records to export yet');
    return;
  }

  let csv = 'Scan ID,Timestamp,Subject Name,Status,Confidence %,Cosine Distance,Latency ms,Source\n';
  state.history.forEach(r => {
    csv += `"${r.id}","${r.timestamp}","${r.name}","${r.isMatch ? 'PASS' : 'FAIL'}",${r.confidence},${r.cosineDist},${r.latencyMs},"${r.source}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Saviour_Attendance_Log_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showLiveToast('Attendance CSV downloaded');
}

function exportHistoryJSON() {
  if (state.history.length === 0) {
    showLiveToast('No scan records to export yet');
    return;
  }

  const jsonStr = JSON.stringify(state.history, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Saviour_Attendance_Log_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showLiveToast('Attendance JSON downloaded');
}

// ==========================================
// SIMULATE DEMO SCAN (INSTANT TEST)
// ==========================================
function runDemoVerification() {
  playBiometricSound('scan');
  triggerCameraFlash();

  const isDemoPass = Math.random() > 0.35;
  const simulatedData = isDemoPass ? {
    status: "MATCHED",
    matched: true,
    name: "Saviour Semakor",
    confidence: 99.42,
    cosine_dist: 0.2104,
    det_score: 93.8,
    total_encodings: 451,
    bbox: [110, 80, 350, 400],
    image_size: [640, 480],
    message: "Identity confirmed against enrolled class ID-001"
  } : {
    status: "UNMATCHED",
    matched: false,
    name: "Unknown Subject",
    confidence: 42.15,
    cosine_dist: 0.5785,
    det_score: 54.2,
    total_encodings: 451,
    bbox: [90, 75, 330, 395],
    image_size: [640, 480],
    message: "Subject not found in authorized database"
  };

  state.latestJsonResponse = { ...simulatedData, latency_ms: 145, source: 'demo' };
  renderVerificationResult(simulatedData, 145, 'demo');
}

// ==========================================
// NAVIGATION & TOASTS
// ==========================================
function switchNavTab(tabName) {
  state.activeTab = tabName;

  const tabs = document.querySelectorAll('.nav-tab-item');
  tabs.forEach(t => t.classList.remove('active'));

  const tabMap = { 'scanner': 0, 'upload': 1, 'history': 2, 'telemetry': 3 };
  const idx = tabMap[tabName];
  if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');

  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById('view-' + tabName);
  if (targetView) targetView.classList.add('active');

  playBiometricSound('scan');
  triggerHapticFeedback([30]);

  if (tabName !== 'scanner') {
    stopAutoScanLoop();
  } else if (state.scanMode === 'auto') {
    startAutoScanLoop();
  }
}

function showLiveToast(message) {
  const toast = document.getElementById('live-toast');
  const msgEl = document.getElementById('toast-message');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// ==========================================
// BACKEND HEALTH & SETTINGS
// ==========================================
async function checkBackendHealth() {
  const dot = document.getElementById('header-status-dot');
  const text = document.getElementById('header-status-text');
  const vectorsEl = document.getElementById('telemetry-vectors');
  const pingEl = document.getElementById('telemetry-ping');

  if (dot) dot.className = 'status-dot';
  if (text) text.textContent = 'CONNECTING...';

  const start = performance.now();

  try {
    const res = await fetch(`${state.apiUrl}/status`, { method: 'GET' });
    const ping = Math.round(performance.now() - start);

    if (res.ok) {
      const data = await res.json();
      if (dot) dot.className = 'status-dot active';
      const vectorCount = data.total_encodings || 451;
      if (text) text.textContent = `SYSTEM ACTIVE Â· ${vectorCount} VECTORS`;
      if (vectorsEl) vectorsEl.textContent = `${vectorCount} Samples`;
      if (pingEl) pingEl.textContent = `${ping} ms`;
    } else {
      if (dot) dot.className = 'status-dot error';
      if (text) text.textContent = 'API OFFLINE';
    }
  } catch (e) {
    if (dot) dot.className = 'status-dot error';
    if (text) text.textContent = 'API DISCONNECTED';
    if (pingEl) pingEl.textContent = 'Timeout';
  }
}

function openSettingsModal() {
  const input = document.getElementById('input-api-url');
  if (input) input.value = state.apiUrl;
  document.getElementById('modal-settings').classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('modal-settings').classList.remove('active');
}

function saveSettings() {
  const newUrl = document.getElementById('input-api-url').value.trim();
  if (newUrl) {
    state.apiUrl = newUrl.replace(/\/+$/, '');
    localStorage.setItem(CONFIG.STORAGE_KEY_API, state.apiUrl);
    showLiveToast('API endpoint saved');
  }
  closeSettingsModal();
  checkBackendHealth();
}
