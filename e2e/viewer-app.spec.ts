import { expect, test } from "@playwright/test";
import path from "path";

const appBase = process.env.E2E_BASE_URL;
const fixtures = path.resolve(import.meta.dirname, "../shared/fixtures");

// mini-sc-rgb.dcm and mini-ct-01.dcm both carry this hardcoded
// studyInstanceUid (see shared/mini-ct-dicom.ts's default), so uploading
// them together always lands in the same study card.
const FIXTURE_STUDY_UID = "1.2.826.0.1.3680043.8.498.study.1";

// mini-ct-mp-0{1..4}.dcm: a synthetic 2-phase x 2-slice series (plan 04).
// Upload order is phase-major with no explicit phase tag, mirroring the
// reference disc: slice locations 20, 10, 20, 10 -> 2 phases of 2.
const MULTIPHASE_STUDY_UID = "1.2.826.0.1.3680043.8.498.study.mp";

test.skip(
  !appBase,
  "Set E2E_BASE_URL to a running app (demo@medivault.app / demo123, or E2E_EMAIL / E2E_PASSWORD) to upload fixtures and open the viewer.",
);

test("uploads synthetic DICOM fixtures and draws them in the viewer", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByTestId("input-login-email")
    .fill(process.env.E2E_EMAIL ?? "demo@medivault.app");
  await page
    .getByTestId("input-login-password")
    .fill(process.env.E2E_PASSWORD ?? "demo123");
  await page.getByTestId("button-login-submit").click();
  await page.waitForURL(/\/(dashboard|documents)/);

  await page.goto("/documents");
  await page.getByTestId("button-upload-document").click();
  await page.getByTestId("input-upload-title").fill("Synthetic SC RGB");
  await page.getByTestId("input-upload-date").fill("2026-09-12");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("button-choose-upload-files").click();
  const dialog = await chooser;
  await dialog.setFiles([
    path.join(fixtures, "mini-sc-rgb.dcm"),
    path.join(fixtures, "mini-ct-01.dcm"),
  ]);
  await page.getByTestId("button-upload-submit").click();

  // The uploaded series has dicomMeta, so it's collapsed into a study card
  // instead of an ordinary document card.
  const studyCard = page.getByTestId(`study-card-${FIXTURE_STUDY_UID}`);
  await expect(studyCard).toBeVisible({ timeout: 30_000 });
  await studyCard.getByTestId(`button-open-study-${FIXTURE_STUDY_UID}`).click();

  await page.waitForURL(`**/studies/${encodeURIComponent(FIXTURE_STUDY_UID)}`);
  await expect(page.getByTestId("study-page")).toBeVisible();
  const seriesRows = page.locator('[data-testid^="series-row-"]');
  await expect(seriesRows.first()).toBeVisible();

  // A DICOM record's type badge shows its modality (CT, OT, ...), not the
  // generic documentType label — plan 02, item E.
  const modalityBadge = page.locator('[data-testid^="series-modality-"]').first();
  await expect(modalityBadge).toBeVisible();
  await expect(modalityBadge).not.toHaveText("");

  const view = page.locator('[data-testid^="button-view-series-"]').first();
  await view.click();

  const canvas = page.getByTestId("dicom-viewer-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("dicom-viewer-error")).toHaveCount(0);
  // Slices stream in; the overlay goes away once the first one is drawn.
  await expect(page.getByTestId("dicom-viewer-loading")).toHaveCount(0);

  const pixel = await canvas.evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) {
      throw new Error("viewer canvas missing");
    }
    const context = node.getContext("2d");
    if (!context) {
      throw new Error("viewer context missing");
    }
    return {
      width: node.width,
      height: node.height,
      rgba: Array.from(context.getImageData(0, 0, 1, 1).data),
    };
  });
  expect(pixel.width).toBeGreaterThan(0);
  expect(pixel.height).toBeGreaterThan(0);
  expect(pixel.rgba[3]).toBe(255);
  expect(pixel.rgba[0] + pixel.rgba[1] + pixel.rgba[2]).toBeGreaterThan(0);

  await expect(page.getByTestId("dicom-slice-index")).toBeVisible();
  const slider = page.getByTestId("dicom-slice-slider");
  await expect(slider).toBeVisible();
  if ((await slider.getAttribute("disabled")) == null) {
    await slider.fill("1");
    const after = await canvas.evaluate((node) => {
      if (!(node instanceof HTMLCanvasElement)) {
        throw new Error("viewer canvas missing");
      }
      const context = node.getContext("2d");
      if (!context) {
        throw new Error("viewer context missing");
      }
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    });
    expect(after[3]).toBe(255);
  }
});

test("hides the slice chrome for a single-image record", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByTestId("input-login-email")
    .fill(process.env.E2E_EMAIL ?? "demo@medivault.app");
  await page
    .getByTestId("input-login-password")
    .fill(process.env.E2E_PASSWORD ?? "demo123");
  await page.getByTestId("button-login-submit").click();
  await page.waitForURL(/\/(dashboard|documents)/);

  await page.goto("/documents");
  await page.getByTestId("button-upload-document").click();
  await page.getByTestId("input-upload-title").fill("Synthetic single slice");
  await page.getByTestId("input-upload-date").fill("2026-09-12");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("button-choose-upload-files").click();
  const dialog = await chooser;
  await dialog.setFiles([path.join(fixtures, "mini-ct-01.dcm")]);
  await page.getByTestId("button-upload-submit").click();
  await expect(page.getByText("Synthetic single slice")).toBeVisible({
    timeout: 30_000,
  });

  await page.locator("h3", { hasText: "Synthetic single slice" }).click();
  const view = page.locator('[data-testid^="button-view-primary-"]').first();
  await view.click();

  await expect(page.getByTestId("dicom-viewer-canvas")).toBeVisible();
  await expect(page.getByText("Single image.")).toBeVisible();
  await expect(page.getByTestId("dicom-slice-index")).not.toBeVisible();
  await expect(page.getByTestId("dicom-slice-slider")).not.toBeVisible();
});

test("shows a phase select and holds the slice steady while cine-ing through phases", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByTestId("input-login-email")
    .fill(process.env.E2E_EMAIL ?? "demo@medivault.app");
  await page
    .getByTestId("input-login-password")
    .fill(process.env.E2E_PASSWORD ?? "demo123");
  await page.getByTestId("button-login-submit").click();
  await page.waitForURL(/\/(dashboard|documents)/);

  await page.goto("/documents");
  await page.getByTestId("button-upload-document").click();
  await page.getByTestId("input-upload-title").fill("Synthetic multi-phase CT");
  await page.getByTestId("input-upload-date").fill("2026-09-12");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("button-choose-upload-files").click();
  const dialog = await chooser;
  await dialog.setFiles(
    ["01", "02", "03", "04"].map((n) => path.join(fixtures, `mini-ct-mp-${n}.dcm`)),
  );
  const uploaded = page.waitForResponse(
    (response) => response.url().includes("/api/documents") && response.request().method() === "POST",
  );
  await page.getByTestId("button-upload-submit").click();
  await uploaded;
  // The upload mutation doesn't invalidate the studies query, so a freshly
  // uploaded series needs a reload to show up in "Imaging Studies" (a
  // pre-existing gap, unrelated to this plan).
  await page.reload();

  const studyCard = page.getByTestId(`study-card-${MULTIPHASE_STUDY_UID}`);
  await expect(studyCard).toBeVisible({ timeout: 30_000 });
  await studyCard.getByTestId(`button-open-study-${MULTIPHASE_STUDY_UID}`).click();

  await page.waitForURL(`**/studies/${encodeURIComponent(MULTIPHASE_STUDY_UID)}`);
  const view = page.locator('[data-testid^="button-view-series-"]').first();
  await view.click();

  const phaseSelect = page.getByTestId("dicom-phase-select");
  await expect(phaseSelect).toBeVisible();
  const options = phaseSelect.locator("option");
  await expect(options).toHaveCount(2);
  await expect(page.getByTestId("dicom-viewer-error")).toHaveCount(0);

  const canvas = page.getByTestId("dicom-viewer-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("dicom-slice-index")).toHaveText(/1 \/ 2 · Phase 1/);

  // Switching phase keeps the same slice index (only the phase changes) so
  // wall motion at one anatomical slice can be compared across the cycle.
  await phaseSelect.selectOption("1");
  await expect(page.getByTestId("dicom-slice-index")).toHaveText(/1 \/ 2 · Phase 2/);
});

// mini-us-cine.dcm: a synthetic 2-frame JPEG Baseline ultrasound cine loop
// (shared/dicom-frame.test.ts builds the same fixture from the same two
// frame byte arrays) — plan 06.
const US_CINE_STUDY_UID = "1.2.826.0.1.3680043.8.498.study.us";

test("plays a synthetic ultrasound cine loop and steps its frame label", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByTestId("input-login-email")
    .fill(process.env.E2E_EMAIL ?? "demo@medivault.app");
  await page
    .getByTestId("input-login-password")
    .fill(process.env.E2E_PASSWORD ?? "demo123");
  await page.getByTestId("button-login-submit").click();
  await page.waitForURL(/\/(dashboard|documents)/);

  await page.goto("/documents");
  await page.getByTestId("button-upload-document").click();
  await page.getByTestId("input-upload-title").fill("Synthetic echo cine");
  await page.getByTestId("input-upload-date").fill("2026-09-12");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("button-choose-upload-files").click();
  const dialog = await chooser;
  await dialog.setFiles([path.join(fixtures, "mini-us-cine.dcm")]);
  const uploaded = page.waitForResponse(
    (response) => response.url().includes("/api/documents") && response.request().method() === "POST",
  );
  await page.getByTestId("button-upload-submit").click();
  await uploaded;
  // See the multi-phase test above: the studies query needs a reload to
  // pick up a freshly uploaded series (a pre-existing gap, unrelated to
  // this plan).
  await page.reload();

  const studyCard = page.getByTestId(`study-card-${US_CINE_STUDY_UID}`);
  await expect(studyCard).toBeVisible({ timeout: 30_000 });
  await studyCard.getByTestId(`button-open-study-${US_CINE_STUDY_UID}`).click();

  await page.waitForURL(`**/studies/${encodeURIComponent(US_CINE_STUDY_UID)}`);
  const view = page.locator('[data-testid^="button-view-series-"]').first();
  await view.click();

  const canvas = page.getByTestId("dicom-viewer-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("dicom-viewer-error")).toHaveCount(0);

  // No window-preset picker for this RGB/YBR content.
  await expect(page.getByTestId("dicom-window-preset")).toHaveCount(0);

  const play = page.getByTestId("dicom-play");
  await expect(play).toBeVisible();
  // Nothing to preload: frames are decoded on demand from fragments that
  // are already in memory, so play is live as soon as the loop is indexed.
  await expect(play).toBeEnabled({ timeout: 15_000 });

  const frameLabel = page.getByTestId("dicom-cine-frame-index");
  await expect(frameLabel).toHaveText("1 / 2");

  await play.click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  // The fixture's frame rate (2 fps) flips the frame within 500ms; just
  // assert the label actually moves off its starting value, rather than
  // pinning an exact frame — which one it lands on depends on timing.
  await expect(frameLabel).not.toHaveText("1 / 2", { timeout: 5_000 });

  // The frame slider also scrubs directly, independent of playback.
  await page.getByTestId("dicom-play").click(); // pause first
  await page.getByTestId("dicom-frame-slider").fill("0");
  await expect(frameLabel).toHaveText("1 / 2");
});
