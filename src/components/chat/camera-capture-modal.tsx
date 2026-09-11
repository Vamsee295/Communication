import { useCallback, useEffect, useRef, useState } from "react";
import { X, Camera, FlipHorizontal, RotateCcw, Send } from "lucide-react";

interface CameraCaptureModalProps {
  onCapture: (file: File, caption?: string) => void;
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
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const startStream = useCallback(async (mode: "user" | "environment") => {
    // Stop any existing stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
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
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
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
    setCaption("");
    setPhase("viewfinder");
    startStream(facingMode);
  };

  const sendPhoto = () => {
    if (!capturedFile) return;
    onCapture(capturedFile, caption.trim() || undefined);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3 z-10 bg-gradient-to-b from-black/80 to-transparent">
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors"
          aria-label="Close camera"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-semibold text-white">
          {phase === "viewfinder" ? "Camera" : "Preview"}
        </h2>
        {phase === "viewfinder" && hasMultipleCameras ? (
          <button
            type="button"
            onClick={flipCamera}
            className="grid h-10 w-10 place-items-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors"
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
              type="button"
              onClick={() => startStream(facingMode)}
              className="mt-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30 transition-colors"
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
            className="max-h-full max-w-full object-contain select-none"
          />
        )}

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </div>

      {/* Controls & Optional Caption */}
      <div className="shrink-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 px-4 z-10 bg-gradient-to-t from-black/80 to-transparent">
        {phase === "viewfinder" ? (
          <div className="flex items-center justify-center py-2">
            {/* Capture button */}
            <button
              type="button"
              onClick={capturePhoto}
              disabled={!!error}
              className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 hover:bg-white/30 disabled:opacity-40 transition-all active:scale-95 shadow-lg"
              aria-label="Take photo"
            >
              <div className="h-10 w-10 rounded-full bg-white" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
            {/* Caption input */}
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption..."
              className="w-full rounded-2xl bg-white/15 px-4 py-2 text-sm text-white placeholder:text-white/50 border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <div className="flex items-center justify-between px-6 pt-1">
              {/* Retake */}
              <button
                type="button"
                onClick={retake}
                className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/30 transition-colors"
                aria-label="Retake photo"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Retake</span>
              </button>

              {/* Send */}
              <button
                type="button"
                onClick={sendPhoto}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-lg transition-opacity"
                aria-label="Send photo"
              >
                <span>Send</span>
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
