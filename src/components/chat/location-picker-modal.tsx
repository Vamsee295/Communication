import { useState, useEffect } from "react";
import { X, MapPin, Send, Loader2, Navigation, AlertCircle } from "lucide-react";

interface LocationPickerModalProps {
  onClose: () => void;
  onSendLocation: (location: { latitude: number; longitude: number; label?: string }) => void;
}

export function LocationPickerModal({ onClose, onSendLocation }: LocationPickerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [label, setLabel] = useState("");

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setError(err.message || "Failed to retrieve location");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  useEffect(() => {
    requestCurrentLocation();
  }, []);

  const handleSend = () => {
    if (!coords) return;
    onSendLocation({
      latitude: coords.latitude,
      longitude: coords.longitude,
      label: label.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Share Location</h3>
              <p className="text-xs text-muted-foreground">Send your current coordinates</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs font-medium text-muted-foreground">Acquiring GPS position…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Location access failed</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{error}</p>
              </div>
              <button
                type="button"
                onClick={requestCurrentLocation}
                className="mt-1 flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
              >
                <Navigation className="h-3.5 w-3.5" /> Try Again
              </button>
            </div>
          ) : coords ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span>Coordinates Detected</span>
                </div>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                  {coords.latitude.toFixed(5)}°, {coords.longitude.toFixed(5)}°
                </p>
              </div>

              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Optional Label / Place Name
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Current Spot, Coffee Shop…"
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-xs outline-none focus:border-primary"
                />
              </div>

              <button
                type="button"
                onClick={handleSend}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-xs font-bold text-primary-foreground shadow glow-primary hover:opacity-95 transition active:scale-[0.99]"
              >
                <Send className="h-4 w-4" /> Send Location
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function parseLocationMessage(body: string): { latitude: number; longitude: number; label?: string } | null {
  if (!body.startsWith("ghostline:location:")) return null;
  const parts = body.split(":");
  if (parts.length < 4) return null;
  const lat = parseFloat(parts[2]);
  const lng = parseFloat(parts[3]);
  const label = parts[4] || undefined;
  if (isNaN(lat) || isNaN(lng)) return null;
  return { latitude: lat, longitude: lng, label };
}

export function formatLocationPayload(location: { latitude: number; longitude: number; label?: string }): string {
  return `ghostline:location:${location.latitude}:${location.longitude}:${location.label || ""}`;
}
