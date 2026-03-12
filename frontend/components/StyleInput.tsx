"use client";

import { useRef, useEffect, useState } from "react";

type Sample = { id: string; label: string; file: string };

const ZIP_OPTIONS = [
  { zip: "10001", label: "10001 - Midtown South" },
  { zip: "10002", label: "10002 - Lower East Side" },
  { zip: "10003", label: "10003 - East Village" },
  { zip: "10007", label: "10007 - Financial District" },
  { zip: "10011", label: "10011 - Chelsea" },
  { zip: "10016", label: "10016 - Murray Hill" },
  { zip: "10019", label: "10019 - Midtown West" },
  { zip: "10028", label: "10028 - Upper East Side" },
  { zip: "10036", label: "10036 - Times Square" },
  { zip: "10065", label: "10065 - Lenox Hill" },
];

export default function StyleInput({
  selectedSample,
  uploadPreview,
  hasInput,
  onFileChange,
  onSampleSelect,
  onSubmit,
  onBack,
  apiUrl,
  zipCode,
  onZipChange,
  description,
  onDescriptionChange,
}: {
  selectedSample: string | null;
  uploadPreview: string | null;
  hasInput: boolean;
  onFileChange: (file: File | null) => void;
  onSampleSelect: (id: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  apiUrl: string;
  zipCode: string;
  onZipChange: (zip: string) => void;
  description: string;
  onDescriptionChange: (desc: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [samples, setSamples] = useState<Sample[]>([]);

  useEffect(() => {
    fetch(`${apiUrl}/api/samples`)
      .then((r) => r.json())
      .then(setSamples)
      .catch(() => {});
  }, [apiUrl]);

  const hasImage = !!uploadPreview || !!selectedSample;

  return (
    <div className="max-w-2xl mx-auto px-8 py-16">
      <button
        onClick={onBack}
        className="text-text-secondary text-[0.75rem] tracking-wide mb-10 hover:text-text-primary transition-colors"
      >
        &larr; Back
      </button>

      <div className="text-center mb-12">
        <h2
          className="text-4xl mb-3"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
        >
          Show us what you&apos;re working with
        </h2>
        <p className="text-[0.85rem] text-text-secondary">
          Upload a photo, pick a sample, or describe your item
        </p>
      </div>

      {/* Upload zone */}
      {!description && (
        <div
          onClick={() => !uploadPreview && inputRef.current?.click()}
          className={`max-w-md mx-auto mb-10 border-2 border-dashed text-center cursor-pointer transition-all overflow-hidden rounded-sm
            ${uploadPreview
              ? "border-text-primary bg-white p-0"
              : "border-border bg-bg-secondary py-16 px-6 hover:border-text-secondary"
            }`}
        >
          {uploadPreview ? (
            <div>
              <div className="h-72 bg-bg-secondary flex items-center justify-center">
                <img src={uploadPreview} alt="Upload" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="px-4 py-3 text-left border-t border-border">
                <div className="text-[0.8rem] font-semibold text-text-primary">Uploaded image</div>
                <div className="text-[0.65rem] text-text-secondary">Ready to match</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFileChange(null);
                }}
                className="w-full py-2.5 text-[0.65rem] text-text-secondary hover:text-text-primary transition-colors border-t border-border"
              >
                Remove &amp; choose another
              </button>
            </div>
          ) : (
            <>
              <div className="text-3xl mb-3 opacity-20">&#x1F4F8;</div>
              <p className="text-[0.8rem] font-semibold text-text-primary mb-1">
                Tap to upload a photo
              </p>
              <p className="text-[0.7rem] text-text-secondary">
                JPG, PNG — a top, jacket, shoes, anything
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      {/* OR: Pick a sample */}
      {!uploadPreview && !description && samples.length > 0 && (
        <div className="max-w-md mx-auto mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[0.6rem] tracking-[0.2em] uppercase text-text-secondary">or pick a sample</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {samples.map((s) => {
              const imageId = s.file.replace(".jpg", "");
              const isSelected = selectedSample === s.id;
              return (
                <button
                  key={s.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSampleSelect(s.id);
                  }}
                  className={`relative bg-white border p-3 transition-all rounded-sm
                    ${isSelected ? "border-text-primary shadow-md" : "border-border hover:border-text-secondary"}`}
                >
                  <div className="aspect-[3/4] bg-bg-secondary mb-2 overflow-hidden">
                    <img
                      src={`${apiUrl}/api/image/${imageId}`}
                      alt={s.label}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[0.6rem] tracking-wider uppercase text-text-primary truncate">
                    {s.label}
                  </p>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-nav-bg flex items-center justify-center rounded-sm">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* OR: Describe your item */}
      {!hasImage && (
        <div className="max-w-md mx-auto mb-10">
          {!description && (
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[0.6rem] tracking-[0.2em] uppercase text-text-secondary">or describe your item</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder='e.g. "Navy blue slim-fit blazer" or "Black strappy heels"'
            className="w-full border border-border bg-white text-text-primary text-[0.85rem] px-4 py-3 rounded-sm
                       focus:outline-none focus:border-text-primary transition-colors resize-none h-24"
          />
          {description && (
            <button
              onClick={() => onDescriptionChange("")}
              className="text-[0.65rem] text-text-secondary hover:text-text-primary mt-1.5 transition-colors"
            >
              Clear description
            </button>
          )}
        </div>
      )}

      {/* Location selector */}
      {hasInput && (
        <div className="max-w-md mx-auto mb-8">
          <label className="block text-[0.6rem] tracking-[0.2em] uppercase text-text-secondary mb-2 text-center">
            Your location
          </label>
          <select
            value={zipCode}
            onChange={(e) => onZipChange(e.target.value)}
            className="w-full border border-border bg-white text-text-primary text-[0.8rem] px-4 py-3 rounded-sm
                       focus:outline-none focus:border-text-primary transition-colors appearance-none cursor-pointer"
          >
            {ZIP_OPTIONS.map((z) => (
              <option key={z.zip} value={z.zip}>{z.label}</option>
            ))}
          </select>
          <p className="text-[0.6rem] text-text-secondary mt-1.5 text-center">
            We&apos;ll find the nearest store with your items in stock
          </p>
        </div>
      )}

      {/* CTA */}
      {hasInput && (
        <div className="text-center">
          <button
            onClick={() => onSubmit()}
            className="bg-nav-bg text-white px-12 py-4 text-[0.7rem] font-semibold tracking-[0.15em] uppercase
                       hover:bg-text-primary transition-colors"
          >
            Find Matching Pieces &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
