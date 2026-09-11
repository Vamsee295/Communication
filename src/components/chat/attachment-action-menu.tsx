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
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
        onClick={onClose}
        aria-hidden
      />

      {/* Menu — bottom sheet on mobile, popover above composer on desktop */}
      <div
        role="menu"
        aria-label="Attachment options"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-6 duration-200 sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:w-56 sm:rounded-3xl sm:border sm:bg-card sm:p-1.5 sm:shadow-2xl sm:slide-in-from-bottom-2 sm:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile handle indicator */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />

        <div className="mb-2.5 px-1 flex items-center justify-between sm:hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Attach</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Cancel
          </button>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-col sm:gap-0.5">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <li key={action.id} className="w-full">
                <button
                  role="menuitem"
                  type="button"
                  onClick={action.onClick}
                  className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-medium text-foreground transition-all hover:bg-muted/70 active:bg-muted active:scale-[0.98] sm:rounded-xl sm:py-2"
                >
                  <span className={["grid h-8 w-8 shrink-0 place-items-center rounded-xl sm:h-7 sm:w-7", action.bg].join(" ")}>
                    <Icon className={["h-4 w-4 sm:h-3.5 sm:w-3.5", action.color].join(" ")} />
                  </span>
                  <span className="truncate text-left">{action.label}</span>
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
