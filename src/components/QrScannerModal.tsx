import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { X } from "lucide-react";

interface Props {
  onScan: (data: string) => void;
  onClose: () => void;
}

export default function QrScannerModal({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    QrScanner.hasCamera().then((has) => {
      if (!has) setError("No camera found on this device.");
    });
    const scanner = new QrScanner(videoRef.current, (result) => onScanRef.current(result.data), {
      highlightScanRegion: true,
      highlightCodeOutline: true,
      preferredCamera: "environment",
    });
    scanner.start().catch(() => setError("Camera access was denied or isn't available."));
    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, []);

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
        <div className="text-red-400 text-sm mt-6 text-center max-w-xs">{error}</div>
      ) : (
        <p className="text-white/60 text-xs mt-6 text-center">
          Point your camera at someone's NexxaDBC card QR code
        </p>
      )}
    </div>
  );
}
