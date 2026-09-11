import React, { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Send, Mic, ChevronDown, Check } from "lucide-react";

interface VoiceRecorderProps {
  onSend: (blob: Blob, mimeType: string, durationMs: number) => void;
  onCancel: () => void;
}

export interface AudioDeviceItem {
  deviceId: string;
  label: string;
}

const PREFERRED_MIC_KEY = "ghostline_preferred_mic_id";
let globalSessionId = 0;

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const sec = (totalSec % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/wav",
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(24).fill(12));
  const [deviceList, setDeviceList] = useState<AudioDeviceItem[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    return localStorage.getItem(PREFERRED_MIC_KEY) || "";
  });
  const [activeDeviceLabel, setActiveDeviceLabel] = useState<string>("Microphone");
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [hasSignal, setHasSignal] = useState(false);

  const sessionIdRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("");
  const durationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const maxRmsRef = useRef<number>(0);

  // Track intent when stopping
  const actionIntentRef = useRef<"send" | "cancel" | null>(null);

  // Teardown everything from previous sessions completely
  const teardownActiveSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== "closed") {
        try { void audioCtxRef.current.close(); } catch {}
      }
      audioCtxRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
      if (mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      streamRef.current = null;
    }
  }, []);

  // --- Start Recording Session ---
  const startRecording = useCallback(async (forcedDeviceId?: string) => {
    teardownActiveSession();
    
    const sessionId = ++globalSessionId;
    sessionIdRef.current = sessionId;

    actionIntentRef.current = null;
    maxRmsRef.current = 0;
    chunksRef.current = [];
    setHasSignal(false);

    try {
      // Step 1: Initial permission probe to unlock device labels if not already unlocked
      let initialStream: MediaStream | null = null;
      try {
        initialStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
          },
        });
      } catch (err) {
        console.error("[Ghostline Audio Diagnostic] Microphone permission denied:", err);
        onCancel();
        return;
      }

      if (sessionId !== sessionIdRef.current) {
        initialStream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Step 2: Now that permission is granted, enumerate devices with populated labels
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs: AudioDeviceItem[] = allDevices
        .filter((d) => d.kind === "audioinput")
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${idx + 1}`,
        }));

      setDeviceList(audioInputs);

      // Step 3: Determine the best microphone deviceId
      let targetDeviceId = forcedDeviceId || selectedDeviceId || localStorage.getItem(PREFERRED_MIC_KEY) || "";

      // Validate targetDeviceId still exists
      const targetExists = audioInputs.some((d) => d.deviceId === targetDeviceId);
      if (!targetDeviceId || !targetExists) {
        // Find best physical device
        const realtekDevice = audioInputs.find((d) =>
          d.label.toLowerCase().includes("realtek") ||
          d.label.toLowerCase().includes("microphone array")
        );
        const physicalDevice = audioInputs.find((d) =>
          !d.label.toLowerCase().includes("steam") &&
          !d.label.toLowerCase().includes("virtual") &&
          !d.label.toLowerCase().includes("stereo mix")
        );
        const bestDevice = realtekDevice || physicalDevice || audioInputs[0];
        if (bestDevice) {
          targetDeviceId = bestDevice.deviceId;
          setSelectedDeviceId(targetDeviceId);
          localStorage.setItem(PREFERRED_MIC_KEY, targetDeviceId);
        }
      }

      // Step 4: Check if the initial stream is already using targetDeviceId
      let activeStream = initialStream;
      const initialTrack = initialStream.getAudioTracks()[0];
      const initialTrackSettings = initialTrack?.getSettings?.() || {};

      if (targetDeviceId && initialTrackSettings.deviceId !== targetDeviceId) {
        // Switch to the target device
        initialStream.getTracks().forEach((t) => t.stop());
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: targetDeviceId },
              echoCancellation: true,
              noiseSuppression: false,
              autoGainControl: true,
            },
          });
        } catch (exactErr) {
          console.warn("[Ghostline Audio Diagnostic] Exact device constraint fallback:", exactErr);
          activeStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { ideal: targetDeviceId },
              echoCancellation: true,
              noiseSuppression: false,
              autoGainControl: true,
            },
          });
        }
      }

      if (sessionId !== sessionIdRef.current) {
        activeStream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = activeStream;
      const audioTrack = activeStream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error("No audio track in media stream");
      }

      const currentLabel = audioTrack.label || "Microphone";
      setActiveDeviceLabel(currentLabel);

      console.log("[Ghostline Audio Diagnostic] Active Microphone Established:", {
        device: currentLabel,
        deviceId: audioTrack.getSettings?.().deviceId || targetDeviceId,
        readyState: audioTrack.readyState,
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        sampleRate: audioTrack.getSettings?.().sampleRate,
        channelCount: audioTrack.getSettings?.().channelCount,
      });

      // Step 5: Web Audio API Analyser for real-time live RMS energy calculation & frequency visualizer
      try {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          const audioCtx = new AudioCtxClass();
          audioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(activeStream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.3;
          source.connect(analyser);

          const freqData = new Uint8Array(analyser.frequencyBinCount);
          const timeData = new Float32Array(analyser.fftSize);
          let lastRmsLog = 0;

          const updateVisualizer = () => {
            if (sessionId !== sessionIdRef.current) return;
            if (audioCtx.state === "suspended") {
              void audioCtx.resume();
            }

            // Real frequency data for visualizer bars
            analyser.getByteFrequencyData(freqData);
            const levels = Array.from({ length: 24 }).map((_, i) => {
              const binIndex = Math.floor((i / 24) * freqData.length);
              const val = freqData[binIndex] || 0;
              return Math.max(12, Math.min(100, (val / 255) * 100));
            });
            setAudioLevels(levels);

            // Real Time-Domain RMS energy calculation
            analyser.getFloatTimeDomainData(timeData);
            let sumSq = 0;
            for (let i = 0; i < timeData.length; i++) {
              sumSq += timeData[i] * timeData[i];
            }
            const rms = Math.sqrt(sumSq / timeData.length);
            if (rms > maxRmsRef.current) {
              maxRmsRef.current = rms;
            }

            if (rms > 0.005) {
              setHasSignal(true);
            }

            animFrameRef.current = requestAnimationFrame(updateVisualizer);
          };

          animFrameRef.current = requestAnimationFrame(updateVisualizer);
        }
      } catch (err) {
        console.warn("[Ghostline Audio Diagnostic] Audio visualizer initialization warning:", err);
      }

      // Step 6: MediaRecorder initialization
      const mime = getSupportedMimeType();
      const mr = new MediaRecorder(activeStream, mime ? { mimeType: mime } : undefined);
      mimeRef.current = mime || mr.mimeType;
      mediaRecorderRef.current = mr;
      startTimeRef.current = Date.now();

      mr.ondataavailable = (ev) => {
        if (sessionId !== sessionIdRef.current) return;
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      mr.onstop = () => {
        if (sessionId !== sessionIdRef.current) return;

        const capturedChunks = [...chunksRef.current];
        const finalBlob = new Blob(capturedChunks, { type: mimeRef.current });
        
        console.log("[Ghostline Audio Diagnostic] Final Recording Assembled:", {
          size: finalBlob.size,
          type: finalBlob.type,
          chunks: capturedChunks.length,
          durationMs: durationRef.current,
          peakRms: maxRmsRef.current.toFixed(5),
          device: currentLabel,
        });

        teardownActiveSession();

        if (actionIntentRef.current === "send") {
          onSend(finalBlob, mimeRef.current, durationRef.current);
        } else {
          onCancel();
        }
      };

      mr.start(200); // 200ms timeslices
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (sessionId === sessionIdRef.current) {
          setElapsedMs(Date.now() - startTimeRef.current);
        }
      }, 100);
    } catch (err) {
      console.error("[Ghostline Audio Diagnostic] Error initializing recording:", err);
      teardownActiveSession();
      onCancel();
    }
  }, [selectedDeviceId, teardownActiveSession, onSend, onCancel]);

  useEffect(() => {
    void startRecording();
    return () => {
      teardownActiveSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeviceChange = (devId: string) => {
    setSelectedDeviceId(devId);
    localStorage.setItem(PREFERRED_MIC_KEY, devId);
    setShowDeviceMenu(false);
    void startRecording(devId);
  };

  const handleCancel = () => {
    actionIntentRef.current = "cancel";
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      teardownActiveSession();
      onCancel();
    }
  };

  const handleSend = () => {
    actionIntentRef.current = "send";
    durationRef.current = elapsedMs;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.requestData();
        }
      } catch {}
      mediaRecorderRef.current.stop();
    } else {
      teardownActiveSession();
      onCancel();
    }
  };

  return (
    <div className="relative flex flex-col gap-1.5 w-full max-w-full">
      {/* Device Switcher Menu Popup */}
      {showDeviceMenu && deviceList.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDeviceMenu(false)} />
          <div className="glass absolute bottom-14 left-12 z-50 w-72 overflow-hidden rounded-2xl border border-border bg-popover/95 p-2 shadow-2xl backdrop-blur-xl animate-scale-in">
            <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Select Microphone
            </p>
            <div className="flex flex-col gap-1 mt-1 max-h-60 overflow-y-auto">
              {deviceList.map((dev) => {
                const isSelected = dev.deviceId === selectedDeviceId || dev.label === activeDeviceLabel;
                return (
                  <button
                    key={dev.deviceId || dev.label}
                    type="button"
                    onClick={() => handleDeviceChange(dev.deviceId)}
                    className={[
                      "flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition",
                      isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-foreground/5 text-foreground",
                    ].join(" ")}
                  >
                    <span className="truncate pr-2">{dev.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 px-1 w-full max-w-full">
        {/* Cancel */}
        <button
          type="button"
          onClick={handleCancel}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-destructive transition-colors"
          aria-label="Discard voice message"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        {/* Real-time live audio waveform visualizer + timer */}
        <div className="flex flex-1 min-w-0 items-center gap-2 overflow-hidden rounded-2xl glass px-3 py-2">
          {/* Pulsing indicator (turns green when voice signal is detected, red when quiet) */}
          <span className="relative flex h-2.5 w-2.5 shrink-0" title={hasSignal ? "Voice signal detected" : "Listening..."}>
            <span className={["absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", hasSignal ? "bg-emerald-400" : "bg-red-400"].join(" ")} />
            <span className={["relative inline-flex h-2.5 w-2.5 rounded-full", hasSignal ? "bg-emerald-500" : "bg-red-500"].join(" ")} />
          </span>

          {/* Real-time Audio Frequency Bars */}
          <div className="flex flex-1 items-end gap-[2px] overflow-hidden h-6" aria-hidden>
            {audioLevels.map((level, i) => (
              <div
                key={i}
                className={["flex-1 rounded-full transition-all duration-75 ease-out", hasSignal ? "bg-primary" : "bg-primary/50"].join(" ")}
                style={{
                  height: `${level}%`,
                }}
              />
            ))}
          </div>

          <span className="shrink-0 text-xs font-mono tabular-nums text-foreground">
            {formatDuration(elapsedMs)}
          </span>

          {/* Microphone device switcher button */}
          {deviceList.length > 1 && (
            <button
              type="button"
              onClick={() => setShowDeviceMenu(!showDeviceMenu)}
              className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-foreground/10 transition max-w-[130px]"
              title={`Selected: ${activeDeviceLabel}`}
            >
              <Mic className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{activeDeviceLabel.replace(/\s*\([^)]*\)/g, "") || "Mic"}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </button>
          )}
        </div>

        {/* Send */}
        <button
          type="button"
          onClick={handleSend}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow glow-primary hover:opacity-90 transition-opacity"
          aria-label="Send voice message"
        >
          <Send className="h-4 w-4 translate-x-px" />
        </button>
      </div>
    </div>
  );
}
