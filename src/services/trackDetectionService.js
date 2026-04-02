import {
  clamp,
  distance,
  polylineLength,
  resamplePolyline,
  smoothPolyline,
} from "../utils/geometry.js";

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
    const binaryInverse = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      // Adaptive threshold handles varying brightness, shadows, and anti-aliasing perfectly
      cv.adaptiveThreshold(
        gray,
        binaryInverse,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        31,
        15
      );

      // Clean up thin lines, texts, and granular noise
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
      cv.morphologyEx(binaryInverse, binaryInverse, cv.MORPH_CLOSE, kernel);
      cv.morphologyEx(binaryInverse, binaryInverse, cv.MORPH_OPEN, kernel);
      kernel.delete();

      // RETR_EXTERNAL extracts ONLY the outermost boundary. It will cleanly outline the entire track.
      cv.findContours(
        binaryInverse,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_NONE
      );

      if (contours.size() === 0) {
        throw new Error("트랙처럼 보이는 선을 찾지 못했습니다. 이미지를 확인해주세요.");
      }

      const bestContourIndex = this.findBestContourIndex(contours, src);

      if (bestContourIndex === -1) {
        throw new Error("주요 트랙 윤곽을 추출할 수 없습니다.");
      }

      // Extract raw points from the thickest/largest contour directly
      const contour = contours.get(bestContourIndex);
      const rawPoints = [];
      for (let i = 0; i < contour.rows; i++) {
        rawPoints.push({
          x: contour.data32S[i * 2],
          y: contour.data32S[i * 2 + 1]
        });
      }

      if (rawPoints.length < 10) {
        throw new Error("추출된 윤곽선이 너무 짧습니다.");
      }

      // Smooth and resample the contour points heavily to keep it clean and editable
      const smoothed = smoothPolyline(rawPoints, 4, 3);
      const totalLength = polylineLength(smoothed);
      const sampleCount = clamp(Math.round(totalLength / 45), 15, 60); 

      const trackPoints = resamplePolyline(smoothed, sampleCount);

      return { trackPoints };
    } finally {
      src.delete();
      gray.delete();
      binaryInverse.delete();
      contours.delete();
      hierarchy.delete();
    }
  }

  findBestContourIndex(contours, src) {
    const cv = globalThis.cv;
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const rect = cv.boundingRect(contour);
      
      // The track is the largest structure crossing the image, so span is a perfect metric
      const spanScore = rect.width + rect.height;
      if (spanScore < (src.cols + src.rows) * 0.15) continue; 
      
      const area = cv.contourArea(contour);
      const score = area + spanScore * 5000;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    return bestIndex;
  }
}
