import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

import { hasBarcodeCameraAccess } from "../device";
import { useTranslation } from "../i18n";

type BarcodeScannerProps = {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
};

export function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | null = null;
    let active = true;

    setError(null);

    void (async () => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      if (!hasBarcodeCameraAccess()) {
        setError(window.isSecureContext ? t("barcodeScanFailed") : t("barcodeScanRequiresHttps"));
        return;
      }

      try {
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            if (!active || !result) {
              return;
            }

            active = false;
            controls?.stop();
            onScanRef.current(result.getText());
          }
        );
      } catch (scanError) {
        if (active) {
          setError(scanError instanceof Error ? scanError.message : t("barcodeScanFailed"));
        }
      }
    })();

    return () => {
      active = false;
      controls?.stop();
    };
  }, [open, t]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop barcode-scanner-backdrop" onClick={onClose}>
      <div
        className="barcode-scanner"
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="close" aria-label={t("cancel")} onClick={onClose}>
          x
        </button>
        <p className="eyebrow">{t("quickAdd")}</p>
        <h2 id="barcode-scanner-title">{t("scanBarcode")}</h2>
        <p className="scanner-hint">{t("scanBarcodeHint")}</p>
        <div className="barcode-scanner-viewport">
          <video ref={videoRef} muted playsInline />
        </div>
        {error && (
          <p className="scanner-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
