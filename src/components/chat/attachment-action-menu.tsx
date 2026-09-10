import React, { useRef } from "react";
import { Camera, Image, Paperclip, Mic, X } from "lucide-react";

interface AttachmentActionMenuProps {
  onClose: () => void;
  onSelectImages: (files: File[]) => void;
  onSelectFile: (file: File) => void;
  onOpenCamera: () => void;
  onStartVoice: () => void;
}

export function AttachmentActionMenu({
  onClose,
  onSelectImages,
  onSelectFile,
  onOpenCamera,
  onStartVoice,
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
      bg: "bg-blue-50",
      onClick: () => { onOpenCamera(); onClose(); },
    },
    {
      id: "photos",
      icon: Image,
      label: "Photos & Videos",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      onClick: () => imageInputRef.current?.click(),
    },
    {
      id: "file",
      icon: Paperclip,
      label: "File",
      color: "text-amber-600",
      bg: "bg-amber-50",
      onClick: () => fileInputRef.current?.click(),
    },
    {
      id: "voice",
      icon: Mic,
      label: "Voice Message",
      color: "text-purple-600",
      bg: "bg-purple-50",
      onClick: () => { onStartVoice(); onClose(); },
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Menu — positioned above composer */}
      <div
        role="menu"
        aria-label="Attachment options"
        className="absolute bottom-full left-0 z-50 mb-2 w-48 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ul className="py-1">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <li key={action.id}>
                <button
                  role="menuitem"
                  type="button"
                  onClick={action.onClick}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10"
                >
                  <span className={["grid h-7 w-7 shrink-0 place-items-center rounded-xl", action.bg].join(" ")}>
                    <Icon className={["h-3.5 w-3.5", action.color].join(" ")} />
                  </span>
                  <span className="font-medium">{action.label}</span>
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
