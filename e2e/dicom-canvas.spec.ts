import { expect, test } from "@playwright/test";

test("draws synthetic SC RGB and CT fixtures on a canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("ready");
  await expect(page.getByTestId("dicom-viewer-error")).toBeHidden();

  const sc = page.getByTestId("dicom-viewer-canvas-sc-rgb");
  const ct = page.getByTestId("dicom-viewer-canvas-ct-mono");
  await expect(sc).toBeVisible();
  await expect(ct).toBeVisible();

  const scPixel = await sc.evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error("sc canvas missing");
    }
    const context = node.getContext("2d");
    if (!context) {
      throw new Error("sc context missing");
    }
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  expect(scPixel).toEqual([255, 0, 0, 255]);

  const ctStats = await ct.evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error("ct canvas missing");
    }
    const context = node.getContext("2d");
    if (!context) {
      throw new Error("ct context missing");
    }
    const pixels = context.getImageData(0, 0, node.width, node.height).data;
    let nonBlack = 0;
    let max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const value = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (value > 0) {
        nonBlack += 1;
      }
      if (value > max) {
        max = value;
      }
    }
    return { width: node.width, height: node.height, nonBlack, max };
  });
  expect(ctStats).toEqual({
    width: 16,
    height: 16,
    nonBlack: 255,
    max: 255,
  });

  const overlay = page.getByTestId("dicom-viewer-canvas-ct-overlay");
  await expect(overlay).toBeVisible();

  // The fixture draws a 4x4 overlay at OverlayOrigin [6, 6] (1-based), so
  // its top-left pixel lands at frame row 5, column 5.
  const overlayPixel = await overlay.evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error("overlay canvas missing");
    }
    const context = node.getContext("2d");
    if (!context) {
      throw new Error("overlay context missing");
    }
    return Array.from(context.getImageData(5, 5, 1, 1).data);
  });
  expect(overlayPixel).toEqual([0, 255, 128, 255]);
});

test("decodes and draws a JPEG Baseline ultrasound cine fixture, frame by frame (plan 06)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("ready");
  await expect(page.getByTestId("dicom-viewer-error")).toBeHidden();

  const frame0 = page.getByTestId("dicom-viewer-canvas-us-cine-frame0");
  const frame1 = page.getByTestId("dicom-viewer-canvas-us-cine-frame1");
  await expect(frame0).toBeVisible();
  await expect(frame1).toBeVisible();

  async function canvasStats(locator: typeof frame0) {
    return locator.evaluate((node) => {
      if (!(node instanceof HTMLCanvasElement)) {
        throw new Error("canvas missing");
      }
      const context = node.getContext("2d");
      if (!context) {
        throw new Error("context missing");
      }
      const pixels = context.getImageData(0, 0, node.width, node.height).data;
      let nonBlack = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 0 || pixels[i + 1] > 0 || pixels[i + 2] > 0) {
          nonBlack += 1;
        }
      }
      return { width: node.width, height: node.height, nonBlack, first: Array.from(pixels.slice(0, 4)) };
    });
  }

  const stats0 = await canvasStats(frame0);
  const stats1 = await canvasStats(frame1);

  // Both frames decode to the full 8x8 image (non-blank throughout)...
  expect(stats0.width).toBe(8);
  expect(stats0.height).toBe(8);
  expect(stats0.nonBlack).toBe(64);
  expect(stats1.nonBlack).toBe(64);
  // ...but a different frame — the fixture's two frames carry a different
  // DC coefficient (shared/dicom-frame.test.ts), so they decode differently.
  expect(stats0.first).not.toEqual(stats1.first);
});
