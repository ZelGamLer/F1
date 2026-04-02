import { curvature } from "../utils/geometry.js";

export class PathAnalysisService {
  analyze(path, vehicleConfig) {
    if (path.length < 3) {
      return {
        speedProfile: [],
        segmentTypes: [],
        apexPoint: null,
        minSpeed: null,
      };
    }

    const limitProfile = path.map((point, index) => {
      if (index === 0 || index === path.length - 1) {
        return vehicleConfig.initialSpeed;
      }

      return this.getLateralSpeedLimit(
        curvature(path[index - 1], point, path[index + 1]),
        vehicleConfig,
      );
    });

    const speedProfile = new Array(path.length).fill(vehicleConfig.initialSpeed);
    speedProfile[0] = Math.min(vehicleConfig.initialSpeed, limitProfile[0]);

    for (let index = 1; index < path.length; index += 1) {
      const previousSpeed = speedProfile[index - 1];
      const possibleSpeed = Math.max(0, previousSpeed - vehicleConfig.brakePower);

      speedProfile[index] = Math.min(
        limitProfile[index],
        previousSpeed,
        Math.max(limitProfile[index], possibleSpeed),
      );
    }

    for (let index = path.length - 2; index >= 0; index -= 1) {
      const nextSpeed = speedProfile[index + 1];
      const possibleSpeed = nextSpeed + vehicleConfig.brakePower;

      speedProfile[index] = Math.min(
        speedProfile[index],
        possibleSpeed,
        limitProfile[index],
      );
    }

    speedProfile[0] = Math.min(speedProfile[0], vehicleConfig.initialSpeed);

    for (let index = 1; index < path.length; index += 1) {
      speedProfile[index] = Math.min(
        limitProfile[index],
        speedProfile[index - 1] + vehicleConfig.accelPower,
      );
    }

    let minSpeed = Infinity;
    let apexIndex = -1;

    for (let index = 1; index < speedProfile.length - 1; index += 1) {
      if (speedProfile[index] < minSpeed) {
        minSpeed = speedProfile[index];
        apexIndex = index;
      }
    }

    const segmentTypes = [];

    for (let index = 0; index < path.length - 1; index += 1) {
      const delta = speedProfile[index + 1] - speedProfile[index];

      if (delta > 0.3) segmentTypes.push("accelerate");
      else if (delta < -0.3) segmentTypes.push("brake");
      else segmentTypes.push("maintain");
    }

    return {
      speedProfile,
      segmentTypes,
      apexPoint: apexIndex >= 0 ? path[apexIndex] : null,
      minSpeed: Number.isFinite(minSpeed) ? minSpeed : null,
    };
  }

  getLateralSpeedLimit(curvatureValue, vehicleConfig) {
    if (curvatureValue < 1e-6) return vehicleConfig.initialSpeed;

    const denominator =
      vehicleConfig.mass * curvatureValue -
      vehicleConfig.effectiveMu * vehicleConfig.downforce;

    if (denominator <= 0) return vehicleConfig.initialSpeed;

    return Math.sqrt(
      (vehicleConfig.effectiveMu * vehicleConfig.mass * 9.81) / denominator,
    );
  }
}
