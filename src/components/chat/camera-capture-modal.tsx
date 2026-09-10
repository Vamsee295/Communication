import { useCallback, useEffect, useRef, useState } from "react";
import { X, Camera, FlipHorizontal, RotateCcw, Send } from "lucide-react";

interface CameraCaptureModalProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

type Phase = "viewfinder" | "preview";

export function CameraCaptureModal({ onCapture, onClose }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("viewfinder");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const startStream = useCallback(async (mode: "user" | "environment") => {
    // Stop any existing stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      // Check for multiple cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setHasMultipleCameras(videoDevices.length > 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setError("Camera permission denied. Please allow camera access and try again.");
      } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
        setError("No camera found on this device.");
      } else {
        setError("Unable to access camera. Please try again.");
      }
    }
  }, []);

  useEffect(() => {
    startStream(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flipCamera = () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    startStream(newMode);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        setCapturedFile(file);
        setPreviewUrl(url);
        setPhase("preview");
        // Stop camera during preview
        streamRef.current?.getTracks().forEach((t) => t.stop());
      },
      "image/jpeg",
      0.92,
    );
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedFile(null);
    setPhase("viewfinder");
    startStream(facingMode);
  };

  const sendPhoto = () => {
    if (!capturedFile) return;
    onCapture(capturedFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close camera"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-semibold text-white">
          {phase === "viewfinder" ? "Camera" : "Preview"}
        </h2>
        {phase === "viewfinder" && hasMultipleCameras ? (
          <button
            onClick={flipCamera}
            className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Flip camera"
          >
            <FlipHorizontal className="h-5 w-5" />
          </button>
        ) : (
          <div className="h-10 w-10" />
        )}
      </div>

      {/* Viewfinder / preview */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <Camera className="h-10 w-10 text-white/40" />
            <p className="text-sm text-white/70">{error}</p>
            <button
              onClick={() => startStream(facingMode)}
              className="mt-2 rounded-full bg-white/20 px-4 py-2 text-sm text-white hover:bg-white/30 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live camera feed */}
        {phase === "viewfinder" && !error && (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
          />
        )}

        {/* Captured preview */}
        {phase === "preview" && previewUrl && (
          <img
            src={previewUrl}
            alt="Captured photo preview"
            className="max-h-full max-w-full object-contain"
          />
        )}

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </div>

      {/* Controls */}
      <div className="shrink-0 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
        {phase === "viewfinder" ? (
          <div className="flex items-center justify-center">
            {/* Capture button */}
            <button
              onClick={capturePhoto}
              disabled={!!error}
              className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 hover:bg-white/30 disabled:opacity-40 transition-all active:scale-95"
              aria-label="Take photo"
            >
              <div className="h-10 w-10 rounded-full bg-white" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-12">
            {/* Retake */}
            <button
              onClick={retake}
              className="flex flex-col items-center gap-1.5"
              aria-label="Retake photo"
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors">
                <RotateCcw className="h-5 w-5" />
              </div>
              <span className="text-[11px] text-white/70">Retake</span>
            </button>

            {/* Send */}
            <button
              onClick={sendPhoto}
              className="flex flex-col items-center gap-1.5"
              aria-label="Send photo"
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-lg">
                <Send className="h-5 w-5" />
              </div>
              <span className="text-[11px] text-white/70">Send</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
