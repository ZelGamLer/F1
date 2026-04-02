import { AppState } from "./core/appState.js";
import { CanvasRenderer } from "./rendering/canvasRenderer.js";
import { PathAnalysisService } from "./services/pathAnalysisService.js";
import { PathPlanningService } from "./services/pathPlanningService.js";
import { TrackDetectionService } from "./services/trackDetectionService.js";
import { clamp } from "./utils/geometry.js";

class AppController {
  constructor(elements) {
    this.elements = elements;
    this.state = new AppState();
    this.renderer = new CanvasRenderer({
      canvas: elements.canvas,
      lineCanvas: elements.lineCanvas,
      resultCanvas: elements.resultCanvas,
    });
    this.detector = new TrackDetectionService();
    this.planner = new PathPlanningService();
    this.analyzer = new PathAnalysisService();
    this.sourceCanvas = document.createElement("canvas");
    this.sourceContext = this.sourceCanvas.getContext("2d");
    this.animationFrameId = null;
    this.isPlaying = false;
  }

  init() {
    this.bindEvents();
    this.updateLabels();
    this.updateCvStatus();
    window.setInterval(() => this.updateCvStatus(), 800);
    this.render();
  }

  bindEvents() {
    const sliderIds = [
      "mu",
      "downforce",
      "initialSpeed",
      "mass",
      "brakePower",
      "accelPower",
    ];

    sliderIds.forEach((id) => {
      this.elements[id].addEventListener("input", () => this.handleConfigChange());
    });

    this.elements.tireState.addEventListener("change", () => this.handleConfigChange());
    this.elements.surfaceState.addEventListener("change", () => this.handleConfigChange());
    this.elements.fileInput.addEventListener("change", (event) => {
      const [file] = event.target.files;
      this.handleFileSelected(file);
    });
    this.elements.autoDetectBtn.addEventListener("click", () => this.handleAutoDetect());
    this.elements.clearDetectBtn.addEventListener("click", () => this.handleClearDetectedTrack());
    this.elements.clearBtn.addEventListener("click", () => this.handleClearAll());
    this.elements.undoBtn.addEventListener("click", () => this.handleUndoPoint());
    this.elements.lineBtn.addEventListener("click", () => this.handleGenerateLine());
    this.elements.apexBtn.addEventListener("click", () => this.handleAnalyzeOnly());
    this.elements.playBtn.addEventListener("click", () => this.handlePlay());
    this.elements.pauseBtn.addEventListener("click", () => this.handlePause());
    this.elements.resetCarBtn.addEventListener("click", () => this.handleResetCar());
    this.elements.canvas.addEventListener("click", (event) => this.handleCanvasClick(event));
  }

  updateCvStatus() {
    this.elements.cvStatus.textContent = this.detector.isReady()
      ? "OpenCV.js 사용 가능"
      : "OpenCV.js 로딩 중";
  }

  setStatus(message) {
    this.elements.status.textContent = message;
  }

  getEffectiveMu() {
    return (
      Number(this.elements.mu.value) *
      Number(this.elements.tireState.value) *
      Number(this.elements.surfaceState.value)
    );
  }

  getVehicleConfig() {
    return {
      baseMu: Number(this.elements.mu.value),
      effectiveMu: this.getEffectiveMu(),
      initialSpeed: Number(this.elements.initialSpeed.value),
      mass: Number(this.elements.mass.value),
      brakePower: Number(this.elements.brakePower.value),
      accelPower: Number(this.elements.accelPower.value),
      downforce: Number(this.elements.downforce.value),
    };
  }

  updateLabels() {
    this.elements.muVal.textContent = Number(this.elements.mu.value).toFixed(2);
    this.elements.downforceVal.textContent = Number(this.elements.downforce.value).toFixed(3);
    this.elements.initialSpeedVal.textContent = Number(this.elements.initialSpeed.value).toFixed(0);
    this.elements.massVal.textContent = Number(this.elements.mass.value).toFixed(0);
    this.elements.brakePowerVal.textContent = Number(this.elements.brakePower.value).toFixed(1);
    this.elements.accelPowerVal.textContent = Number(this.elements.accelPower.value).toFixed(1);
    this.elements.muEffVal.textContent = this.getEffectiveMu().toFixed(2);
    this.elements.apexCoordVal.textContent = this.state.apexPoint
      ? `(${this.state.apexPoint.x.toFixed(1)}, ${this.state.apexPoint.y.toFixed(1)})`
      : "-";
    this.elements.minSpeedVal.textContent =
      this.state.minSpeed !== null ? this.state.minSpeed.toFixed(1) : "-";

    const activePath = this.state.getActivePath();
    const progress =
      activePath.length > 1
        ? Math.round((this.state.carIndex / Math.max(1, activePath.length - 1)) * 100)
        : 0;
    this.elements.progressVal.textContent = `${progress}%`;
  }

  render() {
    this.renderer.render(this.state);
    this.updateLabels();
  }

  handleConfigChange() {
    this.updateLabels();

    if (this.state.userPoints.length >= 2) {
      this.buildAndAnalyzePath({ showStatus: false });
      return;
    }

    this.render();
  }

  async handleFileSelected(file) {
    if (!file) {
      this.setStatus("이미지 파일을 선택해 주세요.");
      return;
    }

    try {
      const image = await this.loadImage(file);
      this.renderer.resize(image.width, image.height);
      this.sourceCanvas.width = image.width;
      this.sourceCanvas.height = image.height;
      this.sourceContext.clearRect(0, 0, image.width, image.height);
      this.sourceContext.drawImage(image, 0, 0);

      const imageData = this.sourceContext.getImageData(0, 0, image.width, image.height);
      this.state.setImage({ imageData, width: image.width, height: image.height });
      this.stopAnimation();
      this.render();
      this.setStatus("이미지를 불러왔습니다. 수동으로 점을 찍거나 자동 검출을 실행할 수 있습니다.");
    } catch (error) {
      this.setStatus("이미지를 불러오지 못했습니다.");
    }
  }

  loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = reader.result;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  handleCanvasClick(event) {
    if (!this.state.originalImage) {
      this.setStatus("먼저 이미지를 불러와 주세요.");
      return;
    }

    const bounds = this.elements.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (this.elements.canvas.width / bounds.width);
    const y = (event.clientY - bounds.top) * (this.elements.canvas.height / bounds.height);

    this.stopAnimation();
    this.state.addUserPoint({ x, y });
    this.render();
    this.setStatus(`수동 제어점 ${this.state.userPoints.length}개를 입력했습니다.`);
  }

  handleUndoPoint() {
    if (!this.state.removeLastUserPoint()) {
      this.setStatus("삭제할 점이 없습니다.");
      return;
    }

    this.stopAnimation();
    this.render();
    this.setStatus(`마지막 점을 삭제했습니다. 남은 점은 ${this.state.userPoints.length}개입니다.`);
  }

  handleClearAll() {
    this.stopAnimation();
    this.state.clearAllTrackData();
    this.render();
    this.setStatus("검출 결과, 수동 점, 주행선을 모두 초기화했습니다.");
  }

  handleClearDetectedTrack() {
    this.state.clearDetectedTrack();
    this.render();
    this.setStatus("자동 검출 오버레이를 지웠습니다.");
  }

  handleGenerateLine() {
    if (this.state.userPoints.length < 3) {
      this.setStatus("주행선을 만들려면 제어점이 3개 이상 필요합니다.");
      return;
    }

    this.buildAndAnalyzePath({
      showStatus: true,
      statusMessage: "현재 제어점으로 주행선과 분석 결과를 생성했습니다.",
    });
  }

  handleAnalyzeOnly() {
    const activePath = this.state.getActivePath();
    if (activePath.length < 3) {
      this.setStatus("먼저 주행선을 생성해 주세요.");
      return;
    }

    const analysis = this.analyzer.analyze(activePath, this.getVehicleConfig());
    this.state.setAnalysis(analysis);
    this.render();

    if (analysis.apexPoint) {
      this.setStatus(
        `Apex를 계산했습니다. 좌표는 (${analysis.apexPoint.x.toFixed(1)}, ${analysis.apexPoint.y.toFixed(1)})입니다.`,
      );
      return;
    }

    this.setStatus("Apex를 찾지 못했습니다.");
  }

  handleAutoDetect() {
    if (!this.detector.isReady()) {
      this.setStatus("OpenCV.js가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (!this.state.originalImage) {
      this.setStatus("먼저 이미지를 불러와 주세요.");
      return;
    }

    try {
      const { trackPoints } = this.detector.detect(this.sourceCanvas);
      const controlPoints = this.planner.createControlPointsFromDetectedTrack(trackPoints);

      this.stopAnimation();
      this.state.setDetectedTrack(trackPoints);
      this.state.setUserPoints(controlPoints, { autoGenerated: true });

      this.buildAndAnalyzePath({
        showStatus: true,
        statusMessage: `트랙을 ${trackPoints.length}개 점으로 검출하고 ${controlPoints.length}개 제어점으로 주행선을 자동 생성했습니다.`,
      });
    } catch (error) {
      this.render();
      this.setStatus(error.message || "자동 검출 중 오류가 발생했습니다.");
    }
  }

  buildAndAnalyzePath({ showStatus, statusMessage }) {
    const vehicleConfig = this.getVehicleConfig();
    const generatedPaths = this.planner.buildPaths(this.state.userPoints, vehicleConfig);
    this.state.setGeneratedPaths(generatedPaths);

    const analysis = this.analyzer.analyze(this.state.getActivePath(), vehicleConfig);
    this.state.setAnalysis(analysis);
    this.render();

    if (showStatus && statusMessage) {
      this.setStatus(statusMessage);
    }
  }

  handlePlay() {
    const activePath = this.state.getActivePath();
    if (activePath.length < 2 || this.state.speedProfile.length !== activePath.length) {
      this.setStatus("먼저 주행선을 생성하고 분석해 주세요.");
      return;
    }

    this.stopAnimation();
    this.isPlaying = true;
    this.animateCar();
    this.setStatus("차량이 주행선을 따라 움직입니다.");
  }

  handlePause() {
    this.stopAnimation();
    this.render();
    this.setStatus("애니메이션을 멈췄습니다.");
  }

  handleResetCar() {
    this.stopAnimation();
    this.state.resetCar();
    this.render();
    this.setStatus("차량 위치를 시작점으로 되돌렸습니다.");
  }

  animateCar() {
    const activePath = this.state.getActivePath();

    if (
      !this.isPlaying ||
      activePath.length < 2 ||
      this.state.speedProfile.length !== activePath.length
    ) {
      this.stopAnimation();
      this.render();
      return;
    }

    if (this.state.carIndex >= activePath.length - 1) {
      this.stopAnimation();
      this.render();
      this.setStatus("주행 애니메이션이 끝났습니다.");
      return;
    }

    const currentSpeed = Math.max(
      1,
      this.state.speedProfile[Math.min(this.state.carIndex, this.state.speedProfile.length - 1)],
    );
    const normalizedSpeed = clamp(currentSpeed / 200, 0.15, 1);
    const stepSize = 0.05 + normalizedSpeed * 0.14;

    this.state.carSubstep += stepSize;

    while (this.state.carSubstep >= 1 && this.state.carIndex < activePath.length - 1) {
      this.state.carSubstep -= 1;
      this.state.carIndex += 1;
    }

    this.render();
    this.animationFrameId = window.requestAnimationFrame(() => this.animateCar());
  }

  stopAnimation() {
    this.isPlaying = false;

    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

const elements = {
  fileInput: document.getElementById("fileInput"),
  autoDetectBtn: document.getElementById("autoDetectBtn"),
  clearDetectBtn: document.getElementById("clearDetectBtn"),
  clearBtn: document.getElementById("clearBtn"),
  undoBtn: document.getElementById("undoBtn"),
  lineBtn: document.getElementById("lineBtn"),
  apexBtn: document.getElementById("apexBtn"),
  playBtn: document.getElementById("playBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resetCarBtn: document.getElementById("resetCarBtn"),
  canvas: document.getElementById("canvas"),
  lineCanvas: document.getElementById("lineCanvas"),
  resultCanvas: document.getElementById("resultCanvas"),
  status: document.getElementById("status"),
  cvStatus: document.getElementById("cvStatus"),
  mu: document.getElementById("mu"),
  downforce: document.getElementById("downforce"),
  initialSpeed: document.getElementById("initialSpeed"),
  mass: document.getElementById("mass"),
  brakePower: document.getElementById("brakePower"),
  accelPower: document.getElementById("accelPower"),
  tireState: document.getElementById("tireState"),
  surfaceState: document.getElementById("surfaceState"),
  muVal: document.getElementById("muVal"),
  downforceVal: document.getElementById("downforceVal"),
  initialSpeedVal: document.getElementById("initialSpeedVal"),
  massVal: document.getElementById("massVal"),
  brakePowerVal: document.getElementById("brakePowerVal"),
  accelPowerVal: document.getElementById("accelPowerVal"),
  muEffVal: document.getElementById("muEffVal"),
  apexCoordVal: document.getElementById("apexCoordVal"),
  minSpeedVal: document.getElementById("minSpeedVal"),
  progressVal: document.getElementById("progressVal"),
};

const controller = new AppController(elements);
controller.init();
