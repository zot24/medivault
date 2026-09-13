import { expect, test } from "@playwright/test";
import path from "path";

const appBase = process.env.E2E_BASE_URL;
const fixtures = path.resolve(import.meta.dirname, "../shared/fixtures");

// mini-sc-rgb.dcm and mini-ct-01.dcm both carry this hardcoded
// studyInstanceUid (see shared/mini-ct-dicom.ts's default), so uploading
// them together always lands in the same study card.
const FIXTURE_STUDY_UID = "1.2.826.0.1.3680043.8.498.study.1";

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
