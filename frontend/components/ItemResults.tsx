"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationMessage, MatchedItem } from "@/app/page";

function getRouteOrigin(zipCode: string) {
  return `${zipCode}, Manhattan, New York, NY, USA`;
}

function StockBadge({ stock }: { stock: MatchedItem["stock"] }) {
  const nearest = stock?.nearest_with_stock;
  if (!nearest) {
    return (
      <span className="inline-block text-[0.6rem] tracking-wide px-2 py-0.5 rounded-sm bg-red-50 text-red-600 border border-red-100">
        Out of stock nearby
      </span>
    );
  }
  const isLow = nearest.stock <= 2;
  return (
    <span
      className={`inline-block text-[0.6rem] tracking-wide px-2 py-0.5 rounded-sm border ${
        isLow
          ? "bg-amber-50 text-amber-700 border-amber-100"
          : "bg-green-50 text-green-700 border-green-100"
      }`}
    >
      {isLow ? "Low stock" : "In stock"} · {nearest.neighborhood}
    </span>
  );
}

export default function ItemResults({
  description,
  results,
  apiUrl,
  zipCode,
  onReset,
  onReserve,
  reservingItemId,
  onRefine,
  conversationHistory,
  isRefining,
}: {
  description: string;
  results: MatchedItem[];
  apiUrl: string;
  zipCode: string;
  onReset: () => void;
  onReserve: (item: MatchedItem, size: string, storeId: string) => Promise<void>;
  reservingItemId: number | null;
  onRefine: (message: string) => Promise<void>;
  conversationHistory: ConversationMessage[];
  isRefining: boolean;
}) {
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>(() =>
    Object.fromEntries(results.map((r) => [r.id, r.sizes[0] || ""])),
  );
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  function handleSizeChange(itemId: number, size: string) {
    setSelectedSizes((prev) => ({ ...prev, [itemId]: size }));
  }

  function toggleExpand(itemId: number) {
    setExpandedItem((prev) => (prev === itemId ? null : itemId));
  }

  if (results.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-28 text-center">
        <h2
          className="text-3xl mb-3"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
        >
          No matches found
        </h2>
        <p className="text-[0.85rem] text-text-secondary mb-10">
          Try rephrasing your description or uploading a clearer photo.
        </p>
        <button
          onClick={onReset}
          className="bg-nav-bg text-white px-10 py-4 text-[0.7rem] font-semibold tracking-[0.15em] uppercase hover:bg-text-primary transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onReset}
          className="text-text-secondary text-[0.72rem] tracking-wide mb-6 hover:text-text-primary transition-colors block"
        >
          ← Start over
        </button>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[0.6rem] tracking-[0.2em] uppercase text-text-secondary mb-1">
              Matching results
            </p>
            <h2
              className="text-3xl leading-tight"
              style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
            >
              {results.length} item{results.length !== 1 ? "s" : ""} found
            </h2>
            <p className="text-[0.8rem] text-text-secondary mt-1 italic">
              &ldquo;{description}&rdquo;
            </p>
          </div>
          <span className="text-[0.62rem] tracking-[0.12em] uppercase text-text-secondary border border-border px-3 py-1">
            Ranked by similarity
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results.map((item, rank) => {
          const nearest = item.stock?.nearest_with_stock;
          const aisle = item.stock?.aisle;
          const selectedSize = selectedSizes[item.id] || item.sizes[0] || "";
          const isExpanded = expandedItem === item.id;
          const isReserving = reservingItemId === item.id;

          return (
            <div
              key={item.id}
              className="bg-white border border-border rounded-sm overflow-hidden flex flex-col"
            >
              {/* Match badge + image */}
              <div className="relative">
                <div className="aspect-[3/4] bg-bg-secondary overflow-hidden">
                  <img
                    src={`${apiUrl}/api/image/${item.id}`}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Rank badge */}
                {rank === 0 && (
                  <div className="absolute top-2.5 right-2.5 bg-white/90 text-text-primary text-[0.58rem] tracking-[0.1em] uppercase px-2 py-0.5 rounded-sm">
                    Best match
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="p-4 flex flex-col flex-1 gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[0.82rem] font-semibold text-text-primary leading-snug">
                    {item.name}
                  </div>
                  <div className="text-[0.82rem] font-semibold text-text-primary whitespace-nowrap">
                    ${item.price}
                  </div>
                </div>

                <StockBadge stock={item.stock} />

                {/* Size selector */}
                {item.sizes.length > 1 && (
                  <div>
                    <label className="block text-[0.58rem] uppercase tracking-[0.12em] text-text-secondary mb-1">
                      Size
                    </label>
                    <select
                      value={selectedSize}
                      onChange={(e) => handleSizeChange(item.id, e.target.value)}
                      className="w-full border border-border bg-white text-text-primary text-[0.75rem] px-3 py-1.5 rounded-sm focus:outline-none focus:border-text-primary"
                    >
                      {item.sizes.map((sz) => (
                        <option key={sz} value={sz}>
                          {sz}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Expandable store info */}
                {nearest && (
                  <div>
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="text-[0.62rem] text-text-secondary hover:text-text-primary transition-colors underline underline-offset-2"
                    >
                      {isExpanded ? "Hide store info" : "View store info"}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 text-[0.7rem] text-text-secondary leading-relaxed bg-bg-secondary rounded-sm p-2.5">
                        <div className="font-semibold text-text-primary">{nearest.name}</div>
                        <div>{nearest.address}</div>
                        <div className="mt-1">
                          {nearest.distance_mi} mi away · {nearest.stock} in stock
                          {aisle && ` · Aisle ${aisle}`}
                        </div>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(getRouteOrigin(zipCode))}&destination=${encodeURIComponent(nearest.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-1.5 text-[0.62rem] underline text-text-primary"
                        >
                          Get directions →
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Reserve CTA */}
                <div className="mt-auto pt-2">
                  {nearest ? (
                    <button
                      onClick={() => onReserve(item, selectedSize, nearest.id)}
                      disabled={isReserving}
                      className="w-full bg-nav-bg text-white py-2.5 text-[0.65rem] font-semibold tracking-[0.12em] uppercase rounded-sm hover:bg-text-primary transition-colors disabled:opacity-60"
                    >
                      {isReserving ? "Reserving..." : "Reserve at Nearest Store"}
                    </button>
                  ) : (
                    <div className="w-full py-2.5 text-[0.65rem] text-center text-text-secondary border border-border rounded-sm">
                      Not available nearby
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-10 text-center">
        <button
          onClick={onReset}
          className="text-[0.7rem] tracking-[0.1em] text-text-secondary hover:text-text-primary transition-colors"
        >
          ← New search
        </button>
      </div>

      <ItemRefinement
        onRefine={onRefine}
        conversationHistory={conversationHistory}
        isRefining={isRefining}
      />
    </div>
  );
}

function ItemRefinement({
  onRefine,
  conversationHistory,
  isRefining,
}: {
  onRefine: (message: string) => Promise<void>;
  conversationHistory: ConversationMessage[];
  isRefining: boolean;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [input]);

  async function handleSend() {
    const msg = input.trim();
    if (!msg || isRefining) return;
    setInput("");
    await onRefine(msg);
    inputRef.current?.focus();
  }

  return (
    <div className="mt-10 border-t border-border pt-8">
      <h3
        className="text-xl mb-4 text-text-primary"
        style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
      >
        Want to change something?
      </h3>

      {conversationHistory.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {conversationHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-sm text-[0.82rem] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-text-primary text-white"
                    : "bg-bg-secondary border border-border text-text-primary"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Tell us what to change about these options"
          rows={3}
          disabled={isRefining}
          className="min-h-[104px] flex-1 overflow-hidden rounded-sm border border-border bg-white px-3 py-2.5 text-[0.82rem] leading-relaxed text-text-primary resize-none focus:outline-none focus:border-text-secondary placeholder-text-secondary/40 disabled:opacity-50 sm:min-h-0"
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || isRefining}
          className="px-5 py-2.5 bg-text-primary text-white text-[0.72rem] font-bold tracking-[0.12em] uppercase rounded-sm hover:bg-text-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed self-end"
        >
          {isRefining ? "..." : "Send"}
        </button>
      </div>
      <p className="mt-1.5 text-[0.62rem] text-text-secondary/50">
        Cmd+Enter to send
      </p>
    </div>
  );
}
