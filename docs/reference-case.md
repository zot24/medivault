# Reference case: a cardiac work-up on one hospital CD

This is the anonymized description of the real patient disc used for local development of the DICOM upload and viewer. It exists so that anyone working on imaging features knows what the system has to represent, what each series is for, and which parts draw today.

**The data itself is not in this repository and must never be.** It lives on one developer machine, loaded into a local Supabase under a local-only test account. Everything below is derived from DICOM headers with every identifier removed: no name, birth date, patient or accession ID, physician, institution, study date, or instance UIDs. Scanner models, protocol names, slice counts, and transfer syntaxes are kept because they are what the code has to handle.

## The disc

A standard patient CD as issued by a hospital PACS. Three studies from the same day, all cardiac, 2.5 GB, 7,615 DICOM files.

```
/
├── DICOMDIR                    index file (not an image)
├── Studies_List.txt            human-readable index; unreliable field mapping
├── Autorun.inf, launch.bat     Windows autorun
├── *.exe, *.dmg, *.webloc      bundled viewers for Windows and macOS
├── *.pdf                       viewer install instructions
├── res/                        viewer resources
└── viewers/
    ├── weasis/, Lut/, Help/    bundled Weasis viewer
    ├── ST000001/SE000001/      study 1 — catheterization (XA)
    ├── ST000002/SE000000/      study 2 — echocardiogram (US)
    └── ST000003/SE0000xx …     study 3 — coronary CT angiography (CT + SR), 32 series
```

Rules of thumb that generalise to other discs:

- `STnnnnnn` = one study, `SEnnnnnn` = one series. A series is the unit users upload.
- Image files usually have no extension (`CT000001`, `XA000001`, `US000001`). They are Part-10 DICOM: `DICM` at byte 128.
- The index text file had the physician's name in the "Body Part Examined" field and a Java-serialized date. Trust headers, not the index.

## Study A — Coronary CT angiography

| | |
|---|---|
| Modality | CT (plus SR reports) |
| Scanner | Siemens SOMATOM Force, dual-source |
| Series | 32 |
| Files | 7,556 |
| Size | 1.8 GB |
| Pixel format | 512×512, 16-bit stored / 12-bit used, unsigned, MONOCHROME2 |
| Rescale | intercept −1024, slope 1 (stored value → HU) |
| Window presets in header | two per file, e.g. `WindowCenter = "345\-600"`, `WindowWidth = "1215\1300"` |
| Transfer syntax | JPEG Lossless SV1 (`1.2.840.10008.1.2.4.70`) for images; RLE (`1.2.840.10008.1.2.5`) for one RGB series; explicit little-endian for SR |
| Coverage | ~23 cm craniocaudal, heart and surroundings; 0.4 mm pixels; 90 kVp; iodinated contrast |

The 32 series fall into four groups.

### A1. Image volumes — the scan itself

| Series | Description (protocol string) | Slices | Thickness | Role |
|---|---|---|---|---|
| 1 | `Topograma 1.0 Tr20` | 1 | — | Scout / localizer used to plan the scan |
| **7** | `DS_CorCTA 0.6 Bv40 3 BestDiast 77 %` | **774** | 0.6 mm | **Primary diagnostic volume.** Best diastolic phase, thin slices. The series to open first. |
| 9 | `DS_CorCTA 0.6 Bv40 3 BestSyst 27 %` | 774 | 0.6 mm | Same volume at the best systolic phase |
| 5 | `DS_CorCTA 3.0 Bv36 3 BestDiast 77 %` | 78 | 3 mm | Thick-slice, soft kernel — quick overview |
| 6 | `DS_CorCTA 3.0 Br64 3 BestDiast 77 %` | 78 | 3 mm | Thick-slice, sharp kernel — bone and calcium |
| **8** | `DS_CorCTA 0.75 Bv40 3 10 - 100 %` | **5,800** | 0.75 mm | **Full cardiac cycle: 10 phases × 580 slices.** Input for function analysis (ejection fraction, wall motion). 1.38 GB — three quarters of the study. |

`Bv40`/`Bv36`/`Br64` are Siemens reconstruction kernels (vascular soft, soft, sharp). `77 %` and `27 %` are the position in the R–R interval. All are axial, ORIGINAL/PRIMARY.

### A2. Reader's measurement snapshots

17 single-image series (numbers 1062–1174), each a secondary-capture MPR with a distance line or freehand ROI drawn on a coronary segment at a given phase: seven at 77 %, three at 40 %, four at 30 %, one at 90 %, two more at 77 %. Sizes vary (512×570 to 580×607), 0.3–0.4 MB each, 0.3 mm nominal thickness, DERIVED/SECONDARY/MPR, JPEG Lossless mono. These are what the reporting radiologist saved while measuring.

### A3. Analysis output

| Series | Description | Files | Format |
|---|---|---|---|
| 1178 | `Cardiac_Function_Global_Findings_1` | 18 | 510×978, 8-bit RGB, RLE — charts and tables from the cardiac-function tool |
| 502 | `Protocolo de paciente` | 1 | 512×512 mono — dose sheet |

### A4. Structured reports — no pixels

| Series | SOP class | Title |
|---|---|---|
| 1015 | Comprehensive SR | Diagnostic Imaging Report (MM Reading) |
| 1025 | Comprehensive SR | Cardiovascular Analysis — CT Calcium Scoring |
| 1034 | Comprehensive SR | Cardiovascular Analysis — Cardiac Function (21 MB, embeds evidence images) |
| 1043 | Comprehensive SR | Cardiovascular Analysis — CT Coronary (58 MB, embeds evidence images) |
| 1975 (×3 folders) | Basic Text SR | Radiology Report — the written report |

## Study B — Transthoracic echocardiogram

| | |
|---|---|
| Modality | US |
| Scanner | GE Vingmed Vivid E95 |
| Series / files | 1 / 56 — 45 cine loops, 11 still frames; 2,684 frames in total |
| Size | 337 MB |
| Pixel format | 708×1016, 8-bit, YBR_FULL_422 (colour) |
| Transfer syntax | JPEG Baseline (`1.2.840.10008.1.2.4.50`) |

Multi-frame objects: one file is one loop of tens of frames, not one image.

## Study C — Cardiac catheterization

| | |
|---|---|
| Modality | XA |
| Scanner | GE angiography system |
| Series / files | 1 / 3 — cine runs of 108, 92, and 98 frames at 15 fps |
| Size | 284 MB (≈100 MB per file) |
| Pixel format | 1000×1000, 8-bit, MONOCHROME2 |
| Transfer syntax | Implicit little-endian (uncompressed) |

## What MediVault can show today

Checked against `shared/dicom-frame.ts` and the 50 MB per-file cap in `shared/upload-kinds.ts`.

| Group | Status | Why |
|---|---|---|
| A1 volumes 1, 5, 6, 7, 9 | Draws | JPEG Lossless mono16 decoder; HU windowing with presets; one record per series; progressive load |
| A1 volume 8 (5,800 slices) | Draws, slowly | Same format. Upload is 116 batches; the viewer keeps every decoded slice in memory (~3 GB). Needs an LRU and a phase selector before it is usable. |
| A2 snapshots, A3 dose sheet | Draws | Single JPEG Lossless mono images |
| A3 function charts | Draws | RLE 8-bit RGB — added in #20 |
| A4 structured reports | Uploads, does not draw | No pixel data; nothing renders SR content yet |
| B echo | Does not draw | JPEG Baseline is not decoded; multi-frame is not stepped through |
| C cath | Cannot upload | Files exceed the 50 MB cap; multi-frame |

Status of the local experiment:

- **Loaded:** A1 series 7, as one record of 774 files. This is the case behind the HU windowing fix, the one-record-per-series model, and progressive loading (#22).
- **Next, in order:** A2 snapshots and A3 charts (mixed single images, RGB path); A1 series 5/6/9 (several series under one study — motivates a study-level grouping); A1 series 8 (memory and 4D); then B and C as decoder and cap work.

## Regenerating this inventory

The tables were produced from headers only, with `pydicom` and `stop_before_pixels=True`, walking `viewers/ST*/SE*`. Per series: Modality, SeriesNumber, SeriesDescription, Rows/Columns, SliceThickness, ImageType, TransferSyntaxUID, PhotometricInterpretation, BitsStored, NumberOfFrames, and the count of ImagePositionPatient values (which is how "10 phases × 580 slices" was inferred for series 8). Keep any such script and its output outside the repository, or strip the identifying tags before committing.
