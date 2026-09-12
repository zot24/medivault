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
import {
  describeUndrawableFrame,
  pixelFrameFromPart10,
  rgbaFromFrame,
  type DicomFrame,
} from "@shared/dicom-frame";
import {
  focusSliceIndex,
  isDicomDocument,
  sliceDeltaFromKey,
  stackDocuments,
  stepSliceIndex,
} from "@shared/upload-kinds";
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
  image.data.set(rgbaFromFrame(frame));
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
    if (!open || !focus || stack.length === 0) {
      setFrames([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setSliceIndex(focusSliceIndex(focus, stack));
    setError(null);

    (async () => {
      const loaded: DicomFrame[] = [];
      for (const row of stack) {
        const response = await fetch(ownedFileUrl(row.filePath), {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Could not load this file.");
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const frame = pixelFrameFromPart10(bytes);
        if (!frame) {
          throw new Error(describeUndrawableFrame(bytes));
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
  }, [open, focus, stack]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frames[sliceIndex];
    if (!canvas || !frame) {
      return;
    }
    blitFrame(canvas, frame);
  }, [frames, sliceIndex]);

  const sliceLabel =
    frames.length === 0 ? "0 / 0" : `${sliceIndex + 1} / ${frames.length}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl"
        data-testid="dicom-series-viewer"
        onKeyDown={(event) => {
          const delta = sliceDeltaFromKey(event.key);
          if (delta == null || frames.length < 2) {
            return;
          }
          event.preventDefault();
          setSliceIndex((current) =>
            stepSliceIndex(current, delta, frames.length),
          );
        }}
      >
        <DialogHeader>
          <DialogTitle>{focus?.title ?? "DICOM series"}</DialogTitle>
          <DialogDescription>
            Stay in this dialog. Use the slider, the mouse wheel, or the arrow
            keys to move through slices.
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
                    stepSliceIndex(current, delta, frames.length),
                  );
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground-muted" htmlFor="dicom-slice">
                Slice{" "}
                <span data-testid="dicom-slice-index">{sliceLabel}</span>
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
