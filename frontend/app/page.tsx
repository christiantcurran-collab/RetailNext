"use client";

import { useState, useCallback } from "react";
import NavBar from "@/components/NavBar";
import Homepage from "@/components/Homepage";
import GenderSizeScreen from "@/components/GenderSizeScreen";
import Processing from "@/components/Processing";
import ItemResults from "@/components/ItemResults";
import EventResults from "@/components/EventResults";
import ReservationConfirmation from "@/components/ReservationConfirmation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Shared types ──────────────────────────────────────────────────────────────

export type StoreInfo = {
  id: string;
  name: string;
  neighborhood: string;
  distance_mi: number;
  stock: number;
  address: string;
  zip: string;
  lat: number;
  lon: number;
};

export type StockInfo = {
  nearest_with_stock: StoreInfo | null;
  all_stores: StoreInfo[];
  aisle: string;
};

export type MatchedItem = {
  id: number;
  name: string;
  match_pct: number;
  price: number;
  sizes: string[];
  articleType: string;
  stock: StockInfo | null;
};

export type EventData = {
  occasion: string;
  formality: string;
  season: string;
  gender: string;
  budget: number | null;
};

export type OutfitCategory = {
  description: string;
  options: MatchedItem[];
};

export type SelectedOption = {
  itemId: number;
  size: string;
};

export type ReservationItem = {
  id: number;
  name: string;
  reason: string;
  price: number;
  sizes: string[];
  articleType: string;
  size: string;
  aisle: string;
};

export type ReservationResult = {
  reservation_id: string;
  store: {
    id: string;
    name: string;
    address: string;
    zip: string;
    lat: number;
    lon: number;
    neighborhood: string;
  };
  items: ReservationItem[];
  item_count: number;
  total_price: number;
  route: {
    origin_zip: string;
    distance_mi: number | null;
    summary: string;
    map_url: string;
  };
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

// ── Screens ───────────────────────────────────────────────────────────────────

type Workflow = "find-item" | "plan-outfit";
type Screen = "home" | "gender-size" | "processing" | "item-results" | "event-results" | "reservation";

type PendingPlanData = {
  occasion: string;
  formality: string;
  season: string;
  budget: number | null;
  men_items: { description: string; category: string }[];
  women_items: { description: string; category: string }[];
};

export default function Home() {
  // ── Persistent input state ──
  const [workflow, setWorkflow] = useState<Workflow>("find-item");
  const [description, setDescription] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [zipCode, setZipCode] = useState("10001");

  // ── Screen state ──
  const [screen, setScreen] = useState<Screen>("home");
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);
  const [processingDone, setProcessingDone] = useState(false);
  const [processingStage, setProcessingStage] = useState<1 | 2 | 3>(1);
  const [processingMeta, setProcessingMeta] = useState<{
    workflow: Workflow;
    occasion?: string;
    formality?: string;
    season?: string;
    categories?: string[];
    description?: string;
  } | null>(null);

  // ── Pending gender confirmation ──
  const [pendingPlanData, setPendingPlanData] = useState<PendingPlanData | null>(null);

  // ── Workflow 1 results ──
  const [itemDescription, setItemDescription] = useState("");
  const [itemResults, setItemResults] = useState<MatchedItem[]>([]);
  const [reservingItemId, setReservingItemId] = useState<number | null>(null);

  // ── Workflow 2 results ──
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [outfit, setOutfit] = useState<Record<string, OutfitCategory>>({});
  const [itemOrder, setItemOrder] = useState<string[]>([]);
  const [reservingStoreId, setReservingStoreId] = useState<string | null>(null);

  // ── Outfit refinement state ──
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isRefining, setIsRefining] = useState(false);

  // ── Item refinement state ──
  const [itemConversationHistory, setItemConversationHistory] = useState<ConversationMessage[]>([]);
  const [isItemRefining, setIsItemRefining] = useState(false);

  // ── Shared reservation ──
  const [reservation, setReservation] = useState<ReservationResult | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleFileChange(file: File | null) {
    setUploadedFile(file);
    if (file) {
      setUploadPreview(URL.createObjectURL(file));
    } else {
      setUploadPreview(null);
    }
  }

  function reset() {
    setScreen("home");
    setProcessingSteps([]);
    setProcessingDone(false);
    setProcessingStage(1);
    setProcessingMeta(null);
    setPendingPlanData(null);
    setItemDescription("");
    setItemResults([]);
    setEventData(null);
    setOutfit({});
    setItemOrder([]);
    setReservation(null);
    setReservingItemId(null);
    setReservingStoreId(null);
    setUploadedFile(null);
    setUploadPreview(null);
    setDescription("");
    setConversationHistory([]);
    setIsRefining(false);
    setItemConversationHistory([]);
    setIsItemRefining(false);
  }

  function startProcessing() {
    setScreen("processing");
    setProcessingDone(false);
    setProcessingSteps([]);
    setProcessingStage(1);
    setProcessingMeta(null);
    setItemResults([]);
    setOutfit({});
    setItemOrder([]);
    setReservation(null);
    setConversationHistory([]);
  }

  function finishWithOutfit(data: { event: EventData; outfit: Record<string, OutfitCategory>; item_order: string[] }) {
    const { event, outfit: outfitData, item_order } = data;
    setEventData(event);
    setOutfit(outfitData);
    setItemOrder(item_order);
    setProcessingMeta({
      workflow: "plan-outfit",
      occasion: event.occasion,
      formality: event.formality,
      season: event.season,
      categories: item_order,
    });
    setProcessingStage(2);
    setTimeout(() => {
      setProcessingDone(true);
      setTimeout(() => setScreen("event-results"), 400);
    }, 600);
  }

  // ── Initial search — GPT classifies intent server-side ───────────────────

  const runSearch = useCallback(async () => {
    startProcessing();

    try {
      const formData = new FormData();
      if (uploadedFile) {
        formData.append("file", uploadedFile);
      } else {
        formData.append("description", description.trim());
      }
      formData.append("zip_code", zipCode);

      const res = await fetch(`${API}/api/search`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Search request failed");

      const data = await res.json();
      const detectedWorkflow: Workflow = data.workflow ?? "find-item";
      setWorkflow(detectedWorkflow);

      if (detectedWorkflow === "find-item") {
        setItemDescription(data.description);
        setItemResults(data.results);
        setProcessingMeta({ workflow: "find-item", description: data.description });
        setProcessingStage(2);
        setTimeout(() => {
          setProcessingDone(true);
          setTimeout(() => setScreen("item-results"), 400);
        }, 600);
      } else if (data.needs_gender) {
        // GPT couldn't infer gender — ask the user
        setPendingPlanData({
          occasion: data.occasion ?? "",
          formality: data.formality ?? "",
          season: data.season ?? "",
          budget: data.budget ?? null,
          men_items: data.men_items ?? [],
          women_items: data.women_items ?? [],
        });
        // Brief pause so user sees processing before redirect
        setProcessingStage(2);
        setProcessingMeta({
          workflow: "plan-outfit",
          occasion: data.occasion,
          formality: data.formality,
          season: data.season,
        });
        setTimeout(() => setScreen("gender-size"), 800);
      } else {
        finishWithOutfit(data);
      }
    } catch (err) {
      console.error(err);
      setProcessingSteps(["Something went wrong. Please try again."]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFile, description, zipCode]);

  // ── Build outfit after gender confirmed ──────────────────────────────────

  const runOutfitBuild = useCallback(async (gender: "Women" | "Men") => {
    if (!pendingPlanData) return;
    startProcessing();

    try {
      const items = gender === "Women" ? pendingPlanData.women_items : pendingPlanData.men_items;
      const formData = new FormData();
      formData.append("gender", gender);
      formData.append("items", JSON.stringify(items));
      formData.append("zip_code", zipCode);
      formData.append("occasion", pendingPlanData.occasion);
      formData.append("formality", pendingPlanData.formality);
      formData.append("season", pendingPlanData.season);
      if (pendingPlanData.budget != null) {
        formData.append("budget", String(pendingPlanData.budget));
      }

      const res = await fetch(`${API}/api/outfit/build`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Outfit build failed");

      const data = await res.json();
      finishWithOutfit(data);
    } catch (err) {
      console.error(err);
      setProcessingSteps(["Something went wrong. Please try again."]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlanData, zipCode]);

  function handleSubmit() {
    void runSearch();
  }

  function handleGenderSizeConfirm(gender: "Women" | "Men") {
    void runOutfitBuild(gender);
  }

  // ── Conversational refinement ────────────────────────────────────────────

  async function handleRefine(message: string) {
    if (!eventData) return;
    setIsRefining(true);
    try {
      const res = await fetch(`${API}/api/outfit/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: eventData,
          current_outfit: outfit,
          conversation_history: conversationHistory,
          user_message: message,
          zip_code: zipCode,
        }),
      });
      if (!res.ok) throw new Error("Refine failed");
      const data = await res.json();

      // Merge updated slots into outfit
      if (data.updated_slots && Object.keys(data.updated_slots).length > 0) {
        setOutfit((prev) => ({ ...prev, ...data.updated_slots }));
      }
      setConversationHistory(data.conversation_history ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefining(false);
    }
  }

  // ── Item search refinement ────────────────────────────────────────────────

  async function handleItemRefine(message: string) {
    setIsItemRefining(true);
    try {
      const res = await fetch(`${API}/api/item/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_description: itemDescription,
          shown_item_ids: itemResults.map((r) => r.id),
          conversation_history: itemConversationHistory,
          user_message: message,
          zip_code: zipCode,
        }),
      });
      if (!res.ok) throw new Error("Refine failed");
      const data = await res.json();
      setItemResults(data.results);
      setItemDescription(data.description);
      setItemConversationHistory(data.conversation_history ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsItemRefining(false);
    }
  }

  // ── Reservation — single item (Workflow 1) ────────────────────────────────

  async function handleReserveSingleItem(
    item: MatchedItem,
    size: string,
    storeId: string,
  ) {
    setReservingItemId(item.id);
    try {
      const res = await fetch(`${API}/api/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          zip_code: zipCode,
          items: [{ id: item.id, size }],
        }),
      });
      if (!res.ok) throw new Error("Reservation failed");
      const data = await res.json();
      setReservation(data);
      setScreen("reservation");
    } catch (err) {
      console.error(err);
    } finally {
      setReservingItemId(null);
    }
  }

  // ── Reservation — full outfit (Workflow 2) ────────────────────────────────

  async function handleReserveOutfit(
    storeId: string,
    selections: { id: number; size: string }[],
  ) {
    setReservingStoreId(storeId);
    try {
      const res = await fetch(`${API}/api/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          zip_code: zipCode,
          items: selections,
        }),
      });
      if (!res.ok) throw new Error("Reservation failed");
      const data = await res.json();
      setReservation(data);
      setScreen("reservation");
    } catch (err) {
      console.error(err);
    } finally {
      setReservingStoreId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-bg-primary">
      <NavBar currentScreen={screen === "home" ? 0 : screen === "processing" ? 2 : 3} />

      <main className="flex-1">
        {screen === "home" && (
          <Homepage
            description={description}
            onDescriptionChange={setDescription}
            uploadPreview={uploadPreview}
            onFileChange={handleFileChange}
            zipCode={zipCode}
            onZipChange={setZipCode}
            onSubmit={handleSubmit}
          />
        )}

        {screen === "gender-size" && (
          <GenderSizeScreen
            query={description}
            onConfirm={handleGenderSizeConfirm}
            onBack={() => setScreen("home")}
          />
        )}

        {screen === "processing" && (
          <Processing
            steps={processingSteps}
            done={processingDone}
            stage={processingStage}
            query={description}
            meta={processingMeta}
          />
        )}

        {screen === "item-results" && (
          <ItemResults
            description={itemDescription}
            results={itemResults}
            apiUrl={API}
            zipCode={zipCode}
            onReset={reset}
            onReserve={handleReserveSingleItem}
            reservingItemId={reservingItemId}
            onRefine={handleItemRefine}
            conversationHistory={itemConversationHistory}
            isRefining={isItemRefining}
          />
        )}

        {screen === "event-results" && eventData && (
          <EventResults
            eventData={eventData}
            outfit={outfit}
            itemOrder={itemOrder}
            apiUrl={API}
            onReset={reset}
            onReserveOutfit={handleReserveOutfit}
            reservingStoreId={reservingStoreId}
            onRefine={handleRefine}
            conversationHistory={conversationHistory}
            isRefining={isRefining}
          />
        )}

        {screen === "reservation" && reservation && (
          <ReservationConfirmation
            reservation={reservation}
            apiUrl={API}
            onBack={() =>
              setScreen(workflow === "find-item" ? "item-results" : "event-results")
            }
            onReset={reset}
          />
        )}
      </main>

      {screen !== "home" && (
        <div className="text-center py-6 border-t border-border">
          <button
            onClick={reset}
            className="text-[0.7rem] tracking-[0.1em] text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Start over
          </button>
        </div>
      )}
    </div>
  );
}
