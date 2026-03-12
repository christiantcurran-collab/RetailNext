"use client";

import { useEffect, useRef } from "react";

const ZIP_OPTIONS = [
  { zip: "10001", label: "10001 — Midtown South" },
  { zip: "10002", label: "10002 — Lower East Side" },
  { zip: "10003", label: "10003 — East Village" },
  { zip: "10007", label: "10007 — Financial District" },
  { zip: "10011", label: "10011 — Chelsea" },
  { zip: "10016", label: "10016 — Murray Hill" },
  { zip: "10019", label: "10019 — Midtown West" },
  { zip: "10028", label: "10028 — Upper East Side" },
  { zip: "10036", label: "10036 — Times Square" },
  { zip: "10065", label: "10065 — Lenox Hill" },
];

export const DEFAULT_DESCRIPTION = "Describe an item, an event, or upload a photo";

export default function Homepage({
  description,
  onDescriptionChange,
  uploadPreview,
  onFileChange,
  zipCode,
  onZipChange,
  onSubmit,
}: {
  description: string;
  onDescriptionChange: (d: string) => void;
  uploadPreview: string | null;
  onFileChange: (file: File | null) => void;
  zipCode: string;
  onZipChange: (zip: string) => void;
  onSubmit: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = description.trim().length > 0 || !!uploadPreview;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [description]);

  return (
    <div className="relative min-h-[calc(100vh-60px)] flex flex-col items-center justify-start pt-16 pb-48">
      {/* Hero background */}
      <img
        src="/hero-wedding.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/55" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-xl mx-auto px-5">
        {/* Headline */}
        <div className="text-center mb-6">
          <h1
            className="text-3xl leading-tight text-white mb-2"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
          >
            Find your look
          </h1>
        </div>

        {/* Input card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-sm p-4">

          {/* Textarea + camera button */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={DEFAULT_DESCRIPTION}
              rows={3}
              className="min-h-[96px] w-full overflow-hidden bg-transparent pr-10 text-[0.95rem] leading-relaxed text-white placeholder-white/35 resize-none focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canSubmit) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Upload a photo of an item"
              className="absolute top-0.5 right-0 p-1.5 rounded transition-colors text-white/50 hover:text-white hover:bg-white/10"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          </div>

          {/* Image preview strip */}
          {uploadPreview && (
            <div className="mt-2 flex items-center gap-3 pt-2 border-t border-white/15">
              <img
                src={uploadPreview}
                alt="Uploaded"
                className="h-14 w-14 object-cover rounded-sm border border-white/20"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[0.7rem] text-white/80 font-medium">Photo uploaded</div>
                <div className="text-[0.62rem] text-white/45">We&apos;ll find the closest matches in store</div>
              </div>
              <button
                onClick={() => onFileChange(null)}
                className="text-white/40 hover:text-white text-xs transition-colors shrink-0"
              >
                Remove
              </button>
            </div>
          )}

          {/* Bottom row: zip + submit */}
          <div className="mt-4 flex gap-2 items-stretch">
            <select
              value={zipCode}
              onChange={(e) => onZipChange(e.target.value)}
              className="bg-white/10 border border-white/20 text-white text-[0.72rem] px-3 py-2 rounded-sm cursor-pointer focus:outline-none appearance-none"
              style={{ minWidth: "0", width: "auto" }}
            >
              {ZIP_OPTIONS.map((z) => (
                <option key={z.zip} value={z.zip} className="text-black bg-white">
                  {z.label}
                </option>
              ))}
            </select>
            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              className="flex-1 bg-white text-black py-2 text-[0.72rem] font-bold tracking-[0.18em] uppercase
                         hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Search →
            </button>
          </div>
        </div>

        {/* Example prompts */}
        <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:justify-center">
          {[
            "black dress",
            "dress for a summer wedding",
            "men's wear for interview",
          ].map((example) => (
            <button
              key={example}
              onClick={() => {
                onDescriptionChange(example);
                onFileChange(null);
              }}
              className="w-full rounded-sm border border-white/25 bg-white/10 px-3 py-2 text-left text-[0.68rem] leading-snug text-white transition-colors hover:bg-white/20 sm:w-auto sm:text-center"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          onFileChange(file);
          if (file) onDescriptionChange("");
          e.target.value = "";
        }}
      />
    </div>
  );
}
