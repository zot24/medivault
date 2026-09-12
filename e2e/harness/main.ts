import {
  describeUndrawableFrame,
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
  image.data.set(rgbaFromFrame(frame));
  context.putImageData(image, 0, 0);
}

const status = document.getElementById("status");
try {
  await draw("/mini-sc-rgb.dcm", "sc-rgb");
  await draw("/mini-ct-01.dcm", "ct-mono");
  if (status) {
    status.textContent = "ready";
  }
} catch (caught: unknown) {
  if (status) {
    status.textContent = "error";
  }
  throw caught;
}
