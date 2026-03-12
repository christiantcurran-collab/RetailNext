"use client";

import { useState } from "react";

export default function GenderSizeScreen({
  query,
  onConfirm,
  onBack,
}: {
  query: string;
  onConfirm: (gender: "Women" | "Men") => void;
  onBack: () => void;
}) {
  const [gender, setGender] = useState<"Women" | "Men" | null>(null);

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      {/* Query echo */}
      <h2
        className="text-2xl text-text-primary mb-10 text-center"
        style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
      >
        &ldquo;{query}&rdquo;
      </h2>

      {/* Shopping for */}
      <div className="mb-12">
        <p className="text-[0.65rem] uppercase tracking-[0.15em] text-text-secondary mb-3">
          Shopping for
        </p>
        <div className="flex gap-3">
          {(["Women", "Men"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`flex-1 py-2.5 text-[0.78rem] tracking-[0.1em] uppercase border transition-colors ${
                gender === g
                  ? "bg-text-primary text-white border-text-primary"
                  : "bg-white text-text-secondary border-border hover:border-text-primary hover:text-text-primary"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => gender && onConfirm(gender)}
        disabled={gender === null}
        className="w-full py-3.5 text-[0.75rem] font-bold tracking-[0.2em] uppercase bg-text-primary text-white hover:bg-text-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Find my looks →
      </button>

      {/* Back */}
      <div className="mt-6 text-center">
        <button
          onClick={onBack}
          className="text-[0.68rem] tracking-[0.1em] text-text-secondary hover:text-text-primary transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
