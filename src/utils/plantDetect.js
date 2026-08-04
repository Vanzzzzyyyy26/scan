/**
 * Client-side plant region detection using Excess Green (ExG) vegetation index.
 * - Finds the main plant area (analysis only — does not paint the photo)
 * - Detects multiple separate plants so the app can require a single subject
 */

const ANALYZE_MAX = 160; // analysis width (fast + good enough for blobs)
const MIN_PLANT_AREA_RATIO = 0.012; // ~1.2% of frame
const MIN_SECOND_PLANT_RATIO = 0.45; // 2nd blob must be at least 45% of main to count
const MULTI_MIN_SEPARATION = 0.12; // centers must be this far apart (normalized)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not load image for plant detect"));
    img.src = src;
  });
}

/** Excess Green index: higher = more vegetation-like. */
function excessGreen(r, g, b) {
  return 2 * g - r - b;
}

/**
 * Build a binary plant mask from ImageData (RGBA).
 * Uses ExG + mild green preference; returns Uint8Array 0/1.
 */
function buildPlantMask(imageData) {
  const { data, width, height } = imageData;
  const n = width * height;
  const mask = new Uint8Array(n);
  let sum = 0;
  let count = 0;

  // Pass 1: ExG stats for adaptive threshold
  const exg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const v = excessGreen(r, g, b);
    exg[i] = v;
    // Ignore near-black / near-white (background / sky / flash)
    const lum = (r + g + b) / 3;
    if (lum > 18 && lum < 245) {
      sum += v;
      count += 1;
    }
  }

  const mean = count ? sum / count : 0;
  // Adaptive: mean + offset, but never below a fixed floor for green leaves
  const threshold = Math.max(18, mean + 12);

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const lum = (r + g + b) / 3;
    const greenBias = g > r + 8 && g > b + 5;
    const strongExg = exg[i] >= threshold;
    const ok =
      lum > 15 && lum < 250 && (strongExg || (greenBias && exg[i] > mean));
    mask[i] = ok ? 1 : 0;
  }

  // Light cleanup: remove isolated pixels (3x3 majority)
  return majorityFilter(mask, width, height);
}

function majorityFilter(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let votes = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          votes += mask[(y + dy) * width + (x + dx)];
        }
      }
      out[y * width + x] = votes >= 5 ? 1 : 0;
    }
  }
  return out;
}

/**
 * Connected components (4-connected). Returns blobs sorted by area desc.
 * Each blob: { id, area, minX, minY, maxX, maxY, cx, cy }
 */
function findBlobs(mask, width, height) {
  const labels = new Int32Array(mask.length);
  const blobs = [];
  let nextId = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i] || labels[i]) continue;

      // BFS flood fill
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let sumX = 0;
      let sumY = 0;
      const queue = [i];
      labels[i] = nextId;

      while (queue.length) {
        const cur = queue.pop();
        const cx = cur % width;
        const cy = (cur / width) | 0;
        area += 1;
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [];
        if (cx > 0) neighbors.push(cur - 1);
        if (cx < width - 1) neighbors.push(cur + 1);
        if (cy > 0) neighbors.push(cur - width);
        if (cy < height - 1) neighbors.push(cur + width);

        for (const n of neighbors) {
          if (!mask[n] || labels[n]) continue;
          labels[n] = nextId;
          queue.push(n);
        }
      }

      blobs.push({
        id: nextId,
        area,
        minX,
        minY,
        maxX,
        maxY,
        cx: sumX / area,
        cy: sumY / area,
      });
      nextId += 1;
    }
  }

  blobs.sort((a, b) => b.area - a.area);
  return { blobs, labels };
}

function distNorm(a, b, width, height) {
  const dx = (a.cx - b.cx) / width;
  const dy = (a.cy - b.cy) / height;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Decide how many distinct plant subjects are in frame.
 * Nearby blobs are merged into the main plant; far large blobs count as extra plants.
 */
function countPlantSubjects(blobs, width, height) {
  const frameArea = width * height;
  const significant = blobs.filter(
    (b) => b.area / frameArea >= MIN_PLANT_AREA_RATIO,
  );

  if (!significant.length) {
    return { plantCount: 0, main: null, others: [] };
  }

  const main = significant[0];
  const others = [];

  for (let i = 1; i < significant.length; i++) {
    const b = significant[i];
    const sizeRatio = b.area / main.area;
    const far = distNorm(main, b, width, height) >= MULTI_MIN_SEPARATION;
    // Count as second plant only if large enough AND clearly separate
    if (sizeRatio >= MIN_SECOND_PLANT_RATIO && far) {
      others.push(b);
    }
  }

  return {
    plantCount: 1 + others.length,
    main,
    others,
  };
}

function boxFromBlob(blob, scaleX, scaleY, pad = 6) {
  if (!blob) return null;
  return {
    x: Math.max(0, blob.minX * scaleX - pad),
    y: Math.max(0, blob.minY * scaleY - pad),
    w: (blob.maxX - blob.minX + 1) * scaleX + pad * 2,
    h: (blob.maxY - blob.minY + 1) * scaleY + pad * 2,
  };
}

/**
 * Analyze a video element or image source for plant regions.
 * @param {HTMLVideoElement|HTMLImageElement|string} source
 * @returns {Promise<object>}
 */
export async function analyzePlantRegions(source) {
  let sw;
  let sh;
  let drawSource;

  if (typeof source === "string") {
    const img = await loadImage(source);
    sw = img.naturalWidth || img.width;
    sh = img.naturalHeight || img.height;
    drawSource = img;
  } else if (source instanceof HTMLVideoElement) {
    sw = source.videoWidth;
    sh = source.videoHeight;
    drawSource = source;
    if (!sw || !sh) {
      return emptyResult("Camera not ready");
    }
  } else if (source instanceof HTMLImageElement) {
    sw = source.naturalWidth || source.width;
    sh = source.naturalHeight || source.height;
    drawSource = source;
  } else {
    return emptyResult("Invalid source");
  }

  if (!sw || !sh) return emptyResult("No dimensions");

  const scale = ANALYZE_MAX / Math.max(sw, sh);
  const aw = Math.max(1, Math.round(sw * scale));
  const ah = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = aw;
  canvas.height = ah;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(drawSource, 0, 0, aw, ah);
  const imageData = ctx.getImageData(0, 0, aw, ah);

  const mask = buildPlantMask(imageData);
  const { blobs } = findBlobs(mask, aw, ah);
  const { plantCount, main, others } = countPlantSubjects(blobs, aw, ah);

  const scaleX = sw / aw;
  const scaleY = sh / ah;

  const mainBox = boxFromBlob(main, scaleX, scaleY);
  const otherBoxes = others.map((b) => boxFromBlob(b, scaleX, scaleY));

  // Normalized boxes (0–1) for CSS overlays independent of display size
  const toNorm = (box) =>
    box
      ? {
          x: box.x / sw,
          y: box.y / sh,
          w: box.w / sw,
          h: box.h / sh,
        }
      : null;

  const plantCoverage = main ? main.area / (aw * ah) : 0;
  const multiPlant = plantCount >= 2;
  const noPlant = plantCount === 0;

  let status = "ok";
  let message = "Isang halaman — handa nang i-scan";
  if (noPlant) {
    status = "no_plant";
    message = "Walang malinaw na halaman. I-point ang camera sa dahon o puno.";
  } else if (multiPlant) {
    status = "multi_plant";
    message =
      "May dalawa o higit pang halaman. Mag-focus sa ISANG halaman lang.";
  } else if (plantCoverage < 0.04) {
    status = "too_far";
    message = "Lumapit pa — dapat mas malaki sa frame ang isang halaman.";
  }

  return {
    ok: status === "ok" || status === "too_far",
    status,
    message,
    plantCount,
    multiPlant,
    noPlant,
    plantCoverage,
    mainBox,
    otherBoxes,
    mainBoxNorm: toNorm(mainBox),
    otherBoxesNorm: otherBoxes.map(toNorm).filter(Boolean),
    sourceWidth: sw,
    sourceHeight: sh,
  };
}

function emptyResult(message) {
  return {
    ok: false,
    status: "empty",
    message,
    plantCount: 0,
    multiPlant: false,
    noPlant: true,
    plantCoverage: 0,
    mainBox: null,
    otherBoxes: [],
    mainBoxNorm: null,
    otherBoxesNorm: [],
    sourceWidth: 0,
    sourceHeight: 0,
  };
}

/**
 * Analyze plant regions without painting the photo.
 * Returns original image unchanged (natural preview).
 * @returns {Promise<{ highlightedDataUrl: string, analysis: object }>}
 */
export async function highlightPlantInImage(imageDataUrl) {
  const analysis = await analyzePlantRegions(imageDataUrl);
  return {
    highlightedDataUrl: imageDataUrl,
    analysis,
  };
}

/**
 * Quick live check from video (throttled by caller).
 */
export async function analyzeVideoFrame(videoEl) {
  if (!videoEl?.videoWidth) return emptyResult("Camera not ready");
  return analyzePlantRegions(videoEl);
}
