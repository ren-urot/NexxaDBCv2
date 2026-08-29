import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { X } from "lucide-react";

interface Props {
  onScan: (data: string) => void;
  onClose: () => void;
}

// getUserMedia rejects with a DOMException whose name tells us why, worth
// distinguishing since "no camera" and "permission denied" need different
// instructions, and a denied permission usually needs the user to go
// change a setting outside this page entirely, not just retry.
function messageFor(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") {
    return "Camera access is blocked for this site. Open your browser or phone's site settings, allow Camera for NexxaDBC, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError") {
    return "Your camera is already in use by another app. Close it and try again.";
  }
  return "Camera access was denied or isn't available.";
}

export default function QrScannerModal({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!videoRef.current) return;
    let cancelled = false;
    setError(null);
    QrScanner.hasCamera().then((has) => {
      if (!cancelled && !has) setError("No camera found on this device.");
    });
    const scanner = new QrScanner(videoRef.current, (result) => onScanRef.current(result.data), {
      highlightScanRegion: true,
      highlightCodeOutline: true,
      preferredCamera: "environment",
    });
    scanner.start().catch((err) => {
      if (!cancelled) setError(messageFor(err));
    });
    return () => {
      cancelled = true;
      scanner.stop();
      scanner.destroy();
    };
  }, [attempt]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6">
      <button
        onClick={onClose}
        className="absolute top-5 right-5 text-white/70 hover:text-white transition-colors"
      >
        <X size={24} />
      </button>
      <video ref={videoRef} className="w-full max-w-sm rounded-lg overflow-hidden" muted playsInline />
      {error ? (
        <div className="flex flex-col items-center gap-4 mt-6">
          <div className="text-red-400 text-sm text-center max-w-xs">{error}</div>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="text-xs tracking-widest uppercase border border-white/30 text-white px-5 py-2.5 hover:border-white transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : (
        <p className="text-white/60 text-xs mt-6 text-center">
          Point your camera at someone's NexxaDBC card QR code
        </p>
      )}
    </div>
  );
}
