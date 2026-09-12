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
});
