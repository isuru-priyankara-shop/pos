"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const REGION_ID = "camera-scanner-region";

export function CameraScanner({
  open,
  onOpenChange,
  onScan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (barcode: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="sm:max-w-md">
          <CameraScannerBody
            key="cam"
            onScan={onScan}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function CameraScannerBody({
  onScan,
  onClose,
}: {
  onScan: (barcode: string) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<"starting" | "scanning" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    let stopped = false;
    let decoded = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (stopped) return;
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          setState("error");
          setErrorMsg("Camera is not supported on this browser — use a hardware scanner instead.");
          return;
        }
        const scanner = new Html5Qrcode(REGION_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 110 } },
          (decodedText) => {
            if (stopped || decoded) return;
            decoded = true;
            const code = decodedText.trim();
            if (code) onScanRef.current(code);
            onCloseRef.current();
          },
          () => {
            /* per-frame miss — keep scanning */
          }
        );
        if (!stopped) setState("scanning");
      } catch (err) {
        if (stopped) return;
        setState("error");
        setErrorMsg(
          err instanceof DOMException
            ? "Camera permission denied — allow camera access for this site and try again."
            : err instanceof Error
              ? err.message
              : "Could not start the camera."
        );
      }
    })();

    return () => {
      stopped = true;
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Scan with camera</DialogTitle>
        <DialogDescription>Point the camera at a product barcode — it is added to the sale instantly.</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="overflow-hidden rounded-lg border bg-black">
          <div id={REGION_ID} className="min-h-56" />
        </div>

        {state === "starting" && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Starting camera…
          </p>
        )}
        {state === "error" && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>
        )}
        {state === "scanning" && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Camera className="size-4 text-emerald-600" /> Scanning… hold steady over the barcode.
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}
