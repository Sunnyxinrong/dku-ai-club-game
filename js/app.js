/* Main controller: drawing, model inference, timer, scoring and leaderboard. */
(function () {
  "use strict";

  const config = window.GAME_CONFIG;
  const preprocessor = window.SketchPreprocessor;

  const drawingCanvas = document.getElementById("drawingCanvas");
  const drawingContext = drawingCanvas.getContext("2d", { willReadFrequently: true });
  const modelCanvas = document.getElementById("modelCanvas");
  const modelContext = modelCanvas.getContext("2d", { willReadFrequently: true });
  const canvasWrap = document.getElementById("canvasWrap");

  const ui = {
    subject: document.getElementById("subject"),
    decoy: document.getElementById("decoy"),
    modelStatus: document.getElementById("modelStatus"),
    howText: document.getElementById("howText"),
    time: document.getElementById("timeValue"),
    timer: document.getElementById("timer"),
    score: document.getElementById("scoreValue"),
    round: document.getElementById("roundValue"),
    roundTotal: document.getElementById("roundTotal"),
    secondsLabel: document.getElementById("secondsLabel"),
    predictions: Array.from(document.querySelectorAll(".prediction-row")),
    rankList: document.getElementById("rankList"),
    startOverlay: document.getElementById("startOverlay"),
    resultOverlay: document.getElementById("resultOverlay"),
    resultEmoji: document.getElementById("resultEmoji"),
    resultTitle: document.getElementById("resultTitle"),
    resultText: document.getElementById("resultText"),
    roundScore: document.getElementById("roundScore"),
    nextButton: document.getElementById("nextButton"),
    playerName: document.getElementById("playerName"),
    debugPanel: document.getElementById("debugPanel"),
    debugMode: document.getElementById("debugMode"),
    debugBounds: document.getElementById("debugBounds"),
    debugScale: document.getElementById("debugScale"),
    debugLatency: document.getElementById("debugLatency"),
    debugError: document.getElementById("debugError")
  };

  const state = {
    classifier: null,
    modelReady: false,
    fallbackMode: false,
    drawing: false,
    hasInk: false,
    previousPoint: null,
    undoHistory: [],
    challengeIndex: -1,
    round: 1,
    score: 0,
    timeLeft: config.roundSeconds,
    running: false,
    timerId: null,
    predictionDelayId: null,
    inferenceInFlight: false,
    predictions: []
  };

  function initializeCanvases() {
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.strokeStyle = "#101820";
    drawingContext.lineWidth = config.brushWidth;
    fillWhite(drawingContext, drawingCanvas);
    fillWhite(modelContext, modelCanvas);
  }

  function fillWhite(context, canvas) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  function canvasPoint(pointerEvent) {
    const box = drawingCanvas.getBoundingClientRect();
    return {
      x: (pointerEvent.clientX - box.left) * drawingCanvas.width / box.width,
      y: (pointerEvent.clientY - box.top) * drawingCanvas.height / box.height
    };
  }

  function startStroke(event) {
    if (!state.running) return;
    event.preventDefault();

    state.undoHistory.push(
      drawingContext.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height)
    );
    if (state.undoHistory.length > 12) state.undoHistory.shift();

    state.drawing = true;
    state.previousPoint = canvasPoint(event);
    drawingCanvas.setPointerCapture?.(event.pointerId);

    // A click/tap without movement still produces a visible dot.
    drawingContext.beginPath();
    drawingContext.arc(
      state.previousPoint.x,
      state.previousPoint.y,
      config.brushWidth / 2,
      0,
      Math.PI * 2
    );
    drawingContext.fillStyle = drawingContext.strokeStyle;
    drawingContext.fill();
    markCanvasChanged();
  }

  function continueStroke(event) {
    if (!state.drawing) return;
    event.preventDefault();
    const nextPoint = canvasPoint(event);

    drawingContext.beginPath();
    drawingContext.moveTo(state.previousPoint.x, state.previousPoint.y);
    drawingContext.lineTo(nextPoint.x, nextPoint.y);
    drawingContext.stroke();

    state.previousPoint = nextPoint;
    markCanvasChanged();
  }

  function endStroke() {
    if (!state.drawing) return;
    state.drawing = false;
    state.previousPoint = null;
    schedulePrediction(60);
    window.setTimeout(() => canvasWrap.classList.remove("analyzing"), 450);
  }

  function markCanvasChanged() {
    state.hasInk = true;
    canvasWrap.classList.add("has-ink", "analyzing");
    schedulePrediction(260);
  }

  function clearDrawing() {
    fillWhite(drawingContext, drawingCanvas);
    fillWhite(modelContext, modelCanvas);
    state.undoHistory = [];
    state.hasInk = false;
    state.predictions = [];
    canvasWrap.classList.remove("has-ink", "analyzing");
    renderPredictions([]);
    renderDebug({ empty: true, bounds: null, scale: 0 }, null, 0);
  }

  function undoDrawing() {
    const previousImage = state.undoHistory.pop();
    if (!previousImage) return;
    drawingContext.putImageData(previousImage, 0, 0);
    const bounds = preprocessor.findInkBounds(drawingCanvas, drawingContext);
    state.hasInk = Boolean(bounds);
    canvasWrap.classList.toggle("has-ink", state.hasInk);
    if (state.hasInk) schedulePrediction(60);
    else clearDrawing();
  }

  function schedulePrediction(delay) {
    window.clearTimeout(state.predictionDelayId);
    state.predictionDelayId = window.setTimeout(() => predict(), delay);
  }

  function classifyWithMl5(inputCanvas) {
    return new Promise((resolve, reject) => {
      state.classifier.classify(inputCanvas, (error, results) => {
        if (error) reject(error);
        else resolve(results || []);
      });
    });
  }

  async function predict() {
    if (!state.hasInk || state.inferenceInFlight) return state.predictions;

    const metrics = preprocessor.normalize(drawingCanvas, modelCanvas, config);
    if (metrics.empty) return [];

    if (!state.modelReady && !state.fallbackMode) {
      renderDebug(metrics, "Model is still loading", 0);
      return [];
    }

    const startedAt = performance.now();
    state.inferenceInFlight = true;

    try {
      let results;
      if (state.modelReady && !state.fallbackMode) {
        results = await classifyWithMl5(modelCanvas);
        state.predictions = results.slice(0, 3).map(result => ({
          label: result.label,
          confidence: result.confidence
        }));
      } else {
        state.predictions = fallbackPrediction(metrics);
      }

      const latency = performance.now() - startedAt;
      renderPredictions(state.predictions);
      renderDebug(metrics, null, latency);
      console.table(state.predictions);
      return state.predictions;
    } catch (error) {
      enableFallback(error);
      state.predictions = fallbackPrediction(metrics);
      renderPredictions(state.predictions);
      renderDebug(metrics, error.message || String(error), performance.now() - startedAt);
      return state.predictions;
    } finally {
      state.inferenceInFlight = false;
    }
  }

  // This is only a continuity fallback for a network/model loading failure.
  // It is deliberately labelled DEMO ENGINE and is not a neural network.
  function fallbackPrediction(metrics) {
    const ratio = metrics.bounds.width / metrics.bounds.height;
    let labels;
    if (ratio > 1.55) labels = ["airplane", "fish", "bicycle"];
    else if (ratio < 0.68) labels = ["tree", "umbrella", "flower"];
    else labels = ["cat", "dog", "apple"];
    return labels.map((label, index) => ({
      label,
      confidence: Math.max(0.08, 0.72 - index * 0.2)
    }));
  }

  function renderPredictions(predictions) {
    ui.predictions.forEach((row, index) => {
      const prediction = predictions[index];
      row.querySelector(".prediction-label span:first-child").textContent =
        prediction ? prediction.label : (index === 0 ? "Waiting for ink" : "—");
      row.querySelector(".confidence").textContent = prediction
        ? `${Math.round(prediction.confidence * 100)}%`
        : "—";
      row.querySelector(".confidence-bar i").style.width = prediction
        ? `${Math.round(prediction.confidence * 100)}%`
        : "0%";
    });
  }

  function renderDebug(metrics, error, latency) {
    if (!config.debug) return;
    ui.debugMode.textContent = state.modelReady && !state.fallbackMode
      ? "DoodleNet"
      : (state.fallbackMode ? "Fallback demo" : "Loading");
    ui.debugBounds.textContent = metrics && metrics.bounds
      ? `${metrics.bounds.x}, ${metrics.bounds.y}, ${metrics.bounds.width} × ${metrics.bounds.height}`
      : "No ink";
    ui.debugScale.textContent = metrics && metrics.scale
      ? `${metrics.scale.toFixed(3)}×`
      : "—";
    ui.debugLatency.textContent = latency ? `${latency.toFixed(1)} ms` : "—";
    ui.debugError.textContent = error || "None";
  }

  function setStatus(kind, text) {
    ui.modelStatus.className = `model-status ${kind}`.trim();
    ui.modelStatus.querySelector("span").textContent = text;
  }

  function enableFallback(error) {
    state.fallbackMode = true;
    setStatus("fallback", "DEMO ENGINE");
    ui.howText.textContent = "The neural model failed to load. Predictions now come from the labelled fallback demo engine.";
    if (error) console.error("DoodleNet error:", error);
  }

  function loadModel() {
    if (!window.ml5) {
      enableFallback(new Error("ml5.js was not downloaded"));
      return;
    }

    try {
      state.classifier = window.ml5.imageClassifier(config.modelName, () => {
        state.modelReady = true;
        state.fallbackMode = false;
        setStatus("ready", "NEURAL NET READY");
        ui.howText.textContent = "The sketch is cropped, centered and resized before DoodleNet classifies it.";
        renderDebug({ empty: !state.hasInk, bounds: null, scale: 0 }, null, 0);
        if (state.hasInk) schedulePrediction(0);
      });
    } catch (error) {
      enableFallback(error);
    }

    window.setTimeout(() => {
      if (!state.modelReady) enableFallback(new Error("Model load timed out after 12 seconds"));
    }, 12000);
  }

  function chooseChallenge() {
    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * config.challenges.length);
    } while (config.challenges.length > 1 && nextIndex === state.challengeIndex);

    state.challengeIndex = nextIndex;
    const [subject, decoy] = config.challenges[nextIndex];
    ui.subject.textContent = `a ${subject}`;
    ui.decoy.textContent = `a ${decoy}`;
  }

  function startRound() {
    clearDrawing();
    state.running = true;
    state.timeLeft = config.roundSeconds;
    ui.time.textContent = state.timeLeft.toFixed(1);
    ui.round.textContent = state.round;
    ui.timer.classList.remove("urgent");
    window.clearInterval(state.timerId);
    state.timerId = window.setInterval(updateTimer, 100);
  }

  function updateTimer() {
    state.timeLeft = Math.max(0, state.timeLeft - 0.1);
    ui.time.textContent = state.timeLeft.toFixed(1);
    ui.timer.classList.toggle("urgent", state.timeLeft <= 5);
    if (state.timeLeft <= 0) finishRound();
  }

  async function submitRound() {
    await predict();
    finishRound();
  }

  function finishRound() {
    if (!state.running) return;
    state.running = false;
    window.clearInterval(state.timerId);

    const target = config.challenges[state.challengeIndex][1].toLowerCase();
    const top = state.predictions[0] || { label: "nothing", confidence: 0 };
    const targetPrediction = state.predictions.find(
      prediction => prediction.label.toLowerCase() === target
    );
    const succeeded = top.label.toLowerCase() === target;
    const points = succeeded
      ? Math.round(400 + top.confidence * 400 + state.timeLeft * 12)
      : (targetPrediction ? Math.round(targetPrediction.confidence * 250) : 0);

    state.score += points;
    ui.score.textContent = state.score;
    ui.resultEmoji.textContent = succeeded ? "⚡" : "◌";
    ui.resultTitle.textContent = succeeded ? "You fooled it!" : "The AI resisted.";
    ui.resultTitle.className = succeeded ? "success" : "failure";
    ui.resultText.textContent = succeeded
      ? `It saw “${top.label}” with ${Math.round(top.confidence * 100)}% confidence.`
      : `It saw “${top.label}”. Try exaggerating the features of “${target}”.`;
    ui.roundScore.textContent = `+${points}`;
    ui.nextButton.textContent = state.round >= config.totalRounds
      ? "Finish game →"
      : "Next mission →";
    ui.resultOverlay.classList.remove("hidden");
  }

  function readLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem("dkuFoolScores") || "[]");
    } catch {
      return [];
    }
  }

  function saveScore() {
    const name = (ui.playerName.value.trim() || "GUEST").toUpperCase().slice(0, 12);
    const scores = readLeaderboard();
    scores.push({ name, score: state.score });
    scores.sort((a, b) => b.score - a.score);
    try {
      localStorage.setItem("dkuFoolScores", JSON.stringify(scores.slice(0, 5)));
    } catch (error) {
      console.warn("Leaderboard could not be saved:", error);
    }
    renderLeaderboard();
  }

  function renderLeaderboard() {
    const scores = readLeaderboard();
    const visibleScores = scores.length ? scores : [{ name: "BE THE FIRST", score: 0 }];
    ui.rankList.replaceChildren();

    visibleScores.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "rank";
      const place = document.createElement("span");
      const name = document.createElement("b");
      const score = document.createElement("b");
      place.textContent = index + 1;
      name.textContent = entry.name;
      score.textContent = entry.score;
      row.append(place, name, score);
      ui.rankList.append(row);
    });
  }

  function nextRound() {
    ui.resultOverlay.classList.add("hidden");
    if (state.round >= config.totalRounds) {
      saveScore();
      window.alert(`Final score: ${state.score}! Your result is on the leaderboard.`);
      state.round = 1;
      state.score = 0;
      ui.score.textContent = 0;
    } else {
      state.round += 1;
    }
    chooseChallenge();
    startRound();
  }

  function bindEvents() {
    drawingCanvas.addEventListener("pointerdown", startStroke);
    drawingCanvas.addEventListener("pointermove", continueStroke);
    drawingCanvas.addEventListener("pointerup", endStroke);
    drawingCanvas.addEventListener("pointercancel", endStroke);
    document.getElementById("clearButton").addEventListener("click", clearDrawing);
    document.getElementById("undoButton").addEventListener("click", undoDrawing);
    document.getElementById("submitButton").addEventListener("click", submitRound);
    document.getElementById("skipButton").addEventListener("click", () => {
      chooseChallenge();
      if (state.running) startRound();
    });
    document.getElementById("startButton").addEventListener("click", () => {
      ui.startOverlay.classList.add("hidden");
      chooseChallenge();
      startRound();
    });
    ui.playerName.addEventListener("keydown", event => {
      if (event.key === "Enter") document.getElementById("startButton").click();
    });
    ui.nextButton.addEventListener("click", nextRound);
  }

  function initialize() {
    ui.roundTotal.textContent = config.totalRounds;
    ui.secondsLabel.textContent = config.roundSeconds;
    ui.debugPanel.classList.toggle("hidden", !config.debug);
    initializeCanvases();
    bindEvents();
    renderLeaderboard();
    renderDebug({ empty: true, bounds: null, scale: 0 }, null, 0);
    loadModel();
  }

  initialize();
})();
