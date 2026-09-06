import { useEffect, useState } from "react";

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";

export function shouldAutofocusForms(): boolean {
  return typeof window !== "undefined" && !window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function canUseMobileBarcodeScan(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia(MOBILE_MEDIA_QUERY).matches ||
    window.matchMedia(COARSE_POINTER_QUERY).matches ||
    navigator.maxTouchPoints > 0
  );
}

export function hasBarcodeCameraAccess(): boolean {
  return Boolean(typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia);
}

export function useCanScanBarcode(): boolean {
  const [canScan, setCanScan] = useState(canUseMobileBarcodeScan);

  useEffect(() => {
    const mobileQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const pointerQuery = window.matchMedia(COARSE_POINTER_QUERY);

    function update() {
      setCanScan(canUseMobileBarcodeScan());
    }

    update();
    mobileQuery.addEventListener("change", update);
    pointerQuery.addEventListener("change", update);
    return () => {
      mobileQuery.removeEventListener("change", update);
      pointerQuery.removeEventListener("change", update);
    };
  }, []);

  return canScan;
}
