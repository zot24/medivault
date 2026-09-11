import { useEffect, useMemo, useRef, useState } from "react";
import { useDocuments } from "@/lib/sdk";
import { ownedFileUrl } from "@/lib/owned-file";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pixelFrameFromPart10, type DicomFrame } from "@shared/dicom-frame";
import { isDicomDocument, stackDocuments } from "@shared/upload-kinds";
import type { MedicalDocument } from "@shared/schema";

type DicomSeriesViewerProps = {
  document: MedicalDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function blitFrame(canvas: HTMLCanvasElement, frame: DicomFrame) {
  canvas.width = frame.columns;
  canvas.height = frame.rows;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const image = context.createImageData(frame.columns, frame.rows);
  const low = frame.windowCenter - frame.windowWidth / 2;
  const high = frame.windowCenter + frame.windowWidth / 2;
  const span = Math.max(high - low, 1);
  for (let i = 0; i < frame.pixels.length; i++) {
    const gray = Math.max(
      0,
      Math.min(255, Math.round(((frame.pixels[i] - low) / span) * 255)),
    );
    const offset = i * 4;
    image.data[offset] = gray;
    image.data[offset + 1] = gray;
    image.data[offset + 2] = gray;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

export default function DicomSeriesViewer({
  document: focus,
  open,
  onOpenChange,
}: DicomSeriesViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [frames, setFrames] = useState<DicomFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { data: vault = [] } = useDocuments(undefined, { enabled: open });

  const stack = useMemo(() => {
    if (!focus || !isDicomDocument(focus)) {
      return [];
    }
    return stackDocuments(focus, vault);
  }, [focus, vault]);

  useEffect(() => {
    if (!open || stack.length === 0) {
      setFrames([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setSliceIndex(0);
    setError(null);

    (async () => {
      const loaded: DicomFrame[] = [];
      for (const row of stack) {
        const response = await fetch(ownedFileUrl(row.filePath), {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`Could not load ${row.fileName}`);
        }
        const frame = pixelFrameFromPart10(new Uint8Array(await response.arrayBuffer()));
        if (!frame) {
          throw new Error(
            `${row.fileName} is not an uncompressed CT slice this spike can draw.`,
          );
        }
        loaded.push(frame);
      }
      if (!cancelled) {
        setFrames(loaded);
      }
    })().catch((caught: unknown) => {
      if (!cancelled) {
        setFrames([]);
        setError(caught instanceof Error ? caught.message : "Could not load series");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, stack]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frames[sliceIndex];
    if (!canvas || !frame) {
      return;
    }
    blitFrame(canvas, frame);
  }, [frames, sliceIndex]);

  const label = stack[sliceIndex]?.fileName ?? focus?.fileName ?? "DICOM";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl"
        data-testid="dicom-series-viewer"
      >
        <DialogHeader>
          <DialogTitle>{focus?.title ?? "CT series"}</DialogTitle>
          <DialogDescription>
            In-app CT spike. Scroll or use the slider to move through slices.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" data-testid="dicom-viewer-error">
            {error}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center bg-black rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[70vh]"
                data-testid="dicom-viewer-canvas"
                onWheel={(event) => {
                  if (frames.length < 2) {
                    return;
                  }
                  event.preventDefault();
                  const delta = event.deltaY > 0 ? 1 : -1;
                  setSliceIndex((current) =>
                    Math.max(0, Math.min(frames.length - 1, current + delta)),
                  );
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground-muted" htmlFor="dicom-slice">
                Slice {frames.length === 0 ? 0 : sliceIndex + 1} of {frames.length} ({label})
              </label>
              <input
                id="dicom-slice"
                type="range"
                min={0}
                max={Math.max(frames.length - 1, 0)}
                value={sliceIndex}
                disabled={frames.length < 2}
                onChange={(event) => setSliceIndex(Number(event.target.value))}
                className="w-full"
                data-testid="dicom-slice-slider"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
