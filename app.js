/* ═══════════════════════════════════════════════════════════════
   VisionStudio PRO — Core Application Logic
   Interactive Computer Vision Laboratory powered by OpenCV.js Wasm
   ═══════════════════════════════════════════════════════════════ */
"use strict";

/* ---------- Global State ---------- */
const state = {
  img: null,
  template: null,
  activeSampleIndex: 1,
  inpaintStrokes: [],
  activeTab: "p1"
};

let kernelSize = 3;       // Spatial filters (Exp 05)
let morphKernelSize = 3;  // Morphology      (Exp 08)

/* ---------- DOM & Utility Helpers ---------- */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : n);
const imgW = () => (state.img ? state.img.naturalWidth || state.img.width : 0);
const imgH = () => (state.img ? state.img.naturalHeight || state.img.height : 0);

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* ---------- Toast Notifications System ---------- */
const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

function toast(message, type = "info") {
  const container = $("toasts");
  if (!container) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = (TOAST_ICONS[type] || TOAST_ICONS.info) + `<span>${message}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    t.addEventListener("animationend", () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 500);
  }, 3600);
}

/* ---------- OpenCV.js WebAssembly Engine Lifecycle ---------- */
function setEngine(status, text) {
  const chip = $("engineChip");
  const dot = $("engineDot");
  const label = $("engineText");
  if (!chip || !dot) return;

  chip.classList.remove("ok", "err");
  dot.classList.remove("loading", "ready", "failed");

  if (status === "ready") {
    chip.classList.add("ok");
    dot.classList.add("ready");
  } else if (status === "failed") {
    chip.classList.add("err");
    dot.classList.add("failed");
  } else {
    dot.classList.add("loading");
  }
  if (label) label.textContent = text;
}

window.addEventListener("cv-ready", () => setEngine("ready", "Wasm Engine Ready"));
window.addEventListener("cv-failed", () => setEngine("failed", "Engine Unavailable"));

(function pollEngine() {
  if (window.__cvReady) {
    setEngine("ready", "Wasm Engine Ready");
    return;
  }
  if (window.__cvFailed) {
    setEngine("failed", "Engine Unavailable");
    return;
  }
  if (window.cv && window.cv.Mat) {
    try {
      const probe = new cv.Mat(1, 1, cv.CV_8UC1);
      probe.delete();
      window.__cvReady = true;
      setEngine("ready", "Wasm Engine Ready");
      return;
    } catch (e) {
      /* Wasm module is still compiling */
    }
  }
  setTimeout(pollEngine, 180);
})();

function ensureCv() {
  if (window.__cvReady) return true;
  toast("OpenCV WebAssembly engine is initializing — please retry in a second.", "info");
  return false;
}

/* ---------- Image Ingestion & Preset Generators ---------- */
function requireImage() {
  if (!state.img) {
    toast("Please load an image first — upload a file or select a studio preset.", "error");
    const zone = $("dropZone");
    if (zone) {
      zone.classList.remove("flash");
      void zone.offsetWidth;
      zone.classList.add("flash");
    }
    return false;
  }
  return true;
}

function showUploadPreview(name) {
  if ($("uploadIdle")) $("uploadIdle").hidden = true;
  if ($("uploadPreview")) $("uploadPreview").hidden = false;
  if ($("uploadThumb")) $("uploadThumb").src = state.img.src;
  if ($("fileName")) $("fileName").textContent = name || "source_image.png";
  if ($("fileDims")) $("fileDims").textContent = `${imgW()} × ${imgH()} px`;
  updateHistogramHUD();
}

function adoptImage(im, name) {
  state.img = im;
  state.template = null;
  if ($("templateChip")) $("templateChip").hidden = true;
  showUploadPreview(name);
  resetMask();
}

function loadImage(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    toast("Please select a standard raster image (PNG, JPG, WebP, BMP).", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const im = new Image();
    im.onload = () => {
      adoptImage(im, file.name);
      toast(`Loaded "${file.name}" (${imgW()}×${imgH()})`, "success");
    };
    im.onerror = () => toast("Unable to decode raster image format.", "error");
    im.src = e.target.result;
  };
  reader.onerror = () => toast("Error reading local file stream.", "error");
  reader.readAsDataURL(file);
}

/* ---------- Calibrated Studio Sample Generators ---------- */
function generateSample(index = 1) {
  state.activeSampleIndex = index;
  $$(".preset-btn").forEach((btn, idx) => {
    btn.classList.toggle("active", idx + 1 === index);
  });

  const c = makeCanvas(720, 480);
  const ctx = c.getContext("2d");

  if (index === 1) {
    // Synthwave Sunset & Architecture
    const sky = ctx.createLinearGradient(0, 0, 0, 360);
    sky.addColorStop(0, "#0b0c2a");
    sky.addColorStop(0.4, "#2c1654");
    sky.addColorStop(0.7, "#7e22ce");
    sky.addColorStop(0.9, "#f43f5e");
    sky.addColorStop(1, "#fbbf24");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 720, 360);

    // Glowing Sun with horizontal grid bars
    const sunGrad = ctx.createRadialGradient(360, 240, 20, 360, 240, 90);
    sunGrad.addColorStop(0, "#fef08a");
    sunGrad.addColorStop(0.6, "#f43f5e");
    sunGrad.addColorStop(1, "rgba(244,63,94,0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(360, 240, 85, 0, Math.PI * 2);
    ctx.fill();

    // Perspective Grid Floor
    const floor = ctx.createLinearGradient(0, 360, 0, 480);
    floor.addColorStop(0, "#0f172a");
    floor.addColorStop(1, "#020617");
    ctx.fillStyle = floor;
    ctx.fillRect(0, 360, 720, 120);

    ctx.strokeStyle = "rgba(6, 182, 212, 0.6)";
    ctx.lineWidth = 1.5;
    for (let x = -200; x <= 920; x += 60) {
      ctx.beginPath();
      ctx.moveTo(360, 360);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }
    for (let y = 370; y <= 480; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(720, y);
      ctx.stroke();
    }

    // Modern Buildings & Geometry
    ctx.fillStyle = "#1e1b4b";
    ctx.fillRect(80, 220, 110, 140);
    ctx.fillRect(210, 170, 90, 190);
    ctx.fillRect(440, 190, 130, 170);
    ctx.fillRect(590, 240, 80, 120);

    // Cyan Neon Accent Window Dots
    ctx.fillStyle = "#38bdf8";
    for (let r = 240; r < 340; r += 16) {
      for (let col = 95; col < 175; col += 18) {
        if ((r + col) % 3 === 0) ctx.fillRect(col, r, 6, 8);
      }
    }
    ctx.fillStyle = "#ec4899";
    for (let r = 190; r < 340; r += 16) {
      for (let col = 225; col < 285; col += 18) {
        if ((r + col) % 2 === 0) ctx.fillRect(col, r, 6, 8);
      }
    }
  } else if (index === 2) {
    // Optical Resolution & Frequency Target
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 720, 480);

    ctx.fillStyle = "#000000";
    ctx.fillRect(20, 20, 680, 440);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(30, 30, 660, 420);

    // Concentric Calibration Rings
    for (let rad = 200; rad > 10; rad -= 18) {
      ctx.beginPath();
      ctx.arc(360, 240, rad, 0, Math.PI * 2);
      ctx.fillStyle = (rad / 18) % 2 === 0 ? "#000000" : "#ffffff";
      ctx.fill();
    }

    // High frequency test wedges
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(360, 240);
      ctx.lineTo(360 + Math.cos(rad) * 190, 240 + Math.sin(rad) * 190);
      ctx.stroke();
    }

    // Corner Calibration Checkers
    function drawChecker(ox, oy, sz) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          ctx.fillStyle = (i + j) % 2 === 0 ? "#000" : "#fff";
          ctx.fillRect(ox + i * sz, oy + j * sz, sz, sz);
        }
      }
    }
    drawChecker(45, 45, 18);
    drawChecker(600, 45, 18);
    drawChecker(45, 360, 18);
    drawChecker(600, 360, 18);
  } else {
    // Vibrant Color Splash & Natural Geometry
    const grad = ctx.createLinearGradient(0, 0, 720, 480);
    grad.addColorStop(0, "#06b6d4");
    grad.addColorStop(0.5, "#8b5cf6");
    grad.addColorStop(1, "#f43f5e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 720, 480);

    // Chromatic circles
    const colors = ["#22c55e", "#eab308", "#3b82f6", "#ec4899", "#ffffff", "#0f172a"];
    const centers = [
      [180, 140, 70],
      [360, 150, 90],
      [540, 170, 75],
      [240, 330, 80],
      [480, 320, 85]
    ];
    centers.forEach(([x, y, r], i) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.stroke();
    });
  }

  const im = new Image();
  im.onload = () => {
    adoptImage(im, `Studio Preset · #${index}`);
    toast(`Loaded Preset #${index}`, "success");
  };
  im.src = c.toDataURL();
}

/* File Picker & Drag-Drop Listeners */
if ($("imageInput")) {
  $("imageInput").addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) loadImage(e.target.files[0]);
    e.target.value = "";
  });
}
if ($("browseBtn")) $("browseBtn").addEventListener("click", () => $("imageInput").click());
if ($("changeBtn")) $("changeBtn").addEventListener("click", () => $("imageInput").click());
if ($("loadSample")) $("loadSample").addEventListener("click", () => generateSample(1));
if ($("sampleBtn2")) $("sampleBtn2").addEventListener("click", () => generateSample(1));

if ($("quickSample1")) $("quickSample1").addEventListener("click", () => generateSample(1));
if ($("quickSample2")) $("quickSample2").addEventListener("click", () => generateSample(2));
if ($("quickSample3")) $("quickSample3").addEventListener("click", () => generateSample(3));

const dropZone = $("dropZone");
if (dropZone) {
  ["dragenter", "dragover"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    })
  );
  dropZone.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadImage(f);
  });
}

/* ---------- Tab Navigation ---------- */
function activateTab(tabId, updateHash = true) {
  if (!$(tabId)) return;
  state.activeTab = tabId;
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === tabId));
  if (updateHash) {
    try {
      history.replaceState(null, "", "#" + tabId);
    } catch (e) {
      /* sandbox */
    }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$(".nav-item").forEach((b) =>
  b.addEventListener("click", () => activateTab(b.dataset.tab))
);

(function openFromHash() {
  const h = (location.hash || "").replace("#", "");
  if (/^p\d+$/.test(h)) activateTab(h, false);
})();

/* ---------- Range Sliders Fill Sync ---------- */
function syncRange(r) {
  const field = r.closest(".slider-field");
  const out = field ? field.querySelector("output") : null;
  if (out) out.textContent = r.value + (r.dataset.suffix || "");
  const min = parseFloat(r.min) || 0;
  const max = parseFloat(r.max) || 100;
  const pct = Math.max(0, Math.min(100, ((r.value - min) / (max - min)) * 100));
  r.style.setProperty("--fill", pct + "%");
}
$$('input[type="range"]').forEach((r) => {
  r.addEventListener("input", () => syncRange(r));
  syncRange(r);
});

/* ---------- Segmented Control Wireups ---------- */
function wireSegmented(rootId, setter) {
  const root = $(rootId);
  if (!root) return;
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $$(".seg-btn", root).forEach((b) => b.classList.toggle("active", b === btn));
    setter(+btn.dataset.k);
  });
}
wireSegmented("kernelSeg", (k) => { kernelSize = k; });
wireSegmented("morphKernelSeg", (k) => { morphKernelSize = k; });

/* ---------- Live Spectral Histogram Generator ---------- */
function updateHistogramHUD() {
  const canvas = $("histCanvas");
  const placeholder = $("histPlaceholder");
  if (!canvas || !state.img) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // Render thumbnail to offscreen canvas to sample
  const sample = makeCanvas(160, 120);
  const sCtx = sample.getContext("2d");
  sCtx.drawImage(state.img, 0, 0, 160, 120);
  const imgData = sCtx.getImageData(0, 0, 160, 120).data;

  const rBins = new Uint32Array(256);
  const gBins = new Uint32Array(256);
  const bBins = new Uint32Array(256);
  const lBins = new Uint32Array(256);

  let sumLum = 0;
  const totalPixels = imgData.length / 4;

  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    rBins[r]++;
    gBins[g]++;
    bBins[b]++;
    lBins[lum]++;
    sumLum += lum;
  }

  const maxVal = Math.max(
    ...Array.from(rBins),
    ...Array.from(gBins),
    ...Array.from(bBins),
    ...Array.from(lBins),
    1
  );

  // Compute Shannon Entropy
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (lBins[i] > 0) {
      const p = lBins[i] / totalPixels;
      entropy -= p * Math.log2(p);
    }
  }

  // Draw Histogram Curves
  ctx.clearRect(0, 0, w, h);

  function drawCurve(bins, strokeStyle, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = h - (bins[i] / maxVal) * (h - 6);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Draw channels with alpha composite
  drawCurve(rBins, "rgba(239, 68, 68, 0.8)", "rgba(239, 68, 68, 0.15)");
  drawCurve(gBins, "rgba(34, 197, 94, 0.8)", "rgba(34, 197, 94, 0.15)");
  drawCurve(bBins, "rgba(59, 130, 246, 0.8)", "rgba(59, 130, 246, 0.15)");
  drawCurve(lBins, "rgba(255, 255, 255, 0.9)", null);

  if (placeholder) placeholder.classList.add("hidden");
  if ($("lumMean")) $("lumMean").textContent = (sumLum / totalPixels).toFixed(1);
  if ($("entropyVal")) $("entropyVal").textContent = entropy.toFixed(2) + " b";
}

/* ---------- Result Cards & Split Comparison Slider ---------- */
function clearOut(id) {
  const container = $(id);
  if (container) container.innerHTML = "";
}

function addResultCard(outId, { title, canvas, tag = "output", meta = [], extra = "" }) {
  const container = $(outId);
  if (!container) return;

  const card = document.createElement("article");
  card.className = "result-card";
  const safeTitle = String(title).replace(/</g, "&lt;");

  // Top header with Title, Tag and Download button
  card.innerHTML = `
    <header class="rc-head">
      <h3>${safeTitle}</h3>
      <div class="rc-actions-right">
        <span class="rc-tag ${tag === "input" ? "input" : ""}">${tag}</span>
        <button class="icon-tool-btn rc-dl-btn" title="Export PNG" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>
    </header>
  `;

  // Main canvas / comparison wrapper
  const wrap = document.createElement("div");
  wrap.className = "rc-canvas";

  // If this is an output card (not original), create interactive split slider
  if (tag !== "input" && state.img && canvas) {
    const compareBox = document.createElement("div");
    compareBox.className = "compare-container";

    // Original Input Layer (Before)
    const beforeCanvas = makeCanvas(canvas.width, canvas.height);
    beforeCanvas.getContext("2d").drawImage(state.img, 0, 0, canvas.width, canvas.height);

    const beforeLayer = document.createElement("div");
    beforeLayer.className = "compare-layer-before";
    beforeLayer.style.width = "50%";
    beforeLayer.appendChild(beforeCanvas);

    // Processed Output Layer (After)
    const afterLayer = document.createElement("div");
    afterLayer.className = "compare-layer-after";
    afterLayer.appendChild(canvas);

    // Drag Handle & Badges
    const handle = document.createElement("div");
    handle.className = "compare-handle";
    handle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>`;

    const badgeBefore = document.createElement("span");
    badgeBefore.className = "compare-badge badge-before";
    badgeBefore.textContent = "ORIGINAL";

    const badgeAfter = document.createElement("span");
    badgeAfter.className = "compare-badge badge-after";
    badgeAfter.textContent = "OUTPUT";

    compareBox.appendChild(afterLayer);
    compareBox.appendChild(beforeLayer);
    beforeLayer.appendChild(handle);
    compareBox.appendChild(badgeBefore);
    compareBox.appendChild(badgeAfter);

    // Interactive slider dragging
    let isDragging = false;
    function setSplit(clientX) {
      const rect = compareBox.getBoundingClientRect();
      const pos = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const pct = (pos / rect.width) * 100;
      beforeLayer.style.width = `${pct}%`;
    }

    compareBox.addEventListener("pointerdown", (e) => {
      isDragging = true;
      try {
        compareBox.setPointerCapture(e.pointerId);
      } catch (err) {}
      setSplit(e.clientX);
    });
    compareBox.addEventListener("pointermove", (e) => {
      if (isDragging) setSplit(e.clientX);
    });
    compareBox.addEventListener("pointerup", () => {
      isDragging = false;
    });

    wrap.appendChild(compareBox);
    attachPixelLoupe(canvas);
  } else if (canvas) {
    wrap.appendChild(canvas);
    attachPixelLoupe(canvas);
  }

  card.appendChild(wrap);

  // Card Footer Metadata
  if (meta.length || extra) {
    const foot = document.createElement("footer");
    foot.className = "rc-foot";
    foot.innerHTML = meta.map((m) => `<span>${m}</span>`).join("");
    if (extra) foot.insertAdjacentHTML("beforeend", extra);
    card.appendChild(foot);
  }

  // Download Trigger
  const dlBtn = card.querySelector(".rc-dl-btn");
  if (dlBtn && canvas) {
    dlBtn.addEventListener("click", () => downloadCanvas(canvas, safeTitle));
  }

  container.appendChild(card);
}

function addOriginalCard(outId) {
  if (!state.img) return;
  const c = makeCanvas(imgW(), imgH());
  c.getContext("2d").drawImage(state.img, 0, 0);
  addResultCard(outId, {
    title: "Original (Input Baseline)",
    canvas: c,
    tag: "input",
    meta: [`${imgW()} × ${imgH()} px`, "Source Texture"]
  });
}

function downloadCanvas(canvas, name) {
  try {
    canvas.toBlob((blob) => {
      if (!blob) {
        toast("Unable to export binary blob.", "error");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = String(name).replace(/[^\w\d-]+/g, "_") + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`Exported "${a.download}"`, "success");
    });
  } catch (e) {
    toast("Canvas export error.", "error");
  }
}

/* ---------- Pixel Loupe Inspector Tooltip ---------- */
const loupe = $("pixelLoupe");
const loupeCanvas = $("loupeCanvas");
const loupeCtx = loupeCanvas ? loupeCanvas.getContext("2d") : null;

function attachPixelLoupe(canvas) {
  if (!loupe || !loupeCanvas || !canvas) return;

  canvas.addEventListener("mousemove", (e) => {
    loupe.hidden = false;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      loupe.hidden = true;
      return;
    }

    // Position loupe offset from cursor
    loupe.style.left = `${e.clientX + 16}px`;
    loupe.style.top = `${e.clientY + 16}px`;

    // Coordinates
    if ($("loupeCoords")) $("loupeCoords").textContent = `X: ${x}, Y: ${y}`;

    // Sample color
    const ctx = canvas.getContext("2d");
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const r = pixel[0], g = pixel[1], b = pixel[2], a = pixel[3];
    const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

    if ($("loupeRgb")) $("loupeRgb").textContent = `RGBA(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
    if ($("loupeHex")) $("loupeHex").textContent = hex;
    if ($("loupeColorPreview")) $("loupeColorPreview").style.background = `rgba(${r},${g},${b},${a / 255})`;

    // Draw magnified 9x9 pixel patch
    loupeCtx.imageSmoothingEnabled = false;
    loupeCtx.clearRect(0, 0, 80, 80);
    loupeCtx.drawImage(canvas, Math.max(0, x - 4), Math.max(0, y - 4), 9, 9, 0, 0, 80, 80);
  });

  canvas.addEventListener("mouseleave", () => {
    if (loupe) loupe.hidden = true;
  });
}

/* ---------- Operation Runner Wrapper ---------- */
let _t0 = 0;
function runOp(btn, outId, fn, withOriginal = true) {
  if (!requireImage()) return;
  if (!ensureCv()) return;
  if (btn) {
    btn.classList.add("busy");
    btn.disabled = true;
  }
  try {
    clearOut(outId);
    if (withOriginal) addOriginalCard(outId);
    _t0 = performance.now();
    fn();
  } catch (err) {
    console.error(err);
    toast("Operation error: " + ((err && err.message) || err), "error");
  } finally {
    if (btn) {
      btn.classList.remove("busy");
      btn.disabled = false;
    }
  }
}

function baseMat() {
  const c = makeCanvas(imgW(), imgH());
  c.getContext("2d").drawImage(state.img, 0, 0, c.width, c.height);
  return cv.imread(c);
}

function showMat(outId, title, mat, extra = "") {
  const ms = Math.max(1, Math.round((performance.now() - _t0) * 10) / 10);
  const c = makeCanvas(mat.cols, mat.rows);
  cv.imshow(c, mat);
  addResultCard(outId, {
    title,
    canvas: c,
    meta: [`${mat.cols} × ${mat.rows} px`, `${ms} ms (Wasm SIMD)`],
    extra
  });
  mat.delete();
}

/* ═══════════════════ PRACTICAL 02 · RGB, Gray & Bitwise ═══════════════════ */
const OP2_TITLES = {
  gray: "Grayscale (Luminance Plane)",
  rgb: "RGB Color Tensor",
  add: "Clamped Scalar Addition (+35)",
  subtract: "Clamped Scalar Subtraction (−35)",
  and: "Bitwise Mask AND",
  or: "Bitwise Mask OR",
  xor: "Bitwise Mask XOR",
  not: "Bitwise Inversion NOT"
};

function op2(op) {
  const m = baseMat();
  const r = new cv.Mat();

  if (op === "gray") {
    cv.cvtColor(m, r, cv.COLOR_RGBA2GRAY);
  } else if (op === "rgb") {
    cv.cvtColor(m, r, cv.COLOR_RGBA2RGB);
  } else if (op === "add" || op === "subtract") {
    const s = new cv.Mat(m.rows, m.cols, m.type(), new cv.Scalar(35, 35, 35, 0));
    if (op === "add") cv.add(m, s, r);
    else cv.subtract(m, s, r);
    s.delete();
  } else {
    const g = new cv.Mat();
    cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
    if (op === "not") {
      cv.bitwise_not(g, r);
    } else {
      const inv = new cv.Mat(g.rows, g.cols, g.type(), new cv.Scalar(255));
      if (op === "and") cv.bitwise_and(g, inv, r);
      if (op === "or") cv.bitwise_or(g, inv, r);
      if (op === "xor") cv.bitwise_xor(g, inv, r);
      inv.delete();
    }
    g.delete();
  }

  showMat("p2out", OP2_TITLES[op] || "Operation", r);
  m.delete();
}

$$("[data-op]").forEach((b) =>
  b.addEventListener("click", () => runOp(b, "p2out", () => op2(b.dataset.op)))
);

/* ═══════════════════ PRACTICAL 03 · Geometric Transforms ═══════════════════ */
const TRANSFORM_TITLES = {
  translate: "Affine Translation",
  rotate: "Center Rotation",
  scale: "Bilinear Scale Resampling",
  shear: "Horizontal Shear",
  reflect: "Horizontal Reflection (Flip)",
  crop: "Region of Interest (ROI) Crop"
};

function transform(type) {
  const m = baseMat();
  const r = new cv.Mat();
  const w = m.cols;
  const h = m.rows;

  if (type === "translate") {
    const M = cv.matFromArray(2, 3, cv.CV_64F, [1, 0, +$("tx").value, 0, 1, +$("ty").value]);
    cv.warpAffine(m, r, M, new cv.Size(w, h));
    M.delete();
  } else if (type === "rotate") {
    const M = cv.getRotationMatrix2D(new cv.Point(w / 2, h / 2), +$("angle").value, 1);
    cv.warpAffine(m, r, M, new cv.Size(w, h));
    M.delete();
  } else if (type === "scale") {
    const s = +$("scale").value / 100;
    cv.resize(m, r, new cv.Size(Math.round(w * s), Math.round(h * s)));
  } else if (type === "shear") {
    const sh = +$("shear").value / 100;
    const M = cv.matFromArray(2, 3, cv.CV_64F, [1, sh, 0, 0, 1, 0]);
    cv.warpAffine(m, r, M, new cv.Size(w, h));
    M.delete();
  } else if (type === "reflect") {
    cv.flip(m, r, 1);
  } else {
    // 60% Center ROI Crop
    const rw = Math.max(2, Math.floor(w * 0.6));
    const rh = Math.max(2, Math.floor(h * 0.6));
    r.create(rh, rw, m.type());
    m.roi(new cv.Rect(Math.floor((w - rw) / 2), Math.floor((h - rh) / 2), rw, rh)).copyTo(r);
  }

  showMat("p3out", TRANSFORM_TITLES[type] || "Transformation", r);
  m.delete();
}

$$("[data-transform]").forEach((b) =>
  b.addEventListener("click", () => runOp(b, "p3out", () => transform(b.dataset.transform)))
);

/* ═══════════════════ PRACTICAL 04 · Enhancement ═══════════════════ */
const ENHANCE_TITLES = {
  hist: "Equalized Histogram (CDF Match)",
  smooth: "Gaussian Smoothing Filter (7×7)",
  sharp: "Laplacian High-Pass Sharpening",
  threshold: "Binary Intensity Threshold"
};

function enhance(type) {
  const m = baseMat();
  const g = new cv.Mat();
  const r = new cv.Mat();
  cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);

  if (type === "hist") {
    cv.equalizeHist(g, r);
  } else if (type === "smooth") {
    cv.GaussianBlur(g, r, new cv.Size(7, 7), 0);
  } else if (type === "sharp") {
    const k = cv.matFromArray(3, 3, cv.CV_32F, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
    cv.filter2D(g, r, cv.CV_8U, k);
    k.delete();
  } else {
    cv.threshold(g, r, +$("threshold").value, 255, cv.THRESH_BINARY);
  }

  showMat("p4out", ENHANCE_TITLES[type] || "Enhancement", r);
  m.delete();
  g.delete();
}

$$("[data-enhance]").forEach((b) =>
  b.addEventListener("click", () => runOp(b, "p4out", () => enhance(b.dataset.enhance)))
);

/* ═══════════════════ PRACTICAL 05 · Spatial Filters ═══════════════════ */
function spatial(type) {
  const m = baseMat();
  const r = new cv.Mat();
  const k = kernelSize;

  if (type === "average") cv.blur(m, r, new cv.Size(k, k));
  if (type === "gaussian") cv.GaussianBlur(m, r, new cv.Size(k, k), 0);
  if (type === "median") cv.medianBlur(m, r, k);
  if (type === "bilateral") {
    const rgb = new cv.Mat();
    cv.cvtColor(m, rgb, cv.COLOR_RGBA2RGB);
    cv.bilateralFilter(rgb, r, 9, 75, 75);
    rgb.delete();
  }

  showMat("p5out", `${type[0].toUpperCase() + type.slice(1)} Spatial Filter (${k}×${k})`, r);
  m.delete();
}

$$("[data-filter]").forEach((b) =>
  b.addEventListener("click", () => runOp(b, "p5out", () => spatial(b.dataset.filter)))
);

/* ═══════════════════ PRACTICAL 06 · Inpainting Studio ═══════════════════ */
const maskCanvas = $("maskCanvas");
const maskCtx = maskCanvas ? maskCanvas.getContext("2d") : null;
let drawing = false;

function resetMask() {
  if (!state.img || !maskCanvas || !maskCtx) return;
  maskCanvas.width = imgW();
  maskCanvas.height = imgH();
  maskCtx.drawImage(state.img, 0, 0, maskCanvas.width, maskCanvas.height);
  if ($("canvasHint")) $("canvasHint").hidden = true;
}

if ($("clearMask")) {
  $("clearMask").addEventListener("click", () => {
    if (!requireImage()) return;
    resetMask();
    toast("Inpainting marks cleared.", "info");
  });
}

function canvasPos(e) {
  const r = maskCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (maskCanvas.width / r.width),
    y: (e.clientY - r.top) * (maskCanvas.height / r.height)
  };
}

if (maskCanvas) {
  maskCanvas.addEventListener("pointerdown", (e) => {
    if (!state.img) {
      requireImage();
      return;
    }
    drawing = true;
    try {
      maskCanvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    const p = canvasPos(e);
    maskCtx.lineWidth = +$("brush").value;
    maskCtx.lineCap = "round";
    maskCtx.lineJoin = "round";
    maskCtx.strokeStyle = "rgba(255, 0, 0, 0.95)";
    maskCtx.beginPath();
    maskCtx.moveTo(p.x, p.y);
    maskCtx.lineTo(p.x + 0.01, p.y);
    maskCtx.stroke();
  });

  maskCanvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = canvasPos(e);
    maskCtx.lineTo(p.x, p.y);
    maskCtx.stroke();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
    maskCanvas.addEventListener(ev, () => {
      drawing = false;
    })
  );
}

function inpaint(useNs) {
  const src = baseMat();
  const mask = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);
  const tmp = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  const d = mask.data;

  for (let i = 0, j = 0; i < tmp.length; i += 4, j++) {
    d[j] = tmp[i] > 180 && tmp[i + 1] < 100 ? 255 : 0;
  }

  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  const r = new cv.Mat();
  cv.inpaint(rgb, mask, r, 3, useNs ? cv.INPAINT_NS : cv.INPAINT_TELEA);

  showMat("p6out", useNs ? "Navier–Stokes (NS PDE) Restoration" : "Telea Fast Marching (FMM) Inpainting", r);
  src.delete();
  rgb.delete();
  mask.delete();
}

$$("[data-inpaint]").forEach((b) =>
  b.addEventListener("click", () => runOp(b, "p6out", () => inpaint(b.dataset.inpaint === "ns")))
);

/* ═══════════════════ PRACTICAL 07 · Lossless RLE Compression ═══════════════════ */
if ($("compress")) {
  $("compress").addEventListener("click", (e) => {
    if (!requireImage()) return;
    const btn = e.currentTarget;
    btn.classList.add("busy");
    btn.disabled = true;

    try {
      const c = makeCanvas(imgW(), imgH());
      const x = c.getContext("2d");
      x.drawImage(state.img, 0, 0, c.width, c.height);
      const a = x.getImageData(0, 0, c.width, c.height).data;
      const bytes = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) bytes[i] = a[i];

      const runs = [];
      let start = bytes[0],
        count = 1;
      for (let i = 1; i < bytes.length; i++) {
        if (bytes[i] === start && count < 255) count++;
        else {
          runs.push([start, count]);
          start = bytes[i];
          count = 1;
        }
      }
      runs.push([start, count]);

      const original = bytes.length;
      const compressed = runs.length * 2;
      const ratio = ((compressed / original) * 100).toFixed(2);

      if ($("compressionStats")) {
        $("compressionStats").innerHTML = `
          <div class="stat-card-pro">
            <span class="stat-label">Uncompressed Raw Tensor</span>
            <b>${fmt(original)} bytes</b>
          </div>
          <div class="stat-card-pro">
            <span class="stat-label">RLE Stream Compaction</span>
            <b>${fmt(compressed)} bytes</b>
          </div>
          <div class="stat-card-pro">
            <span class="stat-label">Compression Space Ratio</span>
            <b>${ratio}%</b>
            <div class="bar-wrap">
              <span class="bar-fill" style="width: ${Math.min(100, ratio)}%"></span>
            </div>
          </div>
          <div class="stat-card-pro">
            <span class="stat-label">Sequential RLE Runs</span>
            <b>${fmt(runs.length)}</b>
          </div>
        `;
      }

      if ($("rleBlock")) $("rleBlock").hidden = false;
      if ($("rlePreview")) {
        $("rlePreview").textContent =
          "Run-Length Tuple Stream preview (Value, Run-Length):\n" +
          runs
            .slice(0, 80)
            .map((r) => `(${r[0]}, ${r[1]})`)
            .join(" ");
      }
      toast("RLE lossless stream analyzed successfully.", "success");
    } catch (err) {
      console.error(err);
      toast("Compression failed: " + ((err && err.message) || err), "error");
    } finally {
      btn.classList.remove("busy");
      btn.disabled = false;
    }
  });
}

/* ═══════════════════ PRACTICAL 08 · Morphology ═══════════════════ */
const MORPH_TITLES = {
  erode: "Morphological Erosion (Minkowski Difference)",
  dilate: "Morphological Dilation (Minkowski Sum)",
  open: "Morphological Opening (Noise Removal)",
  close: "Morphological Closing (Hole Filling)"
};

function morph(type) {
  const m = baseMat();
  const g = new cv.Mat();
  const r = new cv.Mat();

  cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
  cv.threshold(g, g, 127, 255, cv.THRESH_BINARY);

  const K = cv.Mat.ones(morphKernelSize, morphKernelSize, cv.CV_8U);
  if (type === "erode") cv.erode(g, r, K);
  if (type === "dilate") cv.dilate(g, r, K);
  if (type === "open") cv.morphologyEx(g, r, cv.MORPH_OPEN, K);
  if (type === "close") cv.morphologyEx(g, r, cv.MORPH_CLOSE, K);

  showMat("p8out", `${MORPH_TITLES[type]} (${morphKernelSize}×${morphKernelSize})`, r);
  m.delete();
  g.delete();
  K.delete();
}

$$("[data-morph]").forEach((b) =>
  b.addEventListener("click", () => runOp(b, "p8out", () => morph(b.dataset.morph)))
);

/* ═══════════════════ PRACTICAL 09 · Correlation Detection ═══════════════════ */
if ($("templateInput")) {
  $("templateInput").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (x) => {
      const im = new Image();
      im.onload = () => {
        state.template = im;
        if ($("templateChip")) $("templateChip").hidden = false;
        if ($("templateThumb")) $("templateThumb").src = im.src;
        if ($("templateName")) $("templateName").textContent = f.name;
        if ($("templateDims")) $("templateDims").textContent = `${im.width}×${im.height} px`;
        toast(`Loaded template "${f.name}"`, "success");
      };
      im.src = x.target.result;
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  });
}

// Auto-crop Center Patch for Template Matching convenience
if ($("autoCropTemplate")) {
  $("autoCropTemplate").addEventListener("click", () => {
    if (!requireImage()) return;
    const tw = Math.max(40, Math.floor(imgW() * 0.25));
    const th = Math.max(40, Math.floor(imgH() * 0.25));
    const ox = Math.floor((imgW() - tw) / 2);
    const oy = Math.floor((imgH() - th) / 2);

    const tc = makeCanvas(tw, th);
    tc.getContext("2d").drawImage(state.img, ox, oy, tw, th, 0, 0, tw, th);

    const im = new Image();
    im.onload = () => {
      state.template = im;
      if ($("templateChip")) $("templateChip").hidden = false;
      if ($("templateThumb")) $("templateThumb").src = im.src;
      if ($("templateName")) $("templateName").textContent = "auto_center_patch.png";
      if ($("templateDims")) $("templateDims").textContent = `${tw}×${th} px`;
      toast("Auto-cropped center patch as search template.", "info");
    };
    im.src = tc.toDataURL();
  });
}

if ($("detect")) {
  $("detect").addEventListener("click", (e) => {
    if (!requireImage()) return;
    if (!ensureCv()) return;
    if (!state.template) {
      toast("Please choose or auto-crop a template patch first.", "error");
      return;
    }

    const btn = e.currentTarget;
    btn.classList.add("busy");
    btn.disabled = true;

    try {
      clearOut("p9out");
      addOriginalCard("p9out");
      _t0 = performance.now();

      const src = baseMat();
      const tc = makeCanvas(
        state.template.naturalWidth || state.template.width,
        state.template.naturalHeight || state.template.height
      );
      tc.getContext("2d").drawImage(state.template, 0, 0, tc.width, tc.height);
      const templ = cv.imread(tc);

      if (templ.cols > src.cols || templ.rows > src.rows) {
        toast("Template dimensions must be smaller than the scene image.", "error");
        src.delete();
        templ.delete();
        return;
      }

      const srcRGB = new cv.Mat();
      const templRGB = new cv.Mat();
      cv.cvtColor(src, srcRGB, cv.COLOR_RGBA2RGB);
      cv.cvtColor(templ, templRGB, cv.COLOR_RGBA2RGB);

      const res = new cv.Mat();
      cv.matchTemplate(srcRGB, templRGB, res, cv.TM_CCOEFF_NORMED);
      const mm = cv.minMaxLoc(res);
      const pt = mm.maxLoc;

      const display = makeCanvas(srcRGB.cols, srcRGB.rows);
      cv.imshow(display, srcRGB);
      const ctx = display.getContext("2d");

      // Draw high-visibility detection HUD bounding box
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = Math.max(3, Math.round(Math.max(srcRGB.cols, srcRGB.rows) / 300));
      ctx.strokeRect(pt.x, pt.y, templRGB.cols, templRGB.rows);

      ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
      ctx.fillRect(pt.x, pt.y, templRGB.cols, templRGB.rows);

      // Target Reticle Corner Accents
      const cornerLen = Math.min(16, templRGB.cols / 3);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.strokeRect(pt.x - 2, pt.y - 2, cornerLen, cornerLen);

      const ms = Math.max(1, Math.round(performance.now() - _t0));
      addResultCard("p9out", {
        title: "Normalized Correlation Detection",
        canvas: display,
        meta: [`${srcRGB.cols} × ${srcRGB.rows} px`, `${ms} ms`],
        extra: `<span class="rc-score">Normalized Correlation Score: <b>γ = ${mm.maxVal.toFixed(4)}</b></span>`
      });

      src.delete();
      templ.delete();
      srcRGB.delete();
      templRGB.delete();
      res.delete();
    } catch (err) {
      console.error(err);
      toast("Detection failed: " + ((err && err.message) || err), "error");
    } finally {
      btn.classList.remove("busy");
      btn.disabled = false;
    }
  });
}

/* ═══════════════════ PRACTICAL 10 · Colour Spaces ═══════════════════ */
const COLOR_TITLES = {
  rgb: "Standard sRGB Color Tensor",
  hsv: "HSV Cylindrical Color Space (Hue/Sat/Val)",
  ycrcb: "YCrCb Luminance & Chrominance Space",
  lab: "CIE L*a*b* Perceptual Uniform Space"
};

function colorConvert(type) {
  const m = baseMat();
  const r = new cv.Mat();

  if (type === "rgb") {
    cv.cvtColor(m, r, cv.COLOR_RGBA2RGB);
  } else {
    const bgr = new cv.Mat();
    cv.cvtColor(m, bgr, cv.COLOR_RGBA2BGR);
    if (type === "hsv") cv.cvtColor(bgr, r, cv.COLOR_BGR2HSV);
    if (type === "ycrcb") cv.cvtColor(bgr, r, cv.COLOR_BGR2YCrCb);
    if (type === "lab") cv.cvtColor(bgr, r, cv.COLOR_BGR2Lab);
    bgr.delete();
  }

  showMat("p10out", COLOR_TITLES[type] || "Color Space", r);
  m.delete();
}

$$("[data-color]").forEach((b) =>
  b.addEventListener("click", () => runOp(b, "p10out", () => colorConvert(b.dataset.color)))
);

/* ═══════════════════ PRACTICAL 11 · Edge Detection ═══════════════════ */
function edge(type) {
  const m = baseMat();
  const g = new cv.Mat();
  const r = new cv.Mat();
  cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);

  if (type === "canny") {
    cv.Canny(g, r, +$("cannyLow").value, +$("cannyHigh").value);
  } else if (type === "sobel") {
    const sx = new cv.Mat();
    const sy = new cv.Mat();
    cv.Sobel(g, sx, cv.CV_64F, 1, 0, 3);
    cv.Sobel(g, sy, cv.CV_64F, 0, 1, 3);
    cv.magnitude(sx, sy, r);
    r.convertTo(r, cv.CV_8U);
    sx.delete();
    sy.delete();
  } else {
    // Prewitt 3x3 derivative masks
    const kx = cv.matFromArray(3, 3, cv.CV_32F, [-1, 0, 1, -1, 0, 1, -1, 0, 1]);
    const ky = cv.matFromArray(3, 3, cv.CV_32F, [-1, -1, -1, 0, 0, 0, 1, 1, 1]);
    const sx = new cv.Mat();
    const sy = new cv.Mat();
    cv.filter2D(g, sx, cv.CV_32F, kx);
    cv.filter2D(g, sy, cv.CV_32F, ky);
    cv.magnitude(sx, sy, r);
    r.convertTo(r, cv.CV_8U);
    kx.delete();
    ky.delete();
    sx.delete();
    sy.delete();
  }

  showMat(
    "p11out",
    type === "canny"
      ? `Canny Hysteresis (${$("cannyLow").value} / ${$("cannyHigh").value})`
      : type === "sobel"
      ? "Sobel Gradient Vector Magnitude"
      : "Prewitt Derivative Gradient Magnitude",
    r
  );
  m.delete();
  g.delete();
}

$$("[data-edge]").forEach((b) =>
  b.addEventListener("click", () => runOp(b, "p11out", () => edge(b.dataset.edge)))
);

/* ═══════════════════ Snippet Copy & Syntax Highlighting ═══════════════════ */
function copyText(text, okMsg) {
  const done = () => toast(okMsg, "success");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    done();
  } catch (e) {
    toast("Copy action failed.", "error");
  }
  ta.remove();
}

if ($("copySetup")) {
  $("copySetup").addEventListener("click", () =>
    copyText($("setupCode").textContent, "Python setup snippet copied.")
  );
}
if ($("copyRle")) {
  $("copyRle").addEventListener("click", () =>
    copyText($("rlePreview").textContent, "RLE byte stream copied.")
  );
}

/* Syntax Highlighting for Python Snippet */
(function highlightSetup() {
  const el = $("setupCode");
  if (!el) return;
  const KW = /\b(?:import|from|print|pip|def|return|for|in|as)\b/g;
  let html = el.textContent
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/(#[^\n]*)/g, '<span class="c">$1</span>')
    .replace(/("[^"]*"|'[^']*'|f"[^"]*")/g, '<span class="s">$1</span>');

  html = html.replace(KW, (m, off, str) => {
    const before = str.slice(0, off);
    const openSpans = (before.match(/<span/g) || []).length;
    const closeSpans = (before.match(/<\/span>/g) || []).length;
    return openSpans === closeSpans ? `<span class="k">${m}</span>` : m;
  });
  el.innerHTML = html;
})();

/* ═══════════════════ Keyboard Shortcuts ═══════════════════ */
document.addEventListener("keydown", (e) => {
  // If user is typing in an input, ignore shortcuts
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
    e.preventDefault();
    if ($("imageInput")) $("imageInput").click();
    return;
  }

  // Practical navigation shortcuts 1..9
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 9) {
    activateTab(`p${num}`);
    toast(`Switched to Practical 0${num}`, "info");
    return;
  }
  if (e.key === "0") {
    activateTab("p10");
    toast("Switched to Practical 10 (Colour Spaces)", "info");
    return;
  }
  if (e.key.toLowerCase() === "c") {
    activateTab("p7");
    toast("Switched to Practical 07 (Lossless Compression)", "info");
    return;
  }

  // Brush sizing shortcuts
  if (e.key === "[") {
    const b = $("brush");
    if (b) {
      b.value = Math.max(3, parseInt(b.value, 10) - 3);
      syncRange(b);
      toast(`Brush radius: ${b.value}px`, "info");
    }
  }
  if (e.key === "]") {
    const b = $("brush");
    if (b) {
      b.value = Math.min(50, parseInt(b.value, 10) + 3);
      syncRange(b);
      toast(`Brush radius: ${b.value}px`, "info");
    }
  }
});

/* ═══════════════════ Backend Bridge & Initial Load ═══════════════════ */
document.addEventListener("click", (e) => {
  const b = e.target.closest(
    "[data-op],[data-transform],[data-enhance],[data-filter],[data-inpaint],[data-morph],[data-color],[data-edge],#compress,#detect"
  );
  if (!b) return;
  const panel = b.closest(".panel");
  const code = panel ? panel.id.replace("p", "") : "unknown";
  const operation =
    b.dataset.op ||
    b.dataset.transform ||
    b.dataset.enhance ||
    b.dataset.filter ||
    b.dataset.inpaint ||
    b.dataset.morph ||
    b.dataset.color ||
    b.dataset.edge ||
    (b.id === "compress" ? "RLE Compression" : "Correlation Detection");

  if (typeof recordExperiment === "function") {
    recordExperiment(code, operation, ($("fileName") && $("fileName").textContent) || "browser-image");
  }
});

(async function initStudent() {
  if (typeof loadBackendStudent !== "function") return;
  try {
    const s = await loadBackendStudent();
    if (!s) return;
    if (s.name) {
      if ($("studentName")) $("studentName").textContent = s.name;
      if ($("studentAvatar")) {
        $("studentAvatar").textContent = String(s.name)
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0] || "")
          .join("")
          .toUpperCase();
      }
    }
    const bits = [s.department, s.year ? "Year " + s.year : null, s.rollNo ? "Roll No. " + s.rollNo : null]
      .filter(Boolean)
      .join(" · ");
    if (bits && $("studentMeta")) $("studentMeta").textContent = bits;
  } catch (e) {
    /* frontend-only deployment */
  }
})();

// Auto-load default calibrated sample scene upon startup
window.addEventListener("DOMContentLoaded", () => {
  generateSample(1);
});
