export class CanvasRenderer {
  constructor({ canvas, lineCanvas, resultCanvas }) {
    this.canvas = canvas;
    this.lineCanvas = lineCanvas;
    this.resultCanvas = resultCanvas;
    this.mainContext = canvas.getContext("2d");
    this.lineContext = lineCanvas.getContext("2d");
    this.resultContext = resultCanvas.getContext("2d");
  }

  resize(width, height) {
    for (const target of [this.canvas, this.lineCanvas, this.resultCanvas]) {
      target.width = width;
      target.height = height;
    }
  }

  render(state) {
    this.drawMainCanvas(state);
    this.drawLineCanvas(state);
    this.drawResultCanvas(state);
  }

  drawMainCanvas(state) {
    this.drawImageLayer(this.mainContext, this.canvas, state.originalImage);
    this.drawDetectedTrack(this.mainContext, state.detectedTrackPoints);
    this.drawPath(this.mainContext, state.getActivePath(), "#e879f9", 5);
    this.drawControlPoints(this.mainContext, state.userPoints);
    this.drawApex(this.mainContext, state.apexPoint);
    this.drawCar(this.mainContext, state);
  }

  drawLineCanvas(state) {
    this.drawImageLayer(this.lineContext, this.lineCanvas, state.originalImage);
    this.drawPath(this.lineContext, state.getActivePath(), "#e879f9", 5);
    this.drawApex(this.lineContext, state.apexPoint);
    this.drawCar(this.lineContext, state);
  }

  drawResultCanvas(state) {
    this.drawImageLayer(this.resultContext, this.resultCanvas, state.originalImage);
    this.drawSegmentedPath(
      this.resultContext,
      state.getActivePath(),
      state.segmentTypes,
    );
    this.drawCar(this.resultContext, state);
  }

  drawImageLayer(context, canvas, imageData) {
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (imageData) {
      context.putImageData(imageData, 0, 0);
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawDetectedTrack(context, points) {
    if (!points.length) return;

    context.save();

    // Glow effect
    context.shadowColor = "#06b6d4";
    context.shadowBlur = 8;

    // Thick vibrant cyan line
    context.strokeStyle = "#06b6d4";
    context.lineWidth = 5;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }

    context.stroke();

    // Draw bright visible dots
    context.shadowBlur = 4;
    const radius = 6;

    for (const point of points) {
      // Outer ring
      context.fillStyle = "#06b6d4";
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();

      // Inner white dot
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(point.x, point.y, radius * 0.45, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  drawControlPoints(context, points) {
    if (!points.length) return;

    context.save();

    // Glow
    context.shadowColor = "#10b981";
    context.shadowBlur = 6;

    context.strokeStyle = "#10b981";
    context.lineWidth = 4;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }

    context.stroke();

    // Draw points with ring effect
    points.forEach((point, index) => {
      const r = index === 0 ? 9 : 7;

      // Outer ring
      context.fillStyle = "#ef4444";
      context.shadowColor = "#ef4444";
      context.shadowBlur = 6;
      context.beginPath();
      context.arc(point.x, point.y, r, 0, Math.PI * 2);
      context.fill();

      // Inner white
      context.shadowBlur = 0;
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(point.x, point.y, r * 0.4, 0, Math.PI * 2);
      context.fill();
    });

    context.restore();
  }

  drawPath(context, path, strokeStyle, lineWidth) {
    if (path.length < 2) return;

    context.save();
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.shadowColor = strokeStyle;
    context.shadowBlur = 6;
    context.beginPath();
    context.moveTo(path[0].x, path[0].y);

    for (let index = 1; index < path.length; index += 1) {
      context.lineTo(path[index].x, path[index].y);
    }

    context.stroke();
    context.restore();
  }

  drawSegmentedPath(context, path, segmentTypes) {
    if (path.length < 2 || segmentTypes.length !== path.length - 1) return;

    context.save();
    context.lineWidth = 6;
    context.lineJoin = "round";
    context.lineCap = "round";

    for (let index = 0; index < path.length - 1; index += 1) {
      const segmentType = segmentTypes[index];
      const color =
        segmentType === "accelerate"
          ? "#10b981"
          : segmentType === "brake"
            ? "#ef4444"
            : "#f59e0b";

      context.strokeStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 4;
      context.beginPath();
      context.moveTo(path[index].x, path[index].y);
      context.lineTo(path[index + 1].x, path[index + 1].y);
      context.stroke();
    }

    context.restore();
  }

  drawApex(context, apexPoint) {
    if (!apexPoint) return;

    context.save();
    context.shadowColor = "#3b82f6";
    context.shadowBlur = 10;
    context.fillStyle = "#3b82f6";
    context.beginPath();
    context.arc(apexPoint.x, apexPoint.y, 8, 0, Math.PI * 2);
    context.fill();

    context.shadowBlur = 0;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(apexPoint.x, apexPoint.y, 3, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  drawCar(context, state) {
    const activePath = state.getActivePath();
    if (!activePath.length) return;

    const currentIndex = Math.min(state.carIndex, activePath.length - 1);
    const currentPoint = activePath[currentIndex];
    let carPoint = currentPoint;

    if (currentIndex < activePath.length - 1) {
      const nextPoint = activePath[currentIndex + 1];
      carPoint = {
        x: currentPoint.x + (nextPoint.x - currentPoint.x) * state.carSubstep,
        y: currentPoint.y + (nextPoint.y - currentPoint.y) * state.carSubstep,
      };
    }

    context.save();
    context.shadowColor = "#e879f9";
    context.shadowBlur = 10;
    context.fillStyle = "#e879f9";
    context.beginPath();
    context.arc(carPoint.x, carPoint.y, 8, 0, Math.PI * 2);
    context.fill();

    context.shadowBlur = 0;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(carPoint.x, carPoint.y, 8, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}
