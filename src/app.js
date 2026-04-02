import { AppState } from "./core/appState.js";
import { CanvasRenderer } from "./rendering/canvasRenderer.js";
import { PathAnalysisService } from "./services/pathAnalysisService.js";
import { PathPlanningService } from "./services/pathPlanningService.js";
import { TrackDetectionService } from "./services/trackDetection.js";
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
      "density",
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
      ? "✅ 준비 완료"
      : "⏳ 로딩 중…";
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
    this.elements.densityVal.textContent = Number(this.elements.density.value).toFixed(0);
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
      this.setStatus("Select an image file first.");
      return;
    }

    if (!String(file.type || "").startsWith("image/")) {
      this.setStatus("지원하지 않는 파일 형식입니다. 이미지 파일을 선택해주세요.");
      this.elements.fileInput.value = "";
      return;
    }

    let image = null;

    try {
      image = await this.loadImage(file);
      const width = image.width || image.naturalWidth;
      const height = image.height || image.naturalHeight;

      if (!width || !height) {
        throw new Error("브라우저가 이미지 크기를 읽지 못했습니다.");
      }

      this.renderer.resize(width, height);
      this.sourceCanvas.width = width;
      this.sourceCanvas.height = height;
      this.sourceContext.clearRect(0, 0, width, height);
      this.sourceContext.drawImage(image, 0, 0, width, height);

      const imageData = this.sourceContext.getImageData(0, 0, width, height);
      this.state.setImage({ imageData, width, height });
      this.stopAnimation();
      this.render();
      this.setStatus(
        `이미지 로드 완료: ${file.name}. 수동으로 점을 추가하거나 자동 검출을 실행하세요.`,
      );
    } catch (error) {
      this.render();
      this.setStatus(error.message || "이미지 로드에 실패했습니다.");
    } finally {
      if (image && typeof image.close === "function") {
        image.close();
      }
      this.elements.fileInput.value = "";
    }
  }

  async loadImage(file) {
    const bitmap = await this.tryLoadImageBitmap(file);
    if (bitmap) return bitmap;

    try {
      return await this.loadImageFromObjectUrl(file);
    } catch (error) {
      return this.loadImageFromFileReader(file);
    }
  }

  async tryLoadImageBitmap(file) {
    if (typeof window.createImageBitmap !== "function") return null;

    try {
      return await window.createImageBitmap(file);
    } catch (error) {
      return null;
    }
  }

  loadImageFromObjectUrl(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(objectUrl);
        callback(value);
      };

      image.onload = () => finish(resolve, image);
      image.onerror = () => {
        finish(reject, new Error("The browser could not decode this image file."));
      };
      image.src = objectUrl;
    });
  }

  loadImageFromFileReader(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => {
          reject(new Error("The browser could not decode this image file."));
        };
        image.src = reader.result;
      };

      reader.onerror = () => {
        reject(new Error("The browser could not read the image file."));
      };
      reader.readAsDataURL(file);
    });
  }

  handleCanvasClick(event) {
    if (!this.state.originalImage) {
      this.setStatus("먼저 이미지를 로드한 뒤 기준점을 찍어주세요.");
      return;
    }

    const bounds = this.elements.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (this.elements.canvas.width / bounds.width);
    const y = (event.clientY - bounds.top) * (this.elements.canvas.height / bounds.height);

    this.stopAnimation();
    this.state.addUserPoint({ x, y });
    this.render();
    this.setStatus(`수동 기준점: ${this.state.userPoints.length}개`);
  }

  handleUndoPoint() {
    if (!this.state.removeLastUserPoint()) {
      this.setStatus("취소할 점이 없습니다.");
      return;
    }

    this.stopAnimation();
    this.render();
    this.setStatus(`마지막 점 제거됨. 남은 점: ${this.state.userPoints.length}개`);
  }

  handleClearAll() {
    this.stopAnimation();
    this.state.clearAllTrackData();
    this.render();
    this.setStatus("감지된 트랙, 기준점, 주행 라인이 모두 지워졌습니다.");
  }

  handleClearDetectedTrack() {
    this.state.clearDetectedTrack();
    this.render();
    this.setStatus("자동 검출 오버레이가 제거되었습니다.");
  }

  handleGenerateLine() {
    if (this.state.userPoints.length < 3) {
      this.setStatus("주행 라인을 생성하려면 최소 3개의 기준점이 필요합니다.");
      return;
    }

    this.buildAndAnalyzePath({
      showStatus: true,
      statusMessage: "현재 기준점으로 주행 라인 및 분석을 다시 생성했습니다.",
    });
  }

  handleAnalyzeOnly() {
    const activePath = this.state.getActivePath();
    if (activePath.length < 3) {
      this.setStatus("먼저 주행 라인을 생성해주세요.");
      return;
    }

    const analysis = this.analyzer.analyze(activePath, this.getVehicleConfig());
    this.state.setAnalysis(analysis);
    this.render();

    if (analysis.apexPoint) {
      this.setStatus(
        `에이펙스 갱신됨: (${analysis.apexPoint.x.toFixed(1)}, ${analysis.apexPoint.y.toFixed(1)})`,
      );
      return;
    }

    this.setStatus("에이펙스를 찾을 수 없습니다.");
  }

  handleAutoDetect() {
    if (!this.detector.isReady()) {
      this.setStatus("아직 준비 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (!this.state.originalImage) {
      this.setStatus("먼저 이미지를 로드해주세요.");
      return;
    }

    try {
      const density = Number(this.elements.density.value) || 40;
      const { trackPoints } = this.detector.detect(this.sourceCanvas, { density });
      const controlPoints = this.planner.createControlPointsFromDetectedTrack(trackPoints);

      this.stopAnimation();
      this.state.setDetectedTrack(trackPoints);
      this.state.setUserPoints(controlPoints, { autoGenerated: true });

      this.buildAndAnalyzePath({
        showStatus: true,
        statusMessage: `자동 검출 완료! 트랙 포인트 ${trackPoints.length}개 → 주행 라인 기준점 ${controlPoints.length}개 생성됨`,
      });
    } catch (error) {
      this.render();
      this.setStatus(error.message || "자동 검출에 실패했습니다.");
    }
  }

  buildAndAnalyzePath({ showStatus, statusMessage }) {
    const vehicleConfig = this.getVehicleConfig();
    const density = Number(this.elements.density.value) || 40;
    const generatedPaths = this.planner.buildPaths(this.state.userPoints, vehicleConfig, { density });
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
      this.setStatus("먼저 주행 라인을 생성하고 분석해주세요.");
      return;
    }

    this.stopAnimation();
    this.isPlaying = true;
    this.animateCar();
    this.setStatus("애니메이션이 시작되었습니다.");
  }

  handlePause() {
    this.stopAnimation();
    this.render();
    this.setStatus("애니메이션이 일시정지되었습니다.");
  }

  handleResetCar() {
    this.stopAnimation();
    this.state.resetCar();
    this.render();
    this.setStatus("차량 위치가 출발점으로 초기화되었습니다.");
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
      this.setStatus("애니메이션이 완료되었습니다.");
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

function createElements() {
  return {
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
    density: document.getElementById("density"),
    densityVal: document.getElementById("densityVal"),
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
}

function initializeApp() {
  const elements = createElements();
  const missingElements = Object.entries(elements)
    .filter(([, element]) => !element)
    .map(([name]) => name);

  if (missingElements.length) {
    const message = `App startup failed because required UI elements are missing: ${missingElements.join(", ")}`;
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = message;
    }
    throw new Error(message);
  }

  const controller = new AppController(elements);
  controller.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}
