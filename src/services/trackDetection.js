import {
  clamp,
  distance,
  polylineLength,
  resamplePolyline,
  smoothPolyline,
} from "../utils/geometry.js";

/**
 * Pure-canvas track detection.
 *
 * Strategy (no OpenCV skeletonization needed):
 *   1. Read raw RGBA pixels from the canvas.
 *   2. Build a binary mask — dark pixels (brightness < threshold) = 1.
 *   3. Compute a distance-transform to find how far each dark pixel is
 *      from the nearest non-dark pixel. The thickest line has the highest
 *      values in the distance field.
 *   4. Find connected components of the binary mask and keep only the
 *      largest one (the track).
 *   5. Among that component, collect the "ridge" — pixels whose distance
 *      value is a local maximum across a small neighborhood. This is the
 *      centerline of the thick track.
 *   6. Order the ridge pixels into a path (nearest-neighbor greedy walk).
 *   7. Smooth & resample.
 */
export class TrackDetectionService {
  /* OpenCV is loaded but we no longer require it for detection. */
  isReady() {
    return true;
  }

  detect(sourceCanvas, { density = 40 } = {}) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, w, h);
    const rgba = imageData.data;

    // --- 1. DOWN-SCALE for speed (work at ≤ 400px on the longest side) ---
    const MAX_DIM = 400;
    let scale = 1;
    let sw = w, sh = h;
    if (Math.max(w, h) > MAX_DIM) {
      scale = Math.max(w, h) / MAX_DIM;
      sw = Math.round(w / scale);
      sh = Math.round(h / scale);
    }

    // Build brightness array at working resolution
    const bright = new Uint8Array(sw * sh);
    for (let sy = 0; sy < sh; sy++) {
      for (let sx = 0; sx < sw; sx++) {
        // nearest-neighbor sample from original
        const ox = Math.min(Math.round(sx * scale), w - 1);
        const oy = Math.min(Math.round(sy * scale), h - 1);
        const idx = (oy * w + ox) * 4;
        const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2];
        bright[sy * sw + sx] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }
    }

    // --- 2. BINARY MASK (dark pixels) ---
    // Use a low threshold to only catch truly black lines (not grey ones)
    const THRESH = 80;
    const mask = new Uint8Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      mask[i] = bright[i] < THRESH ? 1 : 0;
    }

    // Morphological close (dilate then erode) with a 3x3 kernel to fill small gaps
    this._dilate(mask, sw, sh);
    this._erode(mask, sw, sh);

    // --- 3. CONNECTED COMPONENTS — keep only the largest ---
    const labels = new Int32Array(sw * sh);
    labels.fill(-1);
    const components = []; // [{size, id}]
    let nextLabel = 0;

    for (let i = 0; i < sw * sh; i++) {
      if (mask[i] === 0 || labels[i] !== -1) continue;
      const compId = nextLabel++;
      let size = 0;
      const queue = [i];
      labels[i] = compId;
      let head = 0;
      while (head < queue.length) {
        const ci = queue[head++];
        size++;
        const cx = ci % sw, cy = (ci - cx) / sw;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= sw || ny < 0 || ny >= sh) continue;
            const ni = ny * sw + nx;
            if (mask[ni] === 1 && labels[ni] === -1) {
              labels[ni] = compId;
              queue.push(ni);
            }
          }
        }
      }
      components.push({ id: compId, size });
    }

    if (components.length === 0) {
      throw new Error("트랙처럼 보이는 선을 찾지 못했습니다.");
    }

    // Pick the component that has the largest bounding-box diagonal * area product
    // (this favours the track which spans the image over small blobs like text)
    let bestComp = components[0];
    let bestScore = -1;
    for (const comp of components) {
      // compute bounding box
      let minX = sw, minY = sh, maxX = 0, maxY = 0;
      for (let i = 0; i < sw * sh; i++) {
        if (labels[i] !== comp.id) continue;
        const x = i % sw, y = (i - x) / sw;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const diag = Math.hypot(maxX - minX, maxY - minY);
      const score = diag * comp.size;
      if (score > bestScore) {
        bestScore = score;
        bestComp = comp;
      }
    }

    // Zero out non-track pixels
    for (let i = 0; i < sw * sh; i++) {
      if (labels[i] !== bestComp.id) mask[i] = 0;
    }

    // --- 4. DISTANCE TRANSFORM (Chamfer 3-4 approximation) ---
    const dist = new Float32Array(sw * sh);
    // forward pass
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = y * sw + x;
        if (mask[i] === 0) { dist[i] = 0; continue; }
        let d = 1e9;
        if (y > 0) d = Math.min(d, dist[(y - 1) * sw + x] + 3);
        if (x > 0) d = Math.min(d, dist[y * sw + x - 1] + 3);
        if (x > 0 && y > 0) d = Math.min(d, dist[(y - 1) * sw + x - 1] + 4);
        if (x < sw - 1 && y > 0) d = Math.min(d, dist[(y - 1) * sw + x + 1] + 4);
        dist[i] = d;
      }
    }
    // backward pass
    for (let y = sh - 1; y >= 0; y--) {
      for (let x = sw - 1; x >= 0; x--) {
        const i = y * sw + x;
        if (mask[i] === 0) continue;
        let d = dist[i];
        if (y < sh - 1) d = Math.min(d, dist[(y + 1) * sw + x] + 3);
        if (x < sw - 1) d = Math.min(d, dist[y * sw + x + 1] + 3);
        if (x < sw - 1 && y < sh - 1) d = Math.min(d, dist[(y + 1) * sw + x + 1] + 4);
        if (x > 0 && y < sh - 1) d = Math.min(d, dist[(y + 1) * sw + x - 1] + 4);
        dist[i] = d;
      }
    }

    // --- 5. RIDGE EXTRACTION — local maxima of distance field ---
    const RIDGE_RADIUS = 2;
    const ridgePixels = [];
    for (let y = RIDGE_RADIUS; y < sh - RIDGE_RADIUS; y++) {
      for (let x = RIDGE_RADIUS; x < sw - RIDGE_RADIUS; x++) {
        const i = y * sw + x;
        if (mask[i] === 0) continue;
        const val = dist[i];
        if (val < 4) continue; // skip thin features (text, noise)
        let isMax = true;
        outer:
        for (let dy = -RIDGE_RADIUS; dy <= RIDGE_RADIUS; dy++) {
          for (let dx = -RIDGE_RADIUS; dx <= RIDGE_RADIUS; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (dist[(y + dy) * sw + (x + dx)] > val) { isMax = false; break outer; }
          }
        }
        if (isMax) {
          ridgePixels.push({ x, y });
        }
      }
    }

    if (ridgePixels.length < 3) {
      throw new Error("트랙 중심선을 추출하지 못했습니다. 이미지에 굵은 검정 선이 있는지 확인해주세요.");
    }

    // --- 6. ORDER ridge pixels into a path (greedy nearest-neighbor) ---
    const ordered = this._orderByNearest(ridgePixels);

    // Map back to original coordinates
    const rawPath = ordered.map(p => ({
      x: p.x * scale,
      y: p.y * scale,
    }));

    // --- 7. SMOOTH & RESAMPLE ---
    const smoothed = smoothPolyline(rawPath, 3, 3);
    const totalLength = polylineLength(smoothed);
    const spacing = clamp(density, 10, 120);
    const sampleCount = clamp(Math.round(totalLength / spacing), 12, 200);
    const trackPoints = resamplePolyline(smoothed, sampleCount);

    return { trackPoints };
  }

  /** Dilate binary mask (1-pixel, 8-connected) in-place */
  _dilate(mask, w, h) {
    const copy = new Uint8Array(mask);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (copy[y * w + x]) continue;
        let hit = false;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (let dx = -1; dx <= 1 && !hit; dx++) {
            if (copy[(y + dy) * w + (x + dx)]) hit = true;
          }
        }
        if (hit) mask[y * w + x] = 1;
      }
    }
  }

  /** Erode binary mask (1-pixel, 8-connected) in-place */
  _erode(mask, w, h) {
    const copy = new Uint8Array(mask);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!copy[y * w + x]) continue;
        let allSet = true;
        for (let dy = -1; dy <= 1 && allSet; dy++) {
          for (let dx = -1; dx <= 1 && allSet; dx++) {
            if (!copy[(y + dy) * w + (x + dx)]) allSet = false;
          }
        }
        if (!allSet) mask[y * w + x] = 0;
      }
    }
  }

  /** Greedy nearest-neighbor ordering of 2D points */
  _orderByNearest(points) {
    if (points.length <= 2) return [...points];

    const n = points.length;
    const used = new Uint8Array(n);
    const result = [];

    // Start from the point with the smallest x (leftmost)
    let startIdx = 0;
    for (let i = 1; i < n; i++) {
      if (points[i].x < points[startIdx].x ||
          (points[i].x === points[startIdx].x && points[i].y < points[startIdx].y)) {
        startIdx = i;
      }
    }

    used[startIdx] = 1;
    result.push(points[startIdx]);

    for (let step = 1; step < n; step++) {
      const last = result[result.length - 1];
      let bestDist = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const d = (points[i].x - last.x) ** 2 + (points[i].y - last.y) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      // Stop if the next nearest point is very far away (disconnected cluster)
      if (bestDist > 400) break;  // 20px gap max at working resolution
      used[bestIdx] = 1;
      result.push(points[bestIdx]);
    }

    return result;
  }
}
