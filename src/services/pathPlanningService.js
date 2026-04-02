import {
  catmullRomSpline,
  clamp,
  clonePoints,
  curvature,
  polylineLength,
  resamplePolyline,
  smoothPolyline,
} from "../utils/geometry.js";

export class PathPlanningService {
  createControlPointsFromDetectedTrack(trackPoints) {
    // Return all detected track points directly so they perfectly match the detection density
    return clonePoints(trackPoints);
  }

  buildPaths(controlPoints, vehicleConfig, { density = 40 } = {}) {
    if (controlPoints.length < 2) {
      return {
        smoothPath: clonePoints(controlPoints),
        optimizedPath: [],
      };
    }

    // density slider: low value = dense (many points), high value = sparse
    const samplesPerSeg = clamp(Math.round(120 / Math.max(density, 5)), 10, 80);

    const smoothPath = catmullRomSpline(controlPoints, samplesPerSeg);
    const optimizedControls = this.buildOptimizedControlPoints(
      controlPoints,
      vehicleConfig,
    );
    const optimizedPath = catmullRomSpline(optimizedControls, samplesPerSeg);

    return { smoothPath, optimizedPath };
  }

  buildOptimizedControlPoints(points, vehicleConfig) {
    if (points.length < 3) return clonePoints(points);

    const optimized = clonePoints(points);

    let apexSeed = 1;
    let maxCurvature = -1;

    for (let index = 1; index < points.length - 1; index += 1) {
      const candidateCurvature = curvature(
        points[index - 1],
        points[index],
        points[index + 1],
      );

      if (candidateCurvature > maxCurvature) {
        maxCurvature = candidateCurvature;
        apexSeed = index;
      }
    }

    const speedBias = clamp(
      (vehicleConfig.initialSpeed - 130) / 120,
      -0.35,
      0.6,
    );
    const brakeBias = clamp((8 - vehicleConfig.brakePower) / 8, -0.45, 0.65);
    const accelBias = clamp((vehicleConfig.accelPower - 5) / 5, -0.45, 0.55);
    const gripBias = clamp(
      (1.2 - vehicleConfig.effectiveMu) / 1.2,
      -0.55,
      0.65,
    );
    const aeroBias = clamp(
      (0.005 - vehicleConfig.downforce) / 0.005,
      -0.45,
      0.45,
    );

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
      5 +
        6 * (1 - Math.min(vehicleConfig.effectiveMu / 1.4, 1.2)) +
        3 * Math.max(speedBias, 0),
      2.5,
      10,
    );
    const tangentStrength = clamp(3.5 * apexShift, -2.5, 3.5);

    for (let index = 1; index < optimized.length - 1; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const next = points[index + 1];

      const tangent = {
        x: next.x - previous.x,
        y: next.y - previous.y,
      };
      const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
      const tangentX = tangent.x / tangentLength;
      const tangentY = tangent.y / tangentLength;

      const cross =
        (current.x - previous.x) * (next.y - current.y) -
        (current.y - previous.y) * (next.x - current.x);

      const normalX = cross >= 0 ? -tangentY : tangentY;
      const normalY = cross >= 0 ? tangentX : -tangentX;
      const distanceFromApex = index - apexPosition;
      const coreWeight = Math.exp(
        -(distanceFromApex * distanceFromApex) / 1.0,
      );
      const entryWeight =
        index < apexPosition
          ? Math.exp(-(distanceFromApex * distanceFromApex) / 2.7)
          : 0;
      const exitWeight =
        index > apexPosition
          ? Math.exp(-(distanceFromApex * distanceFromApex) / 2.7)
          : 0;
      const inwardOffset = inwardStrength * coreWeight;
      const alongOffset = tangentStrength * coreWeight;
      const widenOffset =
        3.2 *
        (entryWeight + exitWeight) *
        (0.55 + Math.max(accelBias, 0) * 0.45);

      optimized[index] = {
        x:
          current.x +
          normalX * inwardOffset -
          normalX * widenOffset +
          tangentX * alongOffset,
        y:
          current.y +
          normalY * inwardOffset -
          normalY * widenOffset +
          tangentY * alongOffset,
      };
    }

    let smoothed = clonePoints(optimized);

    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = 1; index < smoothed.length - 1; index += 1) {
        smoothed[index] = {
          x:
            0.2 * optimized[index - 1].x +
            0.6 * optimized[index].x +
            0.2 * optimized[index + 1].x,
          y:
            0.2 * optimized[index - 1].y +
            0.6 * optimized[index].y +
            0.2 * optimized[index + 1].y,
        };
      }

      for (let index = 1; index < smoothed.length - 1; index += 1) {
        optimized[index] = { ...smoothed[index] };
      }
    }

    optimized[0] = { ...points[0] };
    optimized[optimized.length - 1] = { ...points[points.length - 1] };

    return optimized;
  }
}
