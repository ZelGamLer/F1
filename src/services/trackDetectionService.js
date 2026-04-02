import {
  clamp,
  distance,
  polylineLength,
  resamplePolyline,
  smoothPolyline,
} from "../utils/geometry.js";

const NEIGHBOR_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export class TrackDetectionService {
  isReady() {
    return Boolean(globalThis.cvReady && globalThis.cv);
  }

  detect(sourceCanvas) {
    if (!this.isReady()) {
      throw new Error("OpenCV.js가 아직 준비되지 않았습니다.");
    }

    const cv = globalThis.cv;
    const src = cv.imread(sourceCanvas);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const binaryInverse = new cv.Mat();
    const binary = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    let filledMask = null;
    let maskRoi = null;

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0);
      cv.threshold(
        blurred,
        binaryInverse,
        0,
        255,
        cv.THRESH_BINARY_INV + cv.THRESH_OTSU,
      );

      const kernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(5, 5),
      );
      cv.morphologyEx(binaryInverse, binary, cv.MORPH_CLOSE, kernel);
      cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel);
      kernel.delete();

      cv.findContours(
        binary,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_NONE,
      );

      if (contours.size() === 0) {
        throw new Error("트랙처럼 보이는 굵은 선을 찾지 못했습니다.");
      }

      const bestContourIndex = this.findBestContourIndex(contours, src);

      if (bestContourIndex === -1) {
        throw new Error("가장 굵은 트랙 윤곽을 고르지 못했습니다.");
      }

      const contour = contours.get(bestContourIndex);
      const rect = cv.boundingRect(contour);
      const padding = 14;
      const roiX = Math.max(0, rect.x - padding);
      const roiY = Math.max(0, rect.y - padding);
      const roiWidth = Math.min(src.cols - roiX, rect.width + padding * 2);
      const roiHeight = Math.min(src.rows - roiY, rect.height + padding * 2);

      filledMask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
      cv.drawContours(
        filledMask,
        contours,
        bestContourIndex,
        new cv.Scalar(255),
        -1,
      );

      maskRoi = filledMask
        .roi(new cv.Rect(roiX, roiY, roiWidth, roiHeight))
        .clone();

      const trackPoints = this.extractCenterline(maskRoi, roiX, roiY);

      if (trackPoints.length < 8) {
        throw new Error("중심선을 충분한 길이로 추출하지 못했습니다.");
      }

      return { trackPoints };
    } finally {
      src.delete();
      gray.delete();
      blurred.delete();
      binaryInverse.delete();
      binary.delete();
      contours.delete();
      hierarchy.delete();
      if (filledMask) filledMask.delete();
      if (maskRoi) maskRoi.delete();
    }
  }

  findBestContourIndex(contours, src) {
    const cv = globalThis.cv;
    const imageArea = src.rows * src.cols;
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const area = cv.contourArea(contour);
      if (area < imageArea * 0.002) continue;

      const rect = cv.boundingRect(contour);
      const perimeter = cv.arcLength(contour, true);
      if (perimeter <= 0) continue;

      const thicknessScore = area / perimeter;
      const fillRatio = rect.width * rect.height > 0 ? area / (rect.width * rect.height) : 0;
      const score = area + thicknessScore * 1200 + fillRatio * 5000;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  extractCenterline(mask, offsetX, offsetY) {
    const skeleton = this.skeletonizeBinary(mask);

    try {
      let pixels = this.collectSkeletonPixels(skeleton, offsetX, offsetY);
      if (pixels.length < 2) return [];

      let graph = this.buildNeighborGraph(pixels);
      ({ points: pixels, graph } = this.pruneShortBranches(pixels, graph));

      const orderedPath =
        this.hasEndpoints(graph)
          ? this.extractLongestOpenPath(pixels, graph)
          : this.traceLoopPath(pixels, graph);

      if (orderedPath.length < 2) return [];

      const smoothed = smoothPolyline(orderedPath, 2, 2);
      const totalLength = polylineLength(smoothed);
      const sampleCount = clamp(Math.round(totalLength / 14), 28, 160);

      return resamplePolyline(smoothed, sampleCount);
    } finally {
      skeleton.delete();
    }
  }

  skeletonizeBinary(mask) {
    const cv = globalThis.cv;
    const working = mask.clone();
    const skeleton = cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);
    const eroded = new cv.Mat();
    const opened = new cv.Mat();
    const residue = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_CROSS, new cv.Size(3, 3));

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

  collectSkeletonPixels(skeleton, offsetX, offsetY) {
    const pixels = [];

    for (let y = 0; y < skeleton.rows; y += 1) {
      for (let x = 0; x < skeleton.cols; x += 1) {
        if (skeleton.ucharPtr(y, x)[0] > 0) {
          pixels.push({ x: x + offsetX, y: y + offsetY });
        }
      }
    }

    return pixels;
  }

  buildNeighborGraph(points) {
    const pointIndexByKey = new Map();
    points.forEach((point, index) => {
      pointIndexByKey.set(`${point.x},${point.y}`, index);
    });

    return points.map((point) => {
      const neighbors = [];

      for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        const neighborIndex = pointIndexByKey.get(`${point.x + dx},${point.y + dy}`);
        if (neighborIndex !== undefined) neighbors.push(neighborIndex);
      }

      return neighbors;
    });
  }

  pruneShortBranches(points, graph, maxBranchLength = 20) {
    const removed = new Set();
    let changed = true;

    const getActiveNeighbors = (index) =>
      graph[index].filter((neighborIndex) => !removed.has(neighborIndex));

    while (changed) {
      changed = false;

      for (let startIndex = 0; startIndex < points.length; startIndex += 1) {
        if (removed.has(startIndex)) continue;
        if (getActiveNeighbors(startIndex).length !== 1) continue;

        const branch = [startIndex];
        let branchLength = 0;
        let previousIndex = -1;
        let currentIndex = startIndex;
        let reachedJunction = false;

        while (true) {
          const options = getActiveNeighbors(currentIndex).filter(
            (neighborIndex) => neighborIndex !== previousIndex,
          );

          if (options.length === 0) break;

          const nextIndex = options[0];
          branchLength += distance(points[currentIndex], points[nextIndex]);
          branch.push(nextIndex);
          previousIndex = currentIndex;
          currentIndex = nextIndex;

          const degree = getActiveNeighbors(currentIndex).length;

          if (degree === 1) {
            reachedJunction = false;
            break;
          }

          if (degree > 2) {
            reachedJunction = true;
            break;
          }
        }

        if (reachedJunction && branchLength <= maxBranchLength) {
          for (const branchIndex of branch.slice(0, -1)) {
            removed.add(branchIndex);
          }
          changed = true;
        }
      }
    }

    const activePoints = [];
    const remappedIndexes = new Map();

    points.forEach((point, index) => {
      if (removed.has(index)) return;
      remappedIndexes.set(index, activePoints.length);
      activePoints.push(point);
    });

    const activeGraph = activePoints.map(() => []);

    graph.forEach((neighbors, originalIndex) => {
      if (removed.has(originalIndex)) return;

      const mappedIndex = remappedIndexes.get(originalIndex);
      activeGraph[mappedIndex] = neighbors
        .filter((neighborIndex) => !removed.has(neighborIndex))
        .map((neighborIndex) => remappedIndexes.get(neighborIndex));
    });

    return {
      points: activePoints,
      graph: activeGraph,
    };
  }

  hasEndpoints(graph) {
    return graph.some((neighbors) => neighbors.length === 1);
  }

  extractLongestOpenPath(points, graph) {
    const startIndex = graph.findIndex((neighbors) => neighbors.length === 1);
    if (startIndex === -1) return [];

    const firstPass = this.findFarthestNode(startIndex, graph);
    const secondPass = this.findFarthestNode(firstPass.index, graph);
    const orderedIndexes = [];

    let cursor = secondPass.index;
    while (cursor !== -1) {
      orderedIndexes.push(cursor);
      if (cursor === firstPass.index) break;
      cursor = secondPass.parent[cursor];
    }

    orderedIndexes.reverse();
    return orderedIndexes.map((index) => points[index]);
  }

  findFarthestNode(startIndex, graph) {
    const queue = new Int32Array(graph.length);
    const visited = new Int8Array(graph.length);
    const parent = new Int32Array(graph.length);
    parent.fill(-1);

    let head = 0;
    let tail = 0;
    let farthestIndex = startIndex;

    queue[tail] = startIndex;
    tail += 1;
    visited[startIndex] = 1;

    while (head < tail) {
      const currentIndex = queue[head];
      head += 1;
      farthestIndex = currentIndex;

      for (const neighborIndex of graph[currentIndex]) {
        if (visited[neighborIndex]) continue;
        visited[neighborIndex] = 1;
        parent[neighborIndex] = currentIndex;
        queue[tail] = neighborIndex;
        tail += 1;
      }
    }

    return { index: farthestIndex, parent };
  }

  traceLoopPath(points, graph) {
    if (!points.length) return [];

    let startIndex = 0;

    for (let index = 1; index < points.length; index += 1) {
      if (
        points[index].x < points[startIndex].x ||
        (points[index].x === points[startIndex].x &&
          points[index].y < points[startIndex].y)
      ) {
        startIndex = index;
      }
    }

    const orderedIndexes = [startIndex];
    const visitedEdges = new Set();
    let previousIndex = -1;
    let currentIndex = startIndex;

    while (true) {
      const candidates = graph[currentIndex].filter(
        (neighborIndex) =>
          !visitedEdges.has(this.getEdgeKey(currentIndex, neighborIndex)),
      );

      if (!candidates.length) break;

      const nextIndex = this.chooseBestNextIndex(
        points,
        previousIndex,
        currentIndex,
        candidates,
      );

      visitedEdges.add(this.getEdgeKey(currentIndex, nextIndex));

      if (nextIndex === startIndex) break;

      orderedIndexes.push(nextIndex);
      previousIndex = currentIndex;
      currentIndex = nextIndex;

      if (orderedIndexes.length > points.length + 1) break;
    }

    return orderedIndexes.map((index) => points[index]);
  }

  chooseBestNextIndex(points, previousIndex, currentIndex, candidates) {
    if (candidates.length === 1) return candidates[0];

    if (previousIndex === -1) {
      return [...candidates].sort((leftIndex, rightIndex) => {
        const left = points[leftIndex];
        const right = points[rightIndex];
        if (left.y !== right.y) return left.y - right.y;
        return left.x - right.x;
      })[0];
    }

    const currentPoint = points[currentIndex];
    const previousPoint = points[previousIndex];
    const inputVector = {
      x: currentPoint.x - previousPoint.x,
      y: currentPoint.y - previousPoint.y,
    };
    const inputLength = Math.hypot(inputVector.x, inputVector.y) || 1;

    let bestIndex = candidates[0];
    let bestScore = -Infinity;

    for (const candidateIndex of candidates) {
      const candidatePoint = points[candidateIndex];
      const outputVector = {
        x: candidatePoint.x - currentPoint.x,
        y: candidatePoint.y - currentPoint.y,
      };
      const outputLength = Math.hypot(outputVector.x, outputVector.y) || 1;
      const score =
        (inputVector.x * outputVector.x + inputVector.y * outputVector.y) /
        (inputLength * outputLength);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = candidateIndex;
      }
    }

    return bestIndex;
  }

  getEdgeKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }
}
