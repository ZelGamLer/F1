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
    this.drawPath(this.mainContext, state.getActivePath(), "#ff00aa", 4);
    this.drawControlPoints(this.mainContext, state.userPoints);
    this.drawApex(this.mainContext, state.apexPoint);
    this.drawCar(this.mainContext, state);
  }

  drawLineCanvas(state) {
    this.drawImageLayer(this.lineContext, this.lineCanvas, state.originalImage);
    this.drawPath(this.lineContext, state.getActivePath(), "#ff00aa", 4);
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
    context.strokeStyle = "rgba(0, 188, 212, 0.75)";
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }

    context.stroke();

    const radius = points.length > 60 ? 2.5 : points.length > 24 ? 3 : 4;
    context.fillStyle = "#00bcd4";

    for (const point of points) {
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  drawControlPoints(context, points) {
    if (!points.length) return;

    context.save();
    context.strokeStyle = "#32d74b";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }

    context.stroke();
    context.fillStyle = "#ef4444";

    points.forEach((point, index) => {
      context.beginPath();
      context.arc(point.x, point.y, index === 0 ? 5 : 4, 0, Math.PI * 2);
      context.fill();
    });

    context.restore();
  }

  drawPath(context, path, strokeStyle, lineWidth) {
    if (path.length < 2) return;

    context.save();
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
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
    context.lineWidth = 5;

    for (let index = 0; index < path.length - 1; index += 1) {
      const segmentType = segmentTypes[index];
      context.strokeStyle =
        segmentType === "accelerate"
          ? "#2e7d32"
          : segmentType === "brake"
            ? "#c62828"
            : "#f9a825";

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
    context.fillStyle = "#1565c0";
    context.beginPath();
    context.arc(apexPoint.x, apexPoint.y, 6, 0, Math.PI * 2);
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
    context.fillStyle = "#111827";
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(carPoint.x, carPoint.y, 7, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
}
