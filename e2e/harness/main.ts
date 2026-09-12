import {
  compositeOverlays,
  describeUndrawableFrame,
  overlaysFromPart10,
  pixelFrameFromPart10,
  rgbaFromFrame,
} from "@shared/dicom-frame";

async function draw(url: string, canvasId: string): Promise<void> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const frame = pixelFrameFromPart10(bytes);
  const canvas = document.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`missing canvas ${canvasId}`);
  }
  if (!frame) {
    const error = document.getElementById("error");
    if (error) {
      error.hidden = false;
      error.textContent = describeUndrawableFrame(bytes);
    }
    throw new Error(describeUndrawableFrame(bytes));
  }
  canvas.width = frame.columns;
  canvas.height = frame.rows;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d context unavailable");
  }
  const image = context.createImageData(frame.columns, frame.rows);
  const rgba = rgbaFromFrame(frame);
  const overlays = overlaysFromPart10(bytes);
  if (overlays.length > 0) {
    compositeOverlays(rgba, frame.rows, frame.columns, overlays);
  }
  image.data.set(rgba);
  context.putImageData(image, 0, 0);
}

const status = document.getElementById("status");
try {
  await draw("/mini-sc-rgb.dcm", "sc-rgb");
  await draw("/mini-ct-01.dcm", "ct-mono");
  await draw("/mini-ct-overlay.dcm", "ct-overlay");
  if (status) {
    status.textContent = "ready";
  }
} catch (caught: unknown) {
  if (status) {
    status.textContent = "error";
  }
  throw caught;
}
