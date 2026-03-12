"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConversationMessage,
  EventData,
  OutfitCategory,
  MatchedItem,
  SelectedOption,
  StoreInfo,
} from "@/app/page";

function getCommonStores(
  itemOrder: string[],
  outfit: Record<string, OutfitCategory>,
  selectedByCategory: Record<string, SelectedOption>,
): StoreInfo[] {
  const selectedItems = itemOrder
    .map((cat) => {
      const sel = selectedByCategory[cat];
      const options = outfit[cat]?.options ?? [];
      return options.find((o) => o.id === sel?.itemId) ?? null;
    })
    .filter((item): item is MatchedItem => item !== null);

  if (selectedItems.length === 0) return [];

  let commonStoreIds: string[] | null = null;
  for (const item of selectedItems) {
    const storesForItem = item.stock?.all_stores ?? [];
    const available = storesForItem.filter((s) => s.stock > 0).map((s) => s.id);
    commonStoreIds =
      commonStoreIds === null
        ? available
        : commonStoreIds.filter((id) => available.includes(id));
  }

  if (!commonStoreIds || commonStoreIds.length === 0) return [];

  const ref = selectedItems[0].stock?.all_stores ?? [];
  return ref
    .filter((s) => commonStoreIds!.includes(s.id))
    .sort((a, b) => a.distance_mi - b.distance_mi);
}

function StockBadge({ stock }: { stock: MatchedItem["stock"] }) {
  const nearest = stock?.nearest_with_stock;
  if (!nearest) {
    return (
      <span className="text-[0.6rem] px-2 py-0.5 rounded-sm bg-red-50 text-red-600 border border-red-100">
        Out of stock nearby
      </span>
    );
  }
  const isLow = nearest.stock <= 2;
  return (
    <span
      className={`text-[0.6rem] px-2 py-0.5 rounded-sm border ${
        isLow
          ? "bg-amber-50 text-amber-700 border-amber-100"
          : "bg-green-50 text-green-700 border-green-100"
      }`}
    >
      {isLow ? "Low stock" : "In stock"} · {nearest.neighborhood}
    </span>
  );
}

function formatUsd(value: number) {
  const wholeAmount = Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: wholeAmount ? 0 : 2,
    maximumFractionDigits: wholeAmount ? 0 : 2,
  }).format(value);
}

export default function EventResults({
  eventData,
  outfit,
  itemOrder,
  apiUrl,
  onReset,
  onReserveOutfit,
  reservingStoreId,
  onRefine,
  conversationHistory,
  isRefining,
}: {
  eventData: EventData;
  outfit: Record<string, OutfitCategory>;
  itemOrder: string[];
  apiUrl: string;
  onReset: () => void;
  onReserveOutfit: (
    storeId: string,
    selections: { id: number; size: string }[],
  ) => Promise<void>;
  reservingStoreId: string | null;
  onRefine: (message: string) => Promise<void>;
  conversationHistory: ConversationMessage[];
  isRefining: boolean;
}) {
  const [selectedByCategory, setSelectedByCategory] = useState<
    Record<string, SelectedOption>
  >(() =>
    Object.fromEntries(
      itemOrder
        .filter((cat) => outfit[cat]?.options.length > 0)
        .map((cat) => [
          cat,
          {
            itemId: outfit[cat].options[0].id,
            size: outfit[cat].options[0].sizes[0] || "",
          },
        ]),
    ),
  );

  // When refined slots arrive, auto-select their first option
  useEffect(() => {
    setSelectedByCategory((prev) => {
      const updates: Record<string, SelectedOption> = {};
      for (const cat of itemOrder) {
        const options = outfit[cat]?.options ?? [];
        if (options.length === 0) continue;
        const currentId = prev[cat]?.itemId;
        const stillPresent = options.some((o) => o.id === currentId);
        if (!stillPresent) {
          // slot was replaced — select the new first option
          updates[cat] = { itemId: options[0].id, size: options[0].sizes[0] || "" };
        }
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [outfit, itemOrder]);

  const reservableStores = useMemo(
    () => getCommonStores(itemOrder, outfit, selectedByCategory),
    [itemOrder, outfit, selectedByCategory],
  );

  const totalSelected = itemOrder.filter(
    (cat) => selectedByCategory[cat]?.itemId != null,
  ).length;

  const selectedTotal = useMemo(() => {
    return itemOrder.reduce((sum, cat) => {
      const sel = selectedByCategory[cat];
      const item = outfit[cat]?.options.find((o) => o.id === sel?.itemId);
      return sum + (item?.price ?? 0);
    }, 0);
  }, [selectedByCategory, itemOrder, outfit]);

  function selectItem(cat: string, item: MatchedItem) {
    setSelectedByCategory((prev) => {
      // Clicking the already-selected item deselects it
      if (prev[cat]?.itemId === item.id) {
        const next = { ...prev };
        delete next[cat];
        return next;
      }
      return { ...prev, [cat]: { itemId: item.id, size: item.sizes[0] || "" } };
    });
  }

  function setSize(cat: string, size: string) {
    setSelectedByCategory((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], size },
    }));
  }

  function handleReserve(storeId: string) {
    const selections = itemOrder
      .map((cat) => {
        const sel = selectedByCategory[cat];
        const item = outfit[cat]?.options.find((o) => o.id === sel?.itemId);
        if (!sel || !item) return null;
        return { id: item.id, size: sel.size || item.sizes[0] || "" };
      })
      .filter((s): s is { id: number; size: string } => s !== null);
    onReserveOutfit(storeId, selections);
  }

  if (itemOrder.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-28 text-center">
        <h2
          className="text-3xl mb-3"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
        >
          Could not build an outfit
        </h2>
        <p className="text-[0.85rem] text-text-secondary mb-10">
          Try a more specific event description, e.g. &ldquo;Summer wedding, semi-formal, women&rsquo;s.&rdquo;
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
      {/* Back */}
      <button
        onClick={onReset}
        className="text-text-secondary text-[0.72rem] tracking-wide mb-6 hover:text-text-primary transition-colors block"
      >
        ← Start over
      </button>

      {/* Event context card */}
      <div className="mb-8 border border-border rounded-sm bg-bg-secondary p-5">
        <p className="text-[0.6rem] tracking-[0.2em] uppercase text-text-secondary mb-2">
          Outfit plan for
        </p>
        <h2
          className="text-3xl mb-2 capitalize"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
        >
          {eventData.occasion || "Your Event"}
        </h2>
        <div className="flex flex-wrap gap-2 mt-1">
          {eventData.formality && (
            <span className="text-[0.65rem] tracking-[0.1em] uppercase border border-border px-2.5 py-1 text-text-secondary">
              {eventData.formality}
            </span>
          )}
          {eventData.season && (
            <span className="text-[0.65rem] tracking-[0.1em] uppercase border border-border px-2.5 py-1 text-text-secondary">
              {eventData.season}
            </span>
          )}
          {eventData.gender && (
            <span className="text-[0.65rem] tracking-[0.1em] uppercase border border-border px-2.5 py-1 text-text-secondary">
              {eventData.gender}
            </span>
          )}
          {eventData.budget != null && (
            <span className="text-[0.65rem] tracking-[0.1em] uppercase border border-border px-2.5 py-1 text-text-secondary">
              Budget {formatUsd(eventData.budget)}
            </span>
          )}
        </div>
      </div>

      {/* Category sections */}
      <div className="flex flex-col gap-8">
        {itemOrder.map((cat, catIdx) => {
          const section = outfit[cat];
          if (!section) return null;
          const sel = selectedByCategory[cat];

          return (
            <section key={cat} className="border border-border rounded-sm bg-white p-6">
              <div className="mb-4">
                <div className="text-[0.6rem] tracking-[0.2em] uppercase text-text-secondary mb-0.5">
                  {catIdx === 0 ? "Main piece" : `Complement ${catIdx}`}
                </div>
                <h3
                  className="text-2xl"
                  style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
                >
                  {cat}
                </h3>
                <p className="text-[0.75rem] text-text-secondary mt-0.5 italic">
                  &ldquo;{section.description}&rdquo;
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {section.options.map((item) => {
                  const isSelected = sel?.itemId === item.id;
                  const selectedSize = isSelected ? sel!.size : item.sizes[0] || "";

                  return (
                    <div
                      key={item.id}
                      onClick={() => selectItem(cat, item)}
                      className={`border rounded-sm p-4 cursor-pointer transition-all ${
                        isSelected
                          ? "border-nav-bg shadow-[0_0_0_1px_rgba(16,16,16,0.15)]"
                          : "border-border hover:border-text-secondary"
                      }`}
                    >
                      {/* Image */}
                      <div className="relative aspect-[3/4] bg-bg-secondary overflow-hidden rounded-sm mb-3">
                        <img
                          src={`${apiUrl}/api/image/${item.id}`}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />

                      </div>

                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="text-[0.8rem] font-semibold text-text-primary leading-snug">
                          {item.name}
                        </div>
                        <div className="text-[0.8rem] font-semibold text-text-primary whitespace-nowrap">
                          ${item.price}
                        </div>
                      </div>

                      <div className="mb-3">
                        <StockBadge stock={item.stock} />
                      </div>

                      {/* Size selector */}
                      {item.sizes.length > 1 && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <label className="block text-[0.58rem] uppercase tracking-[0.12em] text-text-secondary mb-1">
                            Size
                          </label>
                          <select
                            value={isSelected ? selectedSize : item.sizes[0]}
                            onChange={(e) => {
                              selectItem(cat, item);
                              setSize(cat, e.target.value);
                            }}
                            className="w-full border border-border bg-white text-text-primary text-[0.75rem] px-2 py-1.5 rounded-sm focus:outline-none"
                          >
                            {item.sizes.map((sz) => (
                              <option key={sz} value={sz}>
                                {sz}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Select indicator */}
                      <div
                        className={`mt-3 w-full py-2 text-[0.62rem] font-semibold tracking-[0.1em] uppercase text-center rounded-sm transition-colors ${
                          isSelected
                            ? "bg-nav-bg text-white hover:bg-red-700"
                            : "bg-bg-secondary text-text-primary hover:bg-border"
                        }`}
                      >
                        {isSelected ? "Selected · click to remove" : "Choose"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Reserve panel */}
      <div className="mt-10 bg-nav-bg text-white rounded-sm p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm">
            <div className="text-[0.6rem] tracking-[0.15em] uppercase text-white/40 mb-1">
              Reserve Selected Items
            </div>
            <div className="text-2xl font-semibold mb-1">
              {totalSelected} of {itemOrder.length} piece{itemOrder.length !== 1 ? "s" : ""} selected
            </div>
            <div className="text-[0.8rem] text-white/65">
              {totalSelected > 0 ? (
                <>
                  Total: ${selectedTotal}
                  {eventData.budget != null && (
                    <span className="ml-2 text-white/40">
                      (budget {formatUsd(eventData.budget)})
                    </span>
                  )}
                </>
              ) : (
                <span className="text-white/40">Select at least one item to reserve</span>
              )}
            </div>
            {totalSelected > 0 && totalSelected < itemOrder.length && (
              <div className="mt-1 text-[0.7rem] text-white/40">
                Click a selected item to deselect it
              </div>
            )}
          </div>

          <div className="flex-1">
            {totalSelected === 0 ? (
              <div className="text-[0.8rem] text-white/70">
                Select items above to see store availability.
              </div>
            ) : reservableStores.length === 0 ? (
              <div className="text-[0.8rem] text-white/70">
                No single store has all selected items in stock. Try swapping one of the choices.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {reservableStores.map((store) => (
                  <div key={store.id} className="border border-white/15 rounded-sm p-4 bg-white/5">
                    <div className="text-[0.8rem] font-semibold">{store.name}</div>
                    <div className="text-[0.7rem] text-white/65 mt-0.5">{store.address}</div>
                    <div className="text-[0.7rem] text-white/65 mt-0.5">
                      {store.distance_mi} mi away · {store.neighborhood}
                    </div>
                    <button
                      onClick={() => handleReserve(store.id)}
                      disabled={reservingStoreId === store.id}
                      className="mt-3 w-full bg-white text-nav-bg px-4 py-2.5 text-[0.65rem] font-semibold tracking-[0.12em] uppercase rounded-sm hover:bg-white/90 transition-colors disabled:opacity-60"
                    >
                      {reservingStoreId === store.id
                        ? "Reserving..."
                        : totalSelected === itemOrder.length
                          ? "Reserve Full Outfit Here"
                          : `Reserve ${totalSelected} Item${totalSelected !== 1 ? "s" : ""} Here`}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={onReset}
          className="text-[0.7rem] tracking-[0.1em] text-text-secondary hover:text-text-primary transition-colors"
        >
          Plan a New Look
        </button>
      </div>

      {/* Refinement section */}
      <OutfitRefinement
        onRefine={onRefine}
        conversationHistory={conversationHistory}
        isRefining={isRefining}
      />
    </div>
  );
}

function OutfitRefinement({
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

      {/* Conversation history */}
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

      {/* Input row */}
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
          placeholder="Tell us what to change about this outfit"
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
