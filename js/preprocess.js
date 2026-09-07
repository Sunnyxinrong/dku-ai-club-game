/*
 * Converts the large drawing canvas into the centered square image expected by
 * DoodleNet. Keeping this separate makes preprocessing easy to inspect/test.
 */
(function () {
  "use strict";

  function findInkBounds(sourceCanvas, sourceContext) {
    const { width, height } = sourceCanvas;
    const pixels = sourceContext.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    // Sampling every second pixel is fast enough for live inference.
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        const isInk =
          pixels[index] < 235 ||
          pixels[index + 1] < 235 ||
          pixels[index + 2] < 235;

        if (isInk) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < 0) return null;
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX + 2),
      height: Math.max(1, maxY - minY + 2)
    };
  }

  function normalize(sourceCanvas, targetCanvas, config) {
    const sourceContext = sourceCanvas.getContext("2d");
    const targetContext = targetCanvas.getContext("2d");
    const bounds = findInkBounds(sourceCanvas, sourceContext);

    targetContext.fillStyle = "#ffffff";
    targetContext.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

    if (!bounds) {
      return { empty: true, bounds: null, scale: 0 };
    }

    const scale = Math.min(
      config.modelDrawingSize / bounds.width,
      config.modelDrawingSize / bounds.height
    );
    const drawWidth = bounds.width * scale;
    const drawHeight = bounds.height * scale;
    const drawX = (config.modelInputSize - drawWidth) / 2;
    const drawY = (config.modelInputSize - drawHeight) / 2;

    targetContext.imageSmoothingEnabled = true;
    targetContext.drawImage(
      sourceCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );

    return { empty: false, bounds, scale };
  }

  window.SketchPreprocessor = { findInkBounds, normalize };
})();
