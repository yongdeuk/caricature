const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights';
const MAX_DIMENSION = 720;

const els = {
  startCameraBtn: document.getElementById('startCameraBtn'),
  fileInput: document.getElementById('fileInput'),
  cameraView: document.getElementById('cameraView'),
  video: document.getElementById('video'),
  captureBtn: document.getElementById('captureBtn'),
  cancelCameraBtn: document.getElementById('cancelCameraBtn'),
  sourceCanvas: document.getElementById('sourceCanvas'),
  resultCanvas: document.getElementById('resultCanvas'),
  eyeScale: document.getElementById('eyeScale'),
  mouthScale: document.getElementById('mouthScale'),
  faceWidth: document.getElementById('faceWidth'),
  cartoonLevel: document.getElementById('cartoonLevel'),
  eyeScaleVal: document.getElementById('eyeScaleVal'),
  mouthScaleVal: document.getElementById('mouthScaleVal'),
  faceWidthVal: document.getElementById('faceWidthVal'),
  cartoonLevelVal: document.getElementById('cartoonLevelVal'),
  generateBtn: document.getElementById('generateBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  status: document.getElementById('status'),
};

let cameraStream = null;
let modelsReady = false;

function setStatus(msg) {
  els.status.textContent = msg;
}

['eyeScale', 'mouthScale', 'faceWidth', 'cartoonLevel'].forEach((id) => {
  els[id].addEventListener('input', () => {
    els[id + 'Val'].textContent = els[id].value;
  });
});

async function loadModels() {
  setStatus('얼굴 인식 모델을 불러오는 중...');
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
  modelsReady = true;
  setStatus('준비 완료. 사진을 촬영하거나 업로드하세요.');
}
loadModels().catch((err) => {
  console.error(err);
  setStatus('모델 로딩에 실패했습니다. 네트워크 연결을 확인해주세요.');
});

function drawImageToSource(imgOrVideo, naturalWidth, naturalHeight) {
  let w = naturalWidth;
  let h = naturalHeight;
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  els.sourceCanvas.width = w;
  els.sourceCanvas.height = h;
  els.resultCanvas.width = w;
  els.resultCanvas.height = h;
  const ctx = els.sourceCanvas.getContext('2d');
  ctx.drawImage(imgOrVideo, 0, 0, w, h);
  const rctx = els.resultCanvas.getContext('2d');
  rctx.clearRect(0, 0, w, h);
  els.generateBtn.disabled = false;
  els.downloadBtn.disabled = true;
}

// ---- Camera ----
els.startCameraBtn.addEventListener('click', async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    els.video.srcObject = cameraStream;
    els.cameraView.hidden = false;
  } catch (err) {
    console.error(err);
    setStatus('카메라를 사용할 수 없습니다. 권한을 확인해주세요.');
  }
});

els.cancelCameraBtn.addEventListener('click', stopCamera);

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  els.cameraView.hidden = true;
}

els.captureBtn.addEventListener('click', () => {
  drawImageToSource(els.video, els.video.videoWidth, els.video.videoHeight);
  stopCamera();
  setStatus('촬영 완료. "캐리커처 만들기"를 눌러주세요.');
});

// ---- File upload ----
els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    drawImageToSource(img, img.naturalWidth, img.naturalHeight);
    setStatus('업로드 완료. "캐리커처 만들기"를 눌러주세요.');
  };
  img.onerror = () => setStatus('이미지를 불러올 수 없습니다.');
  img.src = URL.createObjectURL(file);
});

// ---- Warp helpers ----
function boundingBoxOf(points, padX, padY) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = ((maxX - minX) / 2) * padX;
  const ry = ((maxY - minY) / 2) * padY;
  return { cx, cy, rx, ry };
}

function applyWarp(ctx, w, h, regions) {
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const sData = src.data;
  const dData = dst.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx = x;
      let sy = y;

      for (const r of regions) {
        const ox = x - r.cx;
        const oy = y - r.cy;
        const nx = ox / r.rx;
        const ny = oy / r.ry;
        const dist = Math.sqrt(nx * nx + ny * ny);
        if (dist < 1) {
          if (dist > 0.0001) {
            const power = 1 / r.strength;
            const newDist = Math.pow(dist, power);
            const factor = newDist / dist;
            const fadeStart = 0.7;
            const blend = dist <= fadeStart ? 1 : Math.max(0, 1 - (dist - fadeStart) / (1 - fadeStart));
            const finalFactor = 1 + (factor - 1) * blend;
            sx = r.cx + ox * finalFactor;
            sy = r.cy + oy * finalFactor;
          }
          break;
        }
      }

      sx = Math.min(w - 1, Math.max(0, Math.round(sx)));
      sy = Math.min(h - 1, Math.max(0, Math.round(sy)));
      const si = (sy * w + sx) * 4;
      const di = (y * w + x) * 4;
      dData[di] = sData[si];
      dData[di + 1] = sData[si + 1];
      dData[di + 2] = sData[si + 2];
      dData[di + 3] = sData[si + 3];
    }
  }
  ctx.putImageData(dst, 0, 0);
}

// ---- Cartoon stylization ----
function cartoonify(ctx, w, h, levels) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const gray = new Float32Array(w * h);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Sobel edge detection
  const edge = new Uint8ClampedArray(w * h);
  const gxK = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyK = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0, k = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++, k++) {
          const v = gray[(y + j) * w + (x + i)];
          gx += v * gxK[k];
          gy += v * gyK[k];
        }
      }
      const mag = Math.sqrt(gx * gx + gy * gy);
      edge[y * w + x] = mag > 90 ? 255 : 0;
    }
  }

  // Posterize + apply edges
  const step = 255 / (levels - 1);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (edge[p]) {
      data[i] = data[i + 1] = data[i + 2] = 30;
    } else {
      data[i] = Math.round(Math.round(data[i] / step) * step);
      data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
      data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// ---- Main generate flow ----
els.generateBtn.addEventListener('click', async () => {
  if (!modelsReady) {
    setStatus('모델이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  els.generateBtn.disabled = true;
  setStatus('얼굴을 인식하는 중...');

  const w = els.sourceCanvas.width;
  const h = els.sourceCanvas.height;
  const resultCtx = els.resultCanvas.getContext('2d');
  resultCtx.drawImage(els.sourceCanvas, 0, 0);

  try {
    const detection = await faceapi
      .detectSingleFace(els.sourceCanvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(true);

    if (!detection) {
      setStatus('얼굴을 찾지 못했습니다. 카툰 효과만 적용합니다.');
    } else {
      setStatus('얼굴을 과장하는 중...');
      const pos = detection.landmarks.positions;
      const jaw = pos.slice(0, 17);
      const leftEye = pos.slice(36, 42);
      const rightEye = pos.slice(42, 48);
      const mouth = pos.slice(48, 68);

      const faceBox = boundingBoxOf(jaw.concat(pos.slice(17, 27)), 1.25, 1.15);
      const faceWidthValue = parseFloat(els.faceWidth.value);
      applyWarp(resultCtx, w, h, [{ ...faceBox, strength: faceWidthValue }]);

      const leftEyeBox = boundingBoxOf(leftEye, 2.2, 2.4);
      const rightEyeBox = boundingBoxOf(rightEye, 2.2, 2.4);
      const mouthBox = boundingBoxOf(mouth, 1.8, 2.0);
      const eyeScaleValue = parseFloat(els.eyeScale.value);
      const mouthScaleValue = parseFloat(els.mouthScale.value);
      applyWarp(resultCtx, w, h, [
        { ...leftEyeBox, strength: eyeScaleValue },
        { ...rightEyeBox, strength: eyeScaleValue },
        { ...mouthBox, strength: mouthScaleValue },
      ]);
    }

    setStatus('카툰 스타일을 적용하는 중...');
    cartoonify(resultCtx, w, h, parseInt(els.cartoonLevel.value, 10));
    setStatus('완료! 다운로드할 수 있습니다.');
    els.downloadBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus('처리 중 오류가 발생했습니다.');
  } finally {
    els.generateBtn.disabled = false;
  }
});

els.downloadBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'caricature.png';
  link.href = els.resultCanvas.toDataURL('image/png');
  link.click();
});
