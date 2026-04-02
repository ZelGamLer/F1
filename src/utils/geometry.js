export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clonePoint(point) {
  return { x: point.x, y: point.y };
}

export function clonePoints(points) {
  return points.map(clonePoint);
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

export function linearInterpolate(start, end, samples) {
  const output = [];

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    output.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    });
  }

  return output;
}

export function catmullRomSpline(points, samplesPerSegment = 25) {
  if (points.length < 2) return clonePoints(points);
  if (points.length === 2) {
    return linearInterpolate(points[0], points[1], samplesPerSegment);
  }

  const result = [];

  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const p0 = points[Math.max(0, segmentIndex - 1)];
    const p1 = points[segmentIndex];
    const p2 = points[segmentIndex + 1];
    const p3 = points[Math.min(points.length - 1, segmentIndex + 2)];

    for (let sampleIndex = 0; sampleIndex < samplesPerSegment; sampleIndex += 1) {
      const t = sampleIndex / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      result.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }

  result.push(clonePoint(points[points.length - 1]));
  return result;
}

export function smoothPolyline(points, radius = 2, passes = 2) {
  if (points.length < 3) return clonePoints(points);

  let current = clonePoints(points);

  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((point, index) => {
      if (index === 0 || index === current.length - 1) return clonePoint(point);

      const start = Math.max(0, index - radius);
      const end = Math.min(current.length - 1, index + radius);

      let sumX = 0;
      let sumY = 0;
      let count = 0;

      for (let cursor = start; cursor <= end; cursor += 1) {
        sumX += current[cursor].x;
        sumY += current[cursor].y;
        count += 1;
      }

      return {
        x: sumX / count,
        y: sumY / count,
      };
    });
  }

  return current;
}

export function resamplePolyline(points, sampleCount) {
  if (points.length <= sampleCount) return clonePoints(points);
  if (points.length < 2 || sampleCount < 2) return clonePoints(points);

  const cumulativeDistances = [0];

  for (let index = 1; index < points.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + distance(points[index - 1], points[index]),
    );
  }

  const totalLength = cumulativeDistances[cumulativeDistances.length - 1];
  if (totalLength === 0) return clonePoints(points.slice(0, sampleCount));

  const sampled = [clonePoint(points[0])];
  let distanceCursor = 1;

  for (let sampleIndex = 1; sampleIndex < sampleCount - 1; sampleIndex += 1) {
    const targetDistance = (totalLength * sampleIndex) / (sampleCount - 1);

    while (
      distanceCursor < cumulativeDistances.length - 1 &&
      cumulativeDistances[distanceCursor] < targetDistance
    ) {
      distanceCursor += 1;
    }

    const previousDistance = cumulativeDistances[distanceCursor - 1];
    const nextDistance = cumulativeDistances[distanceCursor];
    const span = nextDistance - previousDistance || 1;
    const t = (targetDistance - previousDistance) / span;
    const a = points[distanceCursor - 1];
    const b = points[distanceCursor];

    sampled.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
  }

  sampled.push(clonePoint(points[points.length - 1]));
  return sampled;
}

export function curvature(a, b, c) {
  const dx1 = b.x - a.x;
  const dy1 = b.y - a.y;
  const dx2 = c.x - b.x;
  const dy2 = c.y - b.y;
  const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
  const denominator = Math.pow(dx1 * dx1 + dy1 * dy1, 1.5);

  return denominator === 0 ? 0 : cross / denominator;
}
