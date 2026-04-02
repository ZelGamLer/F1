
      const fileInput = document.getElementById("fileInput");
      const autoDetectBtn = document.getElementById("autoDetectBtn");
      const clearDetectBtn = document.getElementById("clearDetectBtn");
      const clearBtn = document.getElementById("clearBtn");
      const undoBtn = document.getElementById("undoBtn");
      const lineBtn = document.getElementById("lineBtn");
      const apexBtn = document.getElementById("apexBtn");
      const playBtn = document.getElementById("playBtn");
      const pauseBtn = document.getElementById("pauseBtn");
      const resetCarBtn = document.getElementById("resetCarBtn");
      const canvas = document.getElementById("canvas");
      const ctx = canvas.getContext("2d");
      const lineCanvas = document.getElementById("lineCanvas");
      const lctx = lineCanvas.getContext("2d");
      const resultCanvas = document.getElementById("resultCanvas");
      const rctx = resultCanvas.getContext("2d");
      const statusEl = document.getElementById("status");
      const cvStatus = document.getElementById("cvStatus");
      const muSlider = document.getElementById("mu");
      const downforceSlider = document.getElementById("downforce");
      const initialSpeedSlider = document.getElementById("initialSpeed");
      const massSlider = document.getElementById("mass");
      const brakePowerSlider = document.getElementById("brakePower");
      const accelPowerSlider = document.getElementById("accelPower");
      const tireStateSelect = document.getElementById("tireState");
      const surfaceStateSelect = document.getElementById("surfaceState");
      const muVal = document.getElementById("muVal");
      const downforceVal = document.getElementById("downforceVal");
      const initialSpeedVal = document.getElementById("initialSpeedVal");
      const massVal = document.getElementById("massVal");
      const brakePowerVal = document.getElementById("brakePowerVal");
      const accelPowerVal = document.getElementById("accelPowerVal");
      const muEffVal = document.getElementById("muEffVal");
      const apexCoordVal = document.getElementById("apexCoordVal");
      const minSpeedVal = document.getElementById("minSpeedVal");
      const progressVal = document.getElementById("progressVal");

      let originalImage = null;
      let userPoints = [];
      let smoothPath = [];
      let optimizedPath = [];
      let apexPoint = null;
      let speedProfile = [];
      let segmentTypes = [];
      let detectedCornerPoints = [];
      let minSpeed = null;
      let animationFrameId = null;
      let isPlaying = false;
      let carIndex = 0;
      let carSubstep = 0;

      function setStatus(message) {
        statusEl.textContent = message;
      }

      function getEffectiveMu() {
        return (
          Number(muSlider.value) *
          Number(tireStateSelect.value) *
          Number(surfaceStateSelect.value)
        );
      }

      function updateMetricCards() {
        muEffVal.textContent = getEffectiveMu().toFixed(2);
        apexCoordVal.textContent = apexPoint
          ? `(${apexPoint.x.toFixed(1)}, ${apexPoint.y.toFixed(1)})`
          : "-";
        minSpeedVal.textContent = minSpeed !== null ? minSpeed.toFixed(1) : "-";
        const path = getPath();
        const progress =
          path.length > 1
            ? Math.round((carIndex / Math.max(1, path.length - 1)) * 100)
            : 0;
        progressVal.textContent = `${progress}%`;
      }

      function updateLabels() {
        muVal.textContent = Number(muSlider.value).toFixed(2);
        downforceVal.textContent = Number(downforceSlider.value).toFixed(3);
        initialSpeedVal.textContent = Number(initialSpeedSlider.value).toFixed(
          0,
        );
        massVal.textContent = Number(massSlider.value).toFixed(0);
        brakePowerVal.textContent = Number(brakePowerSlider.value).toFixed(1);
        accelPowerVal.textContent = Number(accelPowerSlider.value).toFixed(1);
        updateMetricCards();
      }

      function updateCvStatus() {
        cvStatus.textContent = window.cvReady
          ? "OpenCV.js ?ъ슜 媛??
          : "OpenCV.js 濡쒕뵫 ?湲?以?;
      }
      setInterval(updateCvStatus, 800);
      updateCvStatus();

      function updateAndAnalyzeIfNeeded() {
        updateLabels();
        if (smoothPath.length >= 3) {
          const optimizedControls = buildOptimizedControlPoints(userPoints);
          optimizedPath = catmullRomSpline(optimizedControls, 30);
          analyzePath(false);
        } else {
          redraw();
        }
      }

      updateLabels();
      muSlider.addEventListener("input", updateAndAnalyzeIfNeeded);
      downforceSlider.addEventListener("input", updateAndAnalyzeIfNeeded);
      initialSpeedSlider.addEventListener("input", updateAndAnalyzeIfNeeded);
      massSlider.addEventListener("input", updateAndAnalyzeIfNeeded);
      brakePowerSlider.addEventListener("input", updateAndAnalyzeIfNeeded);
      accelPowerSlider.addEventListener("input", updateAndAnalyzeIfNeeded);
      tireStateSelect.addEventListener("change", updateAndAnalyzeIfNeeded);
      surfaceStateSelect.addEventListener("change", updateAndAnalyzeIfNeeded);

      function cloneImageData(imageData) {
        return new ImageData(
          new Uint8ClampedArray(imageData.data),
          imageData.width,
          imageData.height,
        );
      }

      function getPath() {
        return optimizedPath.length > 1 ? optimizedPath : smoothPath;
      }

      function getCarPoint() {
        const path = getPath();
        if (path.length === 0) return null;
        const idx = Math.min(carIndex, path.length - 1);
        if (idx >= path.length - 1) return path[path.length - 1];
        const a = path[idx];
        const b = path[idx + 1];
        return {
          x: a.x + (b.x - a.x) * carSubstep,
          y: a.y + (b.y - a.y) * carSubstep,
        };
      }

      function drawCar(targetCtx) {
        const p = getCarPoint();
        if (!p) return;
        targetCtx.fillStyle = "#111827";
        targetCtx.beginPath();
        targetCtx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.strokeStyle = "#ffffff";
        targetCtx.lineWidth = 2;
        targetCtx.stroke();
      }

      function renderBaseImage() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (originalImage)
          ctx.putImageData(cloneImageData(originalImage), 0, 0);
        else {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }

      function drawDetectedPoints(targetCtx) {
        if (!detectedCornerPoints.length) return;
        if (detectedCornerPoints.length > 1) {
          targetCtx.save();
          targetCtx.strokeStyle = "rgba(0, 188, 212, 0.7)";
          targetCtx.lineWidth = 2.5;
          targetCtx.beginPath();
          targetCtx.moveTo(detectedCornerPoints[0].x, detectedCornerPoints[0].y);
          for (let i = 1; i < detectedCornerPoints.length; i++) {
            targetCtx.lineTo(
              detectedCornerPoints[i].x,
              detectedCornerPoints[i].y,
            );
          }
          targetCtx.stroke();
          targetCtx.restore();
        }
        const radius = detectedCornerPoints.length > 24 ? 3 : 4;
        targetCtx.fillStyle = "#00bcd4";
        for (const p of detectedCornerPoints) {
          targetCtx.beginPath();
          targetCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          targetCtx.fill();
        }
      }

      function drawUserPoints() {
        if (!userPoints.length) return;
        ctx.strokeStyle = "#32d74b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(userPoints[0].x, userPoints[0].y);
        for (let i = 1; i < userPoints.length; i++)
          ctx.lineTo(userPoints[i].x, userPoints[i].y);
        ctx.stroke();
        ctx.fillStyle = "#ef4444";
        userPoints.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, i === 0 ? 5 : 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      function drawSmoothPathOnMain() {
        const path = getPath();
        if (path.length < 2) return;
        ctx.strokeStyle = "#ff00aa";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      }

      function drawApexOnMain() {
        if (!apexPoint) return;
        ctx.fillStyle = "#1565c0";
        ctx.beginPath();
        ctx.arc(apexPoint.x, apexPoint.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      function drawSegmentedPath(targetCtx) {
        const path = getPath();
        if (path.length < 2 || segmentTypes.length !== path.length - 1) return;
        targetCtx.lineWidth = 5;
        for (let i = 0; i < path.length - 1; i++) {
          const type = segmentTypes[i];
          targetCtx.strokeStyle =
            type === "accelerate"
              ? "#2e7d32"
              : type === "brake"
                ? "#c62828"
                : "#f9a825";
          targetCtx.beginPath();
          targetCtx.moveTo(path[i].x, path[i].y);
          targetCtx.lineTo(path[i + 1].x, path[i + 1].y);
          targetCtx.stroke();
        }
      }

      function drawLineCanvas() {
        const path = getPath();
        lctx.clearRect(0, 0, lineCanvas.width, lineCanvas.height);
        if (originalImage)
          lctx.putImageData(cloneImageData(originalImage), 0, 0);
        else {
          lctx.fillStyle = "white";
          lctx.fillRect(0, 0, lineCanvas.width, lineCanvas.height);
        }
        if (path.length > 1) {
          lctx.strokeStyle = "#ff00aa";
          lctx.lineWidth = 4;
          lctx.beginPath();
          lctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++)
            lctx.lineTo(path[i].x, path[i].y);
          lctx.stroke();
        }
        if (apexPoint) {
          lctx.fillStyle = "#1565c0";
          lctx.beginPath();
          lctx.arc(apexPoint.x, apexPoint.y, 7, 0, Math.PI * 2);
          lctx.fill();
        }
        drawCar(lctx);
      }

      function drawResultCanvas() {
        rctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
        if (originalImage)
          rctx.putImageData(cloneImageData(originalImage), 0, 0);
        else {
          rctx.fillStyle = "white";
          rctx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
        }
        drawSegmentedPath(rctx);
        drawCar(rctx);
      }

      function redraw() {
        renderBaseImage();
        drawDetectedPoints(ctx);
        drawSmoothPathOnMain();
        drawUserPoints();
        drawApexOnMain();
        drawCar(ctx);
        drawLineCanvas();
        drawResultCanvas();
        updateMetricCards();
      }

      function linearInterpolate(a, b, samples) {
        const out = [];
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
        return out;
      }

      function polylineLength(points) {
        let total = 0;
        for (let i = 1; i < points.length; i++) {
          total += Math.hypot(
            points[i].x - points[i - 1].x,
            points[i].y - points[i - 1].y,
          );
        }
        return total;
      }

      function smoothPolyline(points, radius = 2, passes = 2) {
        if (points.length < 3) return points.slice();
        let current = points.map((p) => ({ x: p.x, y: p.y }));
        for (let pass = 0; pass < passes; pass++) {
          const next = current.map((p, i) => {
            if (i === 0 || i === current.length - 1) return { x: p.x, y: p.y };
            let sumX = 0;
            let sumY = 0;
            let count = 0;
            const start = Math.max(0, i - radius);
            const end = Math.min(current.length - 1, i + radius);
            for (let j = start; j <= end; j++) {
              sumX += current[j].x;
              sumY += current[j].y;
              count += 1;
            }
            return { x: sumX / count, y: sumY / count };
          });
          current = next;
        }
        return current;
      }

      function resamplePolyline(points, sampleCount) {
        if (points.length <= sampleCount) return points.slice();
        if (points.length < 2 || sampleCount < 2) return points.slice();

        const distances = [0];
        for (let i = 1; i < points.length; i++) {
          distances.push(
            distances[i - 1] +
              Math.hypot(
                points[i].x - points[i - 1].x,
                points[i].y - points[i - 1].y,
              ),
          );
        }

        const totalLength = distances[distances.length - 1];
        if (totalLength === 0) return points.slice(0, sampleCount);

        const sampled = [{ x: points[0].x, y: points[0].y }];
        let cursor = 1;

        for (let i = 1; i < sampleCount - 1; i++) {
          const targetDistance = (totalLength * i) / (sampleCount - 1);
          while (
            cursor < distances.length - 1 &&
            distances[cursor] < targetDistance
          ) {
            cursor += 1;
          }
          const prevDistance = distances[cursor - 1];
          const nextDistance = distances[cursor];
          const span = nextDistance - prevDistance || 1;
          const t = (targetDistance - prevDistance) / span;
          const a = points[cursor - 1];
          const b = points[cursor];
          sampled.push({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
          });
        }

        sampled.push({
          x: points[points.length - 1].x,
          y: points[points.length - 1].y,
        });
        return sampled;
      }

      function buildNeighborGraph(points) {
        const keyToIndex = new Map();
        points.forEach((p, i) => keyToIndex.set(`${p.x},${p.y}`, i));
        const neighbors = Array.from({ length: points.length }, () => []);
        const directions = [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ];

        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          for (const [dx, dy] of directions) {
            const neighborIndex = keyToIndex.get(`${p.x + dx},${p.y + dy}`);
            if (neighborIndex !== undefined) neighbors[i].push(neighborIndex);
          }
        }

        return neighbors;
      }

      function findFarthestGraphNode(startIndex, neighbors) {
        const queue = new Int32Array(neighbors.length);
        const visited = new Int8Array(neighbors.length);
        const parent = new Int32Array(neighbors.length);
        parent.fill(-1);

        let head = 0;
        let tail = 0;
        let farthest = startIndex;

        queue[tail++] = startIndex;
        visited[startIndex] = 1;

        while (head < tail) {
          const node = queue[head++];
          farthest = node;
          for (const next of neighbors[node]) {
            if (visited[next]) continue;
            visited[next] = 1;
            parent[next] = node;
            queue[tail++] = next;
          }
        }

        return { index: farthest, parent };
      }

      function extractOrderedSkeletonPath(skeleton, offsetX = 0, offsetY = 0) {
        const pixels = [];
        for (let y = 0; y < skeleton.rows; y++) {
          for (let x = 0; x < skeleton.cols; x++) {
            if (skeleton.ucharPtr(y, x)[0] > 0) pixels.push({ x, y });
          }
        }

        if (pixels.length < 2) {
          return pixels.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
        }

        const neighbors = buildNeighborGraph(pixels);
        let startIndex = neighbors.findIndex((list) => list.length === 1);
        if (startIndex === -1)
          startIndex = neighbors.findIndex((list) => list.length > 0);
        if (startIndex === -1)
          return pixels.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));

        const firstPass = findFarthestGraphNode(startIndex, neighbors);
        const secondPass = findFarthestGraphNode(firstPass.index, neighbors);
        const orderedIndices = [];
        let cursor = secondPass.index;
        const seen = new Set();

        while (cursor !== -1 && !seen.has(cursor)) {
          orderedIndices.push(cursor);
          if (cursor === firstPass.index) break;
          seen.add(cursor);
          cursor = secondPass.parent[cursor];
        }

        orderedIndices.reverse();
        return orderedIndices.map((index) => ({
          x: pixels[index].x + offsetX,
          y: pixels[index].y + offsetY,
        }));
      }

      function skeletonizeBinary(mask) {
        const working = mask.clone();
        const skeleton = cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);
        const eroded = new cv.Mat();
        const opened = new cv.Mat();
        const residue = new cv.Mat();
        const kernel = cv.getStructuringElement(
          cv.MORPH_CROSS,
          new cv.Size(3, 3),
        );

        try {
          while (cv.countNonZero(working) > 0) {
            cv.erode(working, eroded, kernel);
            cv.dilate(eroded, opened, kernel);
            cv.subtract(working, opened, residue);
            cv.bitwise_or(skeleton, residue, skeleton);
            eroded.copyTo(working);
          }
          return skeleton;
        } finally {
          working.delete();
          eroded.delete();
          opened.delete();
          residue.delete();
          kernel.delete();
        }
      }

      function extractCenterlineSamples(mask, offsetX = 0, offsetY = 0) {
        const skeleton = skeletonizeBinary(mask);
        try {
          const ordered = extractOrderedSkeletonPath(skeleton, offsetX, offsetY);
          if (ordered.length < 2) return ordered;

          const smoothed = smoothPolyline(ordered, 2, 2);
          const length = polylineLength(smoothed);
          const sampleCount = clamp(Math.round(length / 18), 18, 72);
          return resamplePolyline(smoothed, sampleCount);
        } finally {
          skeleton.delete();
        }
      }

      function catmullRomSpline(points, samplesPerSegment = 25) {
        if (points.length < 2) return points.slice();
        if (points.length === 2)
          return linearInterpolate(points[0], points[1], samplesPerSegment);
        const result = [];
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          for (let j = 0; j < samplesPerSegment; j++) {
            const t = j / samplesPerSegment;
            const t2 = t * t;
            const t3 = t2 * t;
            const x =
              0.5 *
              (2 * p1.x +
                (-p0.x + p2.x) * t +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
            const y =
              0.5 *
              (2 * p1.y +
                (-p0.y + p2.y) * t +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
            result.push({ x, y });
          }
        }
        result.push(points[points.length - 1]);
        return result;
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function buildOptimizedControlPoints(points) {
        if (points.length < 3) return points.slice();
        const initialSpeed = Number(initialSpeedSlider.value);
        const brakePower = Number(brakePowerSlider.value);
        const accelPower = Number(accelPowerSlider.value);
        const muEff = getEffectiveMu();
        const downforce = Number(downforceSlider.value);
        const optimized = points.map((p) => ({ x: p.x, y: p.y }));
        let apexSeed = 1;
        let maxSeedCurvature = -1;
        for (let i = 1; i < points.length - 1; i++) {
          const k = curvature(points[i - 1], points[i], points[i + 1]);
          if (k > maxSeedCurvature) {
            maxSeedCurvature = k;
            apexSeed = i;
          }
        }
        const speedBias = clamp((initialSpeed - 130) / 120, -0.35, 0.6);
        const brakeBias = clamp((8 - brakePower) / 8, -0.45, 0.65);
        const accelBias = clamp((accelPower - 5) / 5, -0.45, 0.55);
        const gripBias = clamp((1.2 - muEff) / 1.2, -0.55, 0.65);
        const aeroBias = clamp((0.005 - downforce) / 0.005, -0.45, 0.45);
        const apexShift = clamp(
          0.14 * speedBias +
            0.2 * brakeBias +
            0.16 * accelBias +
            0.16 * gripBias +
            0.08 * aeroBias,
          -0.3,
          0.4,
        );
        const apexPosition = clamp(apexSeed + apexShift, 1, points.length - 2);
        const inwardStrength = clamp(
          5 + 6 * (1 - Math.min(muEff / 1.4, 1.2)) + 3 * Math.max(speedBias, 0),
          2.5,
          10,
        );
        const tangentStrength = clamp(3.5 * apexShift, -2.5, 3.5);
        for (let i = 1; i < optimized.length - 1; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const next = points[i + 1];
          const tx = next.x - prev.x;
          const ty = next.y - prev.y;
          const len = Math.hypot(tx, ty) || 1;
          const tangentX = tx / len;
          const tangentY = ty / len;
          const cross =
            (curr.x - prev.x) * (next.y - curr.y) -
            (curr.y - prev.y) * (next.x - curr.x);
          const normalX = cross >= 0 ? -tangentY : tangentY;
          const normalY = cross >= 0 ? tangentX : -tangentX;
          const distFromApex = i - apexPosition;
          const coreWeight = Math.exp(-(distFromApex * distFromApex) / 1.0);
          const entryWeight =
            i < apexPosition
              ? Math.exp(-(distFromApex * distFromApex) / 2.7)
              : 0;
          const exitWeight =
            i > apexPosition
              ? Math.exp(-(distFromApex * distFromApex) / 2.7)
              : 0;
          const inwardOffset = inwardStrength * coreWeight;
          const alongOffset = tangentStrength * coreWeight;
          const widenOffset =
            3.2 *
            (entryWeight + exitWeight) *
            (0.55 + Math.max(accelBias, 0) * 0.45);
          optimized[i] = {
            x:
              curr.x +
              normalX * inwardOffset -
              normalX * widenOffset +
              tangentX * alongOffset,
            y:
              curr.y +
              normalY * inwardOffset -
              normalY * widenOffset +
              tangentY * alongOffset,
          };
        }
        const smoothed = optimized.map((p) => ({ x: p.x, y: p.y }));
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 1; i < smoothed.length - 1; i++) {
            smoothed[i] = {
              x:
                0.2 * optimized[i - 1].x +
                0.6 * optimized[i].x +
                0.2 * optimized[i + 1].x,
              y:
                0.2 * optimized[i - 1].y +
                0.6 * optimized[i].y +
                0.2 * optimized[i + 1].y,
            };
          }
          for (let i = 1; i < smoothed.length - 1; i++)
            optimized[i] = { x: smoothed[i].x, y: smoothed[i].y };
        }
        optimized[0] = { x: points[0].x, y: points[0].y };
        optimized[optimized.length - 1] = {
          x: points[points.length - 1].x,
          y: points[points.length - 1].y,
        };
        return optimized;
      }

      function curvature(a, b, c) {
        const dx1 = b.x - a.x;
        const dy1 = b.y - a.y;
        const dx2 = c.x - b.x;
        const dy2 = c.y - b.y;
        const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
        const denom = Math.pow(dx1 * dx1 + dy1 * dy1, 1.5);
        return denom === 0 ? 0 : cross / denom;
      }

      function lateralSpeedLimit(k) {
        const muEff = getEffectiveMu();
        const g = 9.81;
        const m = Number(massSlider.value);
        const C = Number(downforceSlider.value);
        if (k < 1e-6) return Number(initialSpeedSlider.value);
        const denom = m * k - muEff * C;
        if (denom <= 0) return Number(initialSpeedSlider.value);
        return Math.sqrt((muEff * m * g) / denom);
      }

      function analyzePath(updateStatus = true) {
        const path = getPath();
        if (path.length < 3) {
          speedProfile = [];
          segmentTypes = [];
          apexPoint = null;
          minSpeed = null;
          redraw();
          return;
        }
        const initialSpeed = Number(initialSpeedSlider.value);
        const brakePower = Number(brakePowerSlider.value);
        const accelPower = Number(accelPowerSlider.value);
        const limitProfile = path.map((p, i) => {
          if (i === 0 || i === path.length - 1) return initialSpeed;
          const k = curvature(path[i - 1], path[i], path[i + 1]);
          return lateralSpeedLimit(k);
        });
        speedProfile = new Array(path.length).fill(initialSpeed);
        speedProfile[0] = Math.min(initialSpeed, limitProfile[0]);
        for (let i = 1; i < path.length; i++) {
          const prev = speedProfile[i - 1];
          const possible = Math.max(0, prev - brakePower);
          speedProfile[i] = Math.min(
            limitProfile[i],
            prev,
            Math.max(limitProfile[i], possible),
          );
        }
        for (let i = path.length - 2; i >= 0; i--) {
          const next = speedProfile[i + 1];
          const possibleNext = next + brakePower;
          speedProfile[i] = Math.min(
            speedProfile[i],
            possibleNext,
            limitProfile[i],
          );
        }
        speedProfile[0] = Math.min(speedProfile[0], initialSpeed);
        for (let i = 1; i < path.length; i++)
          speedProfile[i] = Math.min(
            limitProfile[i],
            speedProfile[i - 1] + accelPower,
          );
        minSpeed = Infinity;
        let apexIndex = -1;
        for (let i = 1; i < speedProfile.length - 1; i++) {
          if (speedProfile[i] < minSpeed) {
            minSpeed = speedProfile[i];
            apexIndex = i;
          }
        }
        apexPoint = apexIndex >= 0 ? path[apexIndex] : null;
        segmentTypes = [];
        for (let i = 0; i < path.length - 1; i++) {
          const dv = speedProfile[i + 1] - speedProfile[i];
          if (dv > 0.3) segmentTypes.push("accelerate");
          else if (dv < -0.3) segmentTypes.push("brake");
          else segmentTypes.push("maintain");
        }
        redraw();
        if (updateStatus) {
          if (apexPoint)
            setStatus(
              `?ㅼ떆媛?諛섏쁺 ?꾨즺. Apex: (${apexPoint.x.toFixed(1)}, ${apexPoint.y.toFixed(1)}), ?ㅽ슚 關: ${getEffectiveMu().toFixed(2)}`,
            );
          else setStatus("?ㅼ떆媛?諛섏쁺 ?꾨즺.");
        }
      }

      function stopAnimation() {
        isPlaying = false;
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }

      function animateCar() {
        const path = getPath();
        if (
          !isPlaying ||
          path.length < 2 ||
          speedProfile.length !== path.length
        ) {
          stopAnimation();
          redraw();
          return;
        }
        if (carIndex >= path.length - 1) {
          stopAnimation();
          redraw();
          setStatus("二쇳뻾 ?좊땲硫붿씠?섏씠 ?앸궗??");
          return;
        }
        const currentSpeed = Math.max(
          1,
          speedProfile[Math.min(carIndex, speedProfile.length - 1)],
        );
        const normalized = clamp(currentSpeed / 200, 0.15, 1.0);
        const stepSize = 0.05 + normalized * 0.14;
        carSubstep += stepSize;
        while (carSubstep >= 1 && carIndex < path.length - 1) {
          carSubstep -= 1;
          carIndex += 1;
        }
        redraw();
        animationFrameId = requestAnimationFrame(animateCar);
      }

      function autoDetectCorners() {
        if (!window.cvReady || typeof cv === "undefined") {
          setStatus("OpenCV.js媛 ?꾩쭅 以鍮꾨릺吏 ?딆븯?? ?좎떆 ???ㅼ떆 ?뚮윭以?");
          return;
        }
        if (!originalImage) {
          setStatus("癒쇱? ?대?吏瑜??낅줈?쒗빐以?");
          return;
        }
        detectedCornerPoints = [];

        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const inv = new cv.Mat();
        const bin = new cv.Mat();
        let contourMask = null;
        let contourRoi = null;
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        try {
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
          cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0);
          cv.threshold(
            blurred,
            inv,
            0,
            255,
            cv.THRESH_BINARY_INV + cv.THRESH_OTSU,
          );

          const kernel = cv.getStructuringElement(
            cv.MORPH_RECT,
            new cv.Size(5, 5),
          );
          cv.morphologyEx(inv, bin, cv.MORPH_CLOSE, kernel);
          cv.morphologyEx(bin, bin, cv.MORPH_OPEN, kernel);
          kernel.delete();

          cv.findContours(
            bin,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_NONE,
          );
          if (contours.size() === 0) {
            setStatus(
              "?먮룞 寃異쒖뿉???ㅺ낸??李얠? 紐삵뻽?? ???⑥닚???덉씠?꾩썐 ?대?吏瑜??⑤킄.",
            );
            return;
          }

          let bestIdx = -1;
          let bestScore = -Infinity;
          const imgArea = src.rows * src.cols;

          for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            if (area < imgArea * 0.002) continue;

            const rect = cv.boundingRect(contour);
            const perimeter = cv.arcLength(contour, true);
            if (perimeter <= 0) continue;

            const thicknessScore = area / perimeter;
            const boxArea = rect.width * rect.height;
            const fillRatio = boxArea > 0 ? area / boxArea : 0;
            const score = area * 1.0 + thicknessScore * 1200 + fillRatio * 5000;

            if (score > bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          }

          if (bestIdx === -1) {
            setStatus("湲?먮굹 ?묒? ?좊쭔 媛먯??쇱꽌 ?몃옓 ?꾨낫瑜?李얠? 紐삵뻽??");
            return;
          }

          const contour = contours.get(bestIdx);
          const rect = cv.boundingRect(contour);
          const padding = 14;
          const roiX = Math.max(0, rect.x - padding);
          const roiY = Math.max(0, rect.y - padding);
          const roiWidth = Math.min(src.cols - roiX, rect.width + padding * 2);
          const roiHeight = Math.min(src.rows - roiY, rect.height + padding * 2);

          contourMask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
          cv.drawContours(
            contourMask,
            contours,
            bestIdx,
            new cv.Scalar(255),
            cv.FILLED,
          );

          contourRoi = contourMask
            .roi(new cv.Rect(roiX, roiY, roiWidth, roiHeight))
            .clone();

          const centerlinePoints = extractCenterlineSamples(
            contourRoi,
            roiX,
            roiY,
          );

          if (centerlinePoints.length < 8) {
            setStatus("?醫뤾문????븍궦???餓λ쵐???袁⑤궖???곕뗄???롫뮉 ????쎈솭??됰선.");
            return;
          }

          detectedCornerPoints = centerlinePoints;
          redraw();
          setStatus(
            `揶쎛???대벀??????븍궦???餓λ쵐??醫롮뱽 獄쏅뗀???곗쨮 ?癒?짗 野꺜?? ${detectedCornerPoints.length}揶쏆뮇???癒?몵嚥? ?紐꾪뀱??됰선.`,
          );
          return;
          const raw = [];
          for (let i = 0; i < contour.data32S.length; i += 2) {
            raw.push({ x: contour.data32S[i], y: contour.data32S[i + 1] });
          }

          if (raw.length < 20) {
            setStatus("?좏깮???ㅺ낸???덈Т 吏㏃븘??肄붾꼫 ?꾨낫瑜?留뚮뱾吏 紐삵뻽??");
            return;
          }

          const sampleGap = Math.max(8, Math.floor(raw.length / 140));
          const candidates = [];
          for (let i = sampleGap; i < raw.length - sampleGap; i += sampleGap) {
            const a = raw[i - sampleGap];
            const b = raw[i];
            const c = raw[i + sampleGap];
            const k = curvature(a, b, c);
            candidates.push({ ...b, k });
          }

          candidates.sort((p, q) => q.k - p.k);
          const filtered = [];
          for (const p of candidates) {
            const tooNear = filtered.some((q) => {
              const dx = p.x - q.x;
              const dy = p.y - q.y;
              return dx * dx + dy * dy < 40 * 40;
            });
            if (!tooNear) filtered.push(p);
            if (filtered.length >= 6) break;
          }

          detectedCornerPoints = filtered.map((p) => ({ x: p.x, y: p.y }));
          redraw();
          setStatus(
            `媛??援듦퀬 ???ㅺ낸??湲곗??쇰줈 ?먮룞 肄붾꼫 ?꾨낫 ${detectedCornerPoints.length}媛쒕? ?쒖떆?덉뼱.`,
          );
        } catch (err) {
          setStatus("?먮룞 肄붾꼫 ?꾨낫 寃異?以??ㅻ쪟媛 諛쒖깮?덉뼱.");
        } finally {
          src.delete();
          gray.delete();
          blurred.delete();
          inv.delete();
          bin.delete();
          if (contourMask) contourMask.delete();
          if (contourRoi) contourRoi.delete();
          contours.delete();
          hierarchy.delete();
        }
      }

      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) {
          setStatus("?뚯씪???좏깮?댁쨾.");
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            lineCanvas.width = img.width;
            lineCanvas.height = img.height;
            resultCanvas.width = img.width;
            resultCanvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
            userPoints = [];
            smoothPath = [];
            optimizedPath = [];
            apexPoint = null;
            speedProfile = [];
            segmentTypes = [];
            detectedCornerPoints = [];
            minSpeed = null;
            carIndex = 0;
            carSubstep = 0;
            stopAnimation();
            redraw();
            setStatus("?대?吏 濡쒕뱶 ?꾨즺. 肄붾꼫 以묒떖???곕씪 ?먯쓣 李띿쑝?몄슂.");
          };
          img.onerror = () => setStatus("?대?吏 濡쒕뱶 ?ㅽ뙣");
          img.src = ev.target.result;
        };
        reader.onerror = () => setStatus("?뚯씪 ?쎄린 ?ㅽ뙣");
        reader.readAsDataURL(file);
      });

      autoDetectBtn.addEventListener("click", autoDetectCorners);
      clearDetectBtn.addEventListener("click", () => {
        detectedCornerPoints = [];
        redraw();
        setStatus("?먮룞 肄붾꼫 ?꾨낫瑜?吏?좎뼱.");
      });

      canvas.addEventListener("click", (e) => {
        if (!originalImage) {
          setStatus("癒쇱? ?대?吏瑜??낅줈?쒗빐以?");
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        userPoints.push({ x, y });
        smoothPath = [];
        optimizedPath = [];
        apexPoint = null;
        speedProfile = [];
        segmentTypes = [];
        minSpeed = null;
        carIndex = 0;
        carSubstep = 0;
        stopAnimation();
        redraw();
        setStatus(`??${userPoints.length}媛??낅젰??);
      });

      clearBtn.addEventListener("click", () => {
        userPoints = [];
        smoothPath = [];
        optimizedPath = [];
        apexPoint = null;
        speedProfile = [];
        segmentTypes = [];
        detectedCornerPoints = [];
        minSpeed = null;
        carIndex = 0;
        carSubstep = 0;
        stopAnimation();
        redraw();
        setStatus("?낅젰???먭낵 寃곌낵瑜?珥덇린?뷀뻽??");
      });

      undoBtn.addEventListener("click", () => {
        if (!userPoints.length) {
          setStatus("??젣???먯씠 ?놁뼱.");
          return;
        }
        userPoints.pop();
        smoothPath = [];
        optimizedPath = [];
        apexPoint = null;
        speedProfile = [];
        segmentTypes = [];
        minSpeed = null;
        carIndex = 0;
        carSubstep = 0;
        stopAnimation();
        redraw();
        setStatus(`留덉?留?????젣 ?꾨즺. ?⑥? ??${userPoints.length}媛?);
      });

      lineBtn.addEventListener("click", () => {
        if (userPoints.length < 3) {
          setStatus("二쇳뻾?좎쓣 留뚮뱾?ㅻ㈃ ?먯쓣 3媛??댁긽 李띿뼱????");
          return;
        }
        smoothPath = catmullRomSpline(userPoints, 30);
        const optimizedControls = buildOptimizedControlPoints(userPoints);
        optimizedPath = catmullRomSpline(optimizedControls, 30);
        carIndex = 0;
        carSubstep = 0;
        stopAnimation();
        analyzePath(false);
        setStatus("湲곕낯 二쇳뻾?좎쓣 ?앹꽦?덇퀬 蹂??蹂?붾뒗 ?ㅼ떆媛꾩쑝濡?諛섏쁺??");
      });

      apexBtn.addEventListener("click", () => {
        const path = getPath();
        if (path.length < 3) {
          setStatus("癒쇱? 二쇳뻾?좎쓣 ?앹꽦?댁쨾.");
          return;
        }
        analyzePath(true);
        if (apexPoint)
          setStatus(
            `Apex ?뺤씤 ?꾨즺: (${apexPoint.x.toFixed(1)}, ${apexPoint.y.toFixed(1)})`,
          );
        else setStatus("Apex瑜?李얠? 紐삵뻽??");
      });

      playBtn.addEventListener("click", () => {
        const path = getPath();
        if (path.length < 2 || speedProfile.length !== path.length) {
          setStatus("癒쇱? 二쇳뻾?좎쓣 ?앹꽦?섍퀬 遺꾩꽍?댁쨾.");
          return;
        }
        stopAnimation();
        isPlaying = true;
        animateCar();
        setStatus("李⑤웾??二쇳뻾?좎쓣 ?곕씪 ?대룞 以묒씠??");
      });

      pauseBtn.addEventListener("click", () => {
        stopAnimation();
        redraw();
        setStatus("二쇳뻾 ?좊땲硫붿씠?섏쓣 硫덉톬??");
      });

      resetCarBtn.addEventListener("click", () => {
        stopAnimation();
        carIndex = 0;
        carSubstep = 0;
        redraw();
        setStatus("李⑤웾 ?꾩튂瑜??쒖옉?먯쑝濡??섎룎?몄뼱.");
      });

      function testCurvature() {
        const k = curvature({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 });
        console.assert(k > 0, "怨〓쪧 ?뚯뒪???ㅽ뙣");
      }
      function testLinearInterpolation() {
        const pts = linearInterpolate({ x: 0, y: 0 }, { x: 10, y: 0 }, 5);
        console.assert(pts.length === 6, "?좏삎蹂닿컙 ?뚯뒪???ㅽ뙣");
      }
      function testSpline() {
        const pts = catmullRomSpline(
          [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 20, y: 0 },
          ],
          10,
        );
        console.assert(pts.length > 10, "?ㅽ뵆?쇱씤 ?뚯뒪???ㅽ뙣");
      }
      function testEffectiveMu() {
        muSlider.value = "1.20";
        tireStateSelect.value = "0.92";
        surfaceStateSelect.value = "0.82";
        console.assert(
          Math.abs(getEffectiveMu() - 0.90528) < 1e-6,
          "?ㅽ슚 留덉같怨꾩닔 ?뚯뒪???ㅽ뙣",
        );
        tireStateSelect.value = "1.00";
        surfaceStateSelect.value = "1.00";
      }
      function testOptimizedPathExists() {
        const pts = [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 20, y: 0 },
          { x: 30, y: 5 },
        ];
        const out = buildOptimizedControlPoints(pts);
        console.assert(out.length === pts.length, "理쒖쟻???쒖뼱???뚯뒪???ㅽ뙣");
      }
      testCurvature();
      testLinearInterpolation();
      testSpline();
      testEffectiveMu();
      testOptimizedPathExists();
    