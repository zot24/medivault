import { expect, test } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import { buildMiniCtDicom } from "../shared/mini-ct-dicom";

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

  // The study is the document: the Dashboard counts a study once, however
  // many series it holds, and its timeline entry opens the study page.
  await page.goto("/documents");
  const studyCards = page.locator('[data-testid^="study-card-"]');
  await expect(studyCards.first()).toBeVisible({ timeout: 30_000 });
  const documentCards = page.locator('[data-testid^="document-card-"]');
  const expectedItems = (await studyCards.count()) + (await documentCards.count());

  await page.goto("/dashboard");
  await expect(page.getByTestId("text-total-records")).toHaveText(
    String(expectedItems),
    { timeout: 30_000 },
  );

  const timelineEntry = page.getByTestId(`timeline-item-study-${FIXTURE_STUDY_UID}`);
  await expect(timelineEntry).toHaveCount(1);
  await timelineEntry.click();
  await page.waitForURL(`**/studies/${encodeURIComponent(FIXTURE_STUDY_UID)}`);
  await expect(page.getByTestId("study-page")).toBeVisible();
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

// mini-sr-empty.dcm: a synthetic Basic Text SR with zero content items,
// built with buildMiniSr({ nodes: [] }) (plan 11) — the reference disc's
// three "Radiology Report" objects parse the same way.
const SR_EMPTY_STUDY_UID = "1.2.826.0.1.3680043.8.498.study.sr-empty";

test("shows 'Nothing to display' and no View button for an empty Basic Text SR", async ({
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
  await page.getByTestId("input-upload-title").fill("Synthetic empty report");
  await page.getByTestId("input-upload-date").fill("2026-09-12");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("button-choose-upload-files").click();
  const dialog = await chooser;
  await dialog.setFiles([path.join(fixtures, "mini-sr-empty.dcm")]);
  const uploaded = page.waitForResponse(
    (response) => response.url().includes("/api/documents") && response.request().method() === "POST",
  );
  await page.getByTestId("button-upload-submit").click();
  await uploaded;
  // See the multi-phase test above: the studies query needs a reload to
  // pick up a freshly uploaded series (a pre-existing gap, unrelated to
  // this plan).
  await page.reload();

  const studyCard = page.getByTestId(`study-card-${SR_EMPTY_STUDY_UID}`);
  await expect(studyCard).toBeVisible({ timeout: 30_000 });
  await studyCard.getByTestId(`button-open-study-${SR_EMPTY_STUDY_UID}`).click();

  await page.waitForURL(`**/studies/${encodeURIComponent(SR_EMPTY_STUDY_UID)}`);
  await expect(page.getByTestId("study-page")).toBeVisible();

  const reportRow = page.locator('[data-testid^="report-row-"]').first();
  await expect(reportRow).toBeVisible();
  await expect(reportRow.locator('[data-testid^="report-nothing-to-display-"]')).toHaveText(
    "Nothing to display — the disc's report entry is empty",
  );
  await expect(reportRow.locator('[data-testid^="button-view-report-"]')).toHaveCount(0);

  // The study header's viewable count excludes this series.
  await expect(page.getByTestId("text-study-counts")).toContainText("0 viewable");
});

test.describe("importing a folder from a hospital disc (plan 15)", () => {
  const IMPORT_STUDY_A = "1.2.826.0.1.3680043.8.498.e2e-import.study-a";
  const IMPORT_STUDY_B = "1.2.826.0.1.3680043.8.498.e2e-import.study-b";

  /** A small two-study disc folder: a 2-slice CT volume and a 1-file echo still. */
  function buildImportFolder(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "medivault-import-e2e-"));
    const studyA = path.join(dir, "ST000001", "SE000007");
    const studyB = path.join(dir, "ST000002", "SE000000");
    fs.mkdirSync(studyA, { recursive: true });
    fs.mkdirSync(studyB, { recursive: true });

    fs.writeFileSync(
      path.join(studyA, "CT000001"),
      buildMiniCtDicom({
        studyInstanceUid: IMPORT_STUDY_A,
        seriesInstanceUid: `${IMPORT_STUDY_A}.series`,
        modality: "CT",
        studyDescription: "Coronary CTA",
        seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
        sliceThickness: 0.6,
        instanceNumber: 1,
      }),
    );
    fs.writeFileSync(
      path.join(studyA, "CT000002"),
      buildMiniCtDicom({
        studyInstanceUid: IMPORT_STUDY_A,
        seriesInstanceUid: `${IMPORT_STUDY_A}.series`,
        modality: "CT",
        studyDescription: "Coronary CTA",
        seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
        sliceThickness: 0.6,
        instanceNumber: 2,
      }),
    );
    fs.writeFileSync(
      path.join(studyB, "US000001"),
      buildMiniCtDicom({
        studyInstanceUid: IMPORT_STUDY_B,
        seriesInstanceUid: `${IMPORT_STUDY_B}.series`,
        modality: "US",
        studyDescription: "Echocardiogram",
        instanceNumber: 1,
      }),
    );
    return dir;
  }

  test("picks a folder, previews two studies, and shows both as study cards after import", async ({
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

    // This test's own uploads are cleaned up below; track every document id
    // POST /api/documents hands back so nothing synthetic is left behind in
    // the shared demo account.
    const createdIds: number[] = [];
    page.on("response", (response) => {
      if (response.request().method() !== "POST" || !response.url().endsWith("/api/documents")) {
        return;
      }
      response
        .json()
        .then((body) => {
          if (typeof body?.id === "number") {
            createdIds.push(body.id);
          }
        })
        .catch(() => {});
    });

    const importFolder = buildImportFolder();

    await page.goto("/import");
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("button-choose-import-folder").click();
    const dialog = await chooser;
    await dialog.setFiles(importFolder);

    await expect(page.getByTestId("import-preview")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`import-study-${IMPORT_STUDY_A}`)).toBeVisible();
    await expect(page.getByTestId(`import-study-${IMPORT_STUDY_B}`)).toBeVisible();
    await expect(page.getByTestId("import-totals")).toContainText("2 studies");

    await page.getByTestId("button-start-import").click();
    await page.waitForURL("**/documents", { timeout: 30_000 });

    await expect(page.getByTestId(`study-card-${IMPORT_STUDY_A}`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId(`study-card-${IMPORT_STUDY_B}`)).toBeVisible({
      timeout: 30_000,
    });

    fs.rmSync(importFolder, { recursive: true, force: true });

    expect(createdIds.length).toBeGreaterThan(0);
    for (const id of createdIds) {
      await page.request.delete(`/api/documents/${id}`);
    }
  });
});

// mini-sr-report.dcm + mini-sr-report-snapshot.dcm: a synthetic Comprehensive
// SR whose one lesion's IMAGE content item references the snapshot file's
// SOP instance UID (plan 14) — mirrors the reference disc's CT Coronary
// report, which pairs a lesion TEXT identifier, NUM measurement, and IMAGE
// evidence snapshot as siblings inside one container.
const SR_REPORT_STUDY_UID = "1.2.826.0.1.3680043.8.498.study.sr-report";

test("opens a readable SR report on its own page with the measurements table and outline", async ({
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

  // Uploaded as two separate documents (not one multi-file upload) so the
  // SR's IMAGE reference resolves to a genuine sibling record's file list,
  // the same cross-document lookup the reference disc needs (the report
  // and its evidence snapshots are always separate DICOM objects there).
  await page.goto("/documents");
  for (const [title, fixture] of [
    ["Synthetic CT Coronary report", "mini-sr-report.dcm"],
    ["Synthetic CT Coronary snapshot", "mini-sr-report-snapshot.dcm"],
  ] as const) {
    await page.getByTestId("button-upload-document").click();
    await page.getByTestId("input-upload-title").fill(title);
    await page.getByTestId("input-upload-date").fill("2026-09-12");
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("button-choose-upload-files").click();
    const dialog = await chooser;
    await dialog.setFiles([path.join(fixtures, fixture)]);
    const uploaded = page.waitForResponse(
      (response) =>
        response.url().includes("/api/documents") && response.request().method() === "POST",
    );
    await page.getByTestId("button-upload-submit").click();
    await uploaded;
  }
  // See the multi-phase test above: the studies query needs a reload to
  // pick up freshly uploaded series.
  await page.reload();

  const studyCard = page.getByTestId(`study-card-${SR_REPORT_STUDY_UID}`);
  await expect(studyCard).toBeVisible({ timeout: 30_000 });
  await studyCard.getByTestId(`button-open-study-${SR_REPORT_STUDY_UID}`).click();

  await page.waitForURL(`**/studies/${encodeURIComponent(SR_REPORT_STUDY_UID)}`);
  await expect(page.getByTestId("study-page")).toBeVisible();

  // "View" on a report navigates to its own page instead of opening a
  // dialog (plan 14).
  const reportRow = page.locator('[data-testid^="report-row-"]').first();
  await expect(reportRow).toBeVisible();
  await reportRow.locator('[data-testid^="button-view-report-"]').click();

  await page.waitForURL(/\/reports\//);
  await expect(page.getByTestId("report-page")).toBeVisible();
  await expect(page.getByTestId("text-report-title")).toHaveText("CT Coronary");

  const table = page.getByTestId("sr-measurements-table");
  await expect(table).toBeVisible();
  await expect(table).toContainText("Mid LAD, 40% stenosis");
  await expect(table).toContainText("40 %");
  // The measurement's evidence snapshot resolves to its sibling record and
  // shows as a thumbnail in the table's Snapshot column.
  await expect(page.locator('[data-testid^="sr-measurement-snapshot-"]')).toBeVisible();

  await expect(page.getByTestId("report-outline-heading")).toHaveText(
    "Everything in this report",
  );
  await expect(page.getByTestId("report-outline")).toBeVisible();
  // The container is collapsed by default; a sibling TEXT item outside it
  // stays visible either way.
  await expect(page.locator('[data-testid^="report-outline-toggle-"]')).toBeVisible();
  await expect(page.getByText("No significant stenosis elsewhere.")).toBeVisible();
});
