import React, { useRef } from "react";
import { Camera, Image, Paperclip, Mic, UserPlus, MapPin, Palette } from "lucide-react";

interface AttachmentActionMenuProps {
  onClose: () => void;
  onSelectImages: (files: File[]) => void;
  onSelectFile: (file: File) => void;
  onOpenCamera: () => void;
  onStartVoice: () => void;
  onShareContact?: () => void;
  onShareLocation?: () => void;
  onOpenAppearance?: () => void;
}

export function AttachmentActionMenu({
  onClose,
  onSelectImages,
  onSelectFile,
  onOpenCamera,
  onStartVoice,
  onShareContact,
  onShareLocation,
  onOpenAppearance,
}: AttachmentActionMenuProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      onSelectImages(files);
      onClose();
    }
    e.target.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file);
      onClose();
    }
    e.target.value = "";
  };

  const actions = [
    {
      id: "camera",
      icon: Camera,
      label: "Camera",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      onClick: () => {
        onOpenCamera();
        onClose();
      },
    },
    {
      id: "photos",
      icon: Image,
      label: "Photos & Videos",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      onClick: () => imageInputRef.current?.click(),
    },
    {
      id: "file",
      icon: Paperclip,
      label: "Document / File",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      onClick: () => fileInputRef.current?.click(),
    },
    {
      id: "voice",
      icon: Mic,
      label: "Voice Note",
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      onClick: () => {
        onStartVoice();
        onClose();
      },
    },
    ...(onShareContact
      ? [
          {
            id: "contact",
            icon: UserPlus,
            label: "Share Contact",
            color: "text-sky-500",
            bg: "bg-sky-500/10",
            onClick: () => {
              onShareContact();
              onClose();
            },
          },
        ]
      : []),
    ...(onShareLocation
      ? [
          {
            id: "location",
            icon: MapPin,
            label: "Share Location",
            color: "text-rose-500",
            bg: "bg-rose-500/10",
            onClick: () => {
              onShareLocation();
              onClose();
            },
          },
        ]
      : []),
    ...(onOpenAppearance
      ? [
          {
            id: "appearance",
            icon: Palette,
            label: "Chat Appearance",
            color: "text-indigo-500",
            bg: "bg-indigo-500/10",
            onClick: () => {
              onOpenAppearance();
              onClose();
            },
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />

      {/* Menu — positioned above composer */}
      <div
        role="menu"
        aria-label="Attachment options"
        className="absolute bottom-full left-0 z-50 mb-2 w-52 overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <ul className="py-1.5 flex flex-col gap-0.5">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <li key={action.id}>
                <button
                  role="menuitem"
                  type="button"
                  onClick={action.onClick}
                  className="flex w-full items-center gap-3 px-3.5 py-2 text-xs text-foreground transition-colors hover:bg-muted/60 active:bg-muted font-medium"
                >
                  <span className={["grid h-7 w-7 shrink-0 place-items-center rounded-xl", action.bg].join(" ")}>
                    <Icon className={["h-3.5 w-3.5", action.color].join(" ")} />
                  </span>
                  <span>{action.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        onChange={handleImageChange}
        aria-hidden
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.ppt,.pptx"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden
      />
    </>
  );
}
