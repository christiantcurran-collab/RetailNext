"""
RetailNext Outfit Assistant — FastAPI Backend
"""
from pathlib import Path as _Path
from dotenv import load_dotenv
_env_path = _Path(__file__).resolve().parent / ".env"
_loaded = load_dotenv(_env_path)
import os as _os



import os
import json
import ast
import base64
import uuid
import itertools
import concurrent.futures
from io import BytesIO
from pathlib import Path
from urllib.parse import quote_plus
import re

import numpy as np
import pandas as pd
import tiktoken
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from tenacity import retry, wait_random_exponential, stop_after_attempt
from PIL import Image, ImageFilter, ImageEnhance

# --- Config ---
GPT_MODEL = "gpt-4o-mini"
GPT_VISION_MODEL = "gpt-4o"
EMBEDDING_MODEL = "text-embedding-3-large"
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "sample_clothes"
STYLES_CSV = DATA_DIR / "sample_styles.csv"
EMBEDDINGS_NPY = DATA_DIR / "embeddings.npy"
IMAGES_DIR = DATA_DIR / "sample_images"
INVENTORY_JSON = DATA_DIR / "store_inventory.json"

app = FastAPI(title="RetailNext Outfit Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import math

# --- Store inventory (loaded once) ---
_inventory = None


def get_inventory() -> dict:
    global _inventory
    if _inventory is not None:
        return _inventory
    with open(INVENTORY_JSON, encoding="utf-8") as f:
        _inventory = json.load(f)
    return _inventory


# Approximate lat/lon for 10 Manhattan zip codes (for distance calc)
ZIP_COORDS = {
    "10001": (40.7484, -74.0000),  # Midtown South / Chelsea
    "10002": (40.7157, -73.9863),  # Lower East Side
    "10003": (40.7317, -73.9893),  # East Village / Flatiron
    "10007": (40.7135, -74.0078),  # FiDi / City Hall
    "10011": (40.7418, -74.0003),  # Chelsea / West Village
    "10016": (40.7459, -73.9781),  # Murray Hill
    "10019": (40.7654, -73.9856),  # Midtown West
    "10028": (40.7766, -73.9536),  # Upper East Side
    "10036": (40.7590, -73.9890),  # Times Square / Hell's Kitchen
    "10065": (40.7645, -73.9633),  # Upper East Side / Lenox Hill
}

ZIP_ROUTE_ORIGINS = {
    "10001": "10001, Manhattan, New York, NY, USA",
    "10002": "10002, Manhattan, New York, NY, USA",
    "10003": "10003, Manhattan, New York, NY, USA",
    "10007": "10007, Manhattan, New York, NY, USA",
    "10011": "10011, Manhattan, New York, NY, USA",
    "10016": "10016, Manhattan, New York, NY, USA",
    "10019": "10019, Manhattan, New York, NY, USA",
    "10028": "10028, Manhattan, New York, NY, USA",
    "10036": "10036, Manhattan, New York, NY, USA",
    "10065": "10065, Manhattan, New York, NY, USA",
}


def get_route_origin(zip_code: str) -> str:
    return ZIP_ROUTE_ORIGINS.get(zip_code, f"{zip_code}, Manhattan, New York, NY, USA")


def haversine(lat1, lon1, lat2, lon2):
    """Distance in miles between two lat/lon points."""
    R = 3959  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_store_with_stock(item_id: str, zip_code: str):
    """Find the closest store that has stock for a given item."""
    inv = get_inventory()
    stores = inv["stores"]
    item_inv = inv["inventory"].get(item_id)
    if not item_inv:
        return None

    user_coords = ZIP_COORDS.get(zip_code)
    if not user_coords:
        return None

    # Sort stores by distance, return first with stock > 0
    ranked = []
    for store in stores:
        dist = haversine(user_coords[0], user_coords[1], store["lat"], store["lon"])
        stock = item_inv["stock"].get(store["id"], 0)
        ranked.append({**store, "distance_mi": round(dist, 1), "stock": stock})
    ranked.sort(key=lambda s: s["distance_mi"])

    # Best with stock
    best = next((s for s in ranked if s["stock"] > 0), None)
    return {
        "nearest_with_stock": best,
        "all_stores": ranked,
        "aisle": item_inv["aisle"],
    }


_client = None


def get_client():
    global _client
    if _client is None:
        _client = OpenAI()
    return _client

# --- Data (loaded once at startup) ---
_df = None
_matrix = None  # (n, 3072) normalised float32 matrix for fast similarity


def get_df() -> pd.DataFrame:
    global _df, _matrix
    if _df is not None:
        return _df
    df = pd.read_csv(STYLES_CSV, on_bad_lines="skip")
    if EMBEDDINGS_NPY.exists():
        raw = np.load(EMBEDDINGS_NPY)                          # (n, 3072) float32
        norms = np.linalg.norm(raw, axis=1, keepdims=True)
        _matrix = (raw / norms).astype(np.float32)
        df["embeddings"] = [_matrix[i] for i in range(len(df))]
    else:
        descriptions = df["productDisplayName"].astype(str).tolist()
        df["embeddings"] = embed_corpus(descriptions)
        raw = np.array(df["embeddings"].tolist(), dtype=np.float32)
        norms = np.linalg.norm(raw, axis=1, keepdims=True)
        _matrix = (raw / norms).astype(np.float32)
        np.save(EMBEDDINGS_NPY, raw)
    _df = df
    return _df


# --- Search parsing helpers ---

SEARCH_STOPWORDS = {
    "a", "an", "and", "any", "for", "from", "i", "im", "in", "item", "it",
    "look", "looking", "me", "need", "of", "please", "show", "something",
    "that", "the", "to", "want", "with",
}

ARTICLE_TYPE_KEYWORDS = {
    "Dresses": {"dress", "dresses", "gown", "gowns"},
    "Tops": {"top", "tops", "blouse", "blouses"},
    "Shirts": {"shirt", "shirts", "button down", "button-down"},
    "Tshirts": {"tshirt", "tshirts", "t shirt", "t-shirts", "tee", "tees"},
    "Skirts": {"skirt", "skirts"},
    "Jeans": {"jean", "jeans", "denim"},
    "Trousers": {"trouser", "trousers", "pants", "slacks"},
    "Shorts": {"short", "shorts"},
    "Jackets": {"jacket", "jackets", "coat", "coats", "blazer", "blazers"},
    "Sweaters": {"sweater", "sweaters", "jumper", "jumpers", "knit", "knits"},
    "Sweatshirts": {"sweatshirt", "sweatshirts", "hoodie", "hoodies"},
    "Heels": {"heel", "heels", "pumps"},
    "Flats": {"flat", "flats", "ballet flat", "ballet flats"},
    "Casual Shoes": {"sneaker", "sneakers", "trainer", "trainers", "casual shoes"},
    "Formal Shoes": {"loafer", "loafers", "oxford", "oxfords", "formal shoes"},
    "Sandals": {"sandal", "sandals"},
    "Kurta Sets": {"kurta set", "kurta sets"},
    "Kurtas": {"kurta", "kurtas"},
    "Kurtis": {"kurti", "kurtis"},
    "Tunics": {"tunic", "tunics"},
    "Leggings": {"legging", "leggings"},
}

COLOUR_KEYWORDS = {
    "Black": {"black"},
    "Blue": {"blue", "navy", "cobalt"},
    "Brown": {"brown", "tan", "camel"},
    "Burgundy": {"burgundy", "wine"},
    "Charcoal": {"charcoal", "graphite"},
    "Cream": {"cream", "ivory", "off white", "off-white"},
    "Green": {"green", "olive", "emerald", "mint", "lime"},
    "Grey": {"grey", "gray", "silver"},
    "Khaki": {"khaki", "stone"},
    "Lavender": {"lavender", "lilac"},
    "Magenta": {"magenta", "fuchsia"},
    "Maroon": {"maroon"},
    "Multi": {"multi", "multicolor", "multicolour"},
    "Navy Blue": {"navy blue"},
    "Orange": {"orange", "coral", "peach"},
    "Pink": {"pink", "rose"},
    "Purple": {"purple", "violet"},
    "Red": {"red", "crimson"},
    "Turquoise Blue": {"turquoise", "aqua"},
    "White": {"white"},
    "Yellow": {"yellow", "mustard"},
}

GENDER_KEYWORDS = {
    "Women": {"women", "woman", "womens", "women's", "ladies", "female", "girl", "girls"},
    "Men": {"men", "man", "mens", "men's", "male", "guy", "guys", "boy", "boys"},
}


def normalize_search_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()


def tokenize_search_text(text: str) -> list[str]:
    return [
        token for token in normalize_search_text(text).split()
        if token and token not in SEARCH_STOPWORDS
    ]


def extract_search_preferences(description: str) -> dict:
    normalized_text = normalize_search_text(description)
    padded_text = f" {normalized_text} "

    article_types = []
    for article_type, keywords in ARTICLE_TYPE_KEYWORDS.items():
        if any(f" {normalize_search_text(keyword)} " in padded_text for keyword in keywords):
            article_types.append(article_type)

    colours = []
    for colour, keywords in COLOUR_KEYWORDS.items():
        if any(f" {normalize_search_text(keyword)} " in padded_text for keyword in keywords):
            colours.append(colour)

    gender = None
    for candidate_gender, keywords in GENDER_KEYWORDS.items():
        if any(f" {normalize_search_text(keyword)} " in padded_text for keyword in keywords):
            gender = candidate_gender
            break

    return {
        "article_types": article_types,
        "colours": colours,
        "gender": gender,
        "query_terms": tokenize_search_text(description),
    }


def extract_budget_from_text(description: str) -> float | None:
    text = str(description).lower()
    patterns = [
        r"(?:budget|under|max(?:imum)?|up to|around|about)\s*(?:of\s*)?(?:[$£€]\s*)?(\d+(?:\.\d+)?)",
        r"[$£€]\s*(\d+(?:\.\d+)?)",
        r"(\d+(?:\.\d+)?)\s*(?:usd|dollars?|gbp|pounds?|eur|euros?)\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return float(match.group(1))

    return None


def collect_text_search_candidates(df: pd.DataFrame, preferences: dict, limit: int = 160) -> set[int]:
    article_types = preferences["article_types"]
    colours = preferences["colours"]
    gender = preferences["gender"]

    masks = []
    if article_types:
        masks.append(df["articleType"].isin(article_types))
    if colours:
        masks.append(df["baseColour"].isin(colours))
    if gender:
        masks.append(df["gender"].isin([gender, "Unisex"]))

    if not masks:
        return set()

    candidate_indices: list[int] = []
    for count in range(len(masks), 0, -1):
        for combo in itertools.combinations(masks, count):
            mask = combo[0].copy()
            for extra_mask in combo[1:]:
                mask &= extra_mask
            candidate_indices.extend(df.index[mask].tolist())
            if len(candidate_indices) >= limit:
                break
        if len(candidate_indices) >= limit:
            break

    seen = set()
    deduped = []
    for idx in candidate_indices:
        if idx not in seen:
            seen.add(idx)
            deduped.append(idx)
        if len(deduped) >= limit:
            break
    return set(deduped)


def count_search_preference_matches(item: pd.Series, preferences: dict) -> tuple[int, int]:
    matched = 0
    total = 0

    article_types = preferences["article_types"]
    if article_types:
        total += 1
        if str(item.get("articleType", "")) in article_types:
            matched += 1

    colours = preferences["colours"]
    if colours:
        total += 1
        if str(item.get("baseColour", "")) in colours:
            matched += 1

    gender = preferences["gender"]
    if gender:
        total += 1
        if str(item.get("gender", "")) in (gender, "Unisex"):
            matched += 1

    return matched, total


def score_text_search_candidate(item: pd.Series, embedding_score: float, preferences: dict) -> float:
    matched_preferences, total_preferences = count_search_preference_matches(item, preferences)
    query_terms = set(preferences["query_terms"])
    name_terms = set(tokenize_search_text(str(item.get("productDisplayName", ""))))
    overlap = len(query_terms & name_terms)

    score = embedding_score * 0.75

    if preferences["article_types"]:
        score += 0.22 if str(item.get("articleType", "")) in preferences["article_types"] else -0.18
    if preferences["colours"]:
        score += 0.22 if str(item.get("baseColour", "")) in preferences["colours"] else -0.15
    if preferences["gender"]:
        score += 0.08 if str(item.get("gender", "")) in (preferences["gender"], "Unisex") else -0.06

    if total_preferences and matched_preferences == total_preferences:
        score += 0.18

    score += min(overlap * 0.04, 0.12)
    return score


def format_match_pct(score: float) -> int:
    return round(max(1, min(99, score * 100)))


def build_catalog_result(item: pd.Series, zip_code: str, match_score: float) -> dict:
    item_id = int(item["id"])
    article_type = str(item.get("articleType", ""))
    gender = str(item.get("gender", ""))
    return {
        "id": item_id,
        "name": str(item["productDisplayName"]),
        "match_pct": format_match_pct(match_score),
        "price": get_item_price(article_type, item_id),
        "sizes": get_item_sizes(article_type, gender),
        "articleType": article_type,
        "stock": nearest_store_with_stock(str(item_id), zip_code),
    }


def search_catalog_items(
    description: str,
    zip_code: str,
    limit: int = 3,
    excluded_ids: set[int] | None = None,
) -> list[dict]:
    df = get_df()
    search_preferences = extract_search_preferences(description)
    [query_embedding] = get_embeddings([description])

    top_matches = find_similar(query_embedding, df["embeddings"].tolist(), threshold=0.5, top_k=80)
    candidate_scores = {idx: score for idx, score in top_matches}
    for idx in collect_text_search_candidates(df, search_preferences):
        candidate_scores.setdefault(idx, 0.0)

    ranked_matches = []
    for idx, embedding_score in candidate_scores.items():
        item = df.iloc[idx]
        matched_preferences, total_preferences = count_search_preference_matches(item, search_preferences)
        ranked_matches.append(
            (
                idx,
                embedding_score,
                score_text_search_candidate(item, embedding_score, search_preferences),
                matched_preferences,
                total_preferences,
            )
        )

    ranked_matches.sort(
        key=lambda match: (
            match[3] / match[4] if match[4] else 0.0,
            match[3],
            match[2],
            match[1],
        ),
        reverse=True,
    )

    MIN_SCORE = 0.5
    excluded = set(excluded_ids or set())
    results = []
    for idx, _, score, _, _ in ranked_matches:
        if score < MIN_SCORE:
            break
        item = df.iloc[idx]
        item_id = int(item["id"])
        if item_id in excluded or not (IMAGES_DIR / f"{item_id}.jpg").exists():
            continue
        excluded.add(item_id)
        results.append(build_catalog_result(item, zip_code, score))
        if len(results) >= limit:
            break

    return results


def score_budget_fit(price: int, target_price: float | None) -> float:
    if target_price is None or target_price <= 0:
        return 0.0

    delta_ratio = (price - target_price) / target_price
    if price <= target_price:
        return max(0.18 - abs(delta_ratio) * 0.12, 0.04)
    return -min(delta_ratio * 0.35, 0.35)


def build_outfit_category_options(
    cat_df: pd.DataFrame,
    embedding: list[float],
    zip_code: str,
    budget_target: float | None = None,
    limit: int = 2,
    excluded_ids: set[int] | None = None,
) -> list[dict]:
    top_matches = find_similar(embedding, cat_df["embeddings"].tolist(), threshold=0.2, top_k=12)
    ranked_candidates = []
    seen_ids = set(excluded_ids or set())

    for m_idx, similarity_score in top_matches:
        row = cat_df.iloc[m_idx]
        item_id = int(row["id"])
        if item_id in seen_ids or not (IMAGES_DIR / f"{item_id}.jpg").exists():
            continue

        article_type = str(row.get("articleType", ""))
        price = get_item_price(article_type, item_id)
        combined_score = similarity_score + score_budget_fit(price, budget_target)
        ranked_candidates.append(
            {
                "row": row,
                "combined_score": combined_score,
                "similarity_score": similarity_score,
                "price": price,
                "within_budget": budget_target is None or price <= budget_target,
                "budget_gap": abs(price - budget_target) if budget_target is not None else 0.0,
            }
        )

    ranked_candidates.sort(
        key=lambda candidate: (
            candidate["within_budget"],
            candidate["combined_score"],
            candidate["similarity_score"],
            -candidate["budget_gap"],
        ),
        reverse=True,
    )

    options = []
    for candidate in ranked_candidates:
        row = candidate["row"]
        item_id = int(row["id"])
        seen_ids.add(item_id)
        options.append(build_catalog_result(row, zip_code, candidate["combined_score"]))
        if len(options) >= limit:
            break

    return options


# --- Embedding helpers ---

@retry(wait=wait_random_exponential(min=1, max=40), stop=stop_after_attempt(10))
def get_embeddings(input_texts: list):
    response = get_client().embeddings.create(input=input_texts, model=EMBEDDING_MODEL).data
    return [d.embedding for d in response]


def batchify(iterable, n=1):
    length = len(iterable)
    for i in range(0, length, n):
        yield iterable[i : min(i + n, length)]


def embed_corpus(corpus, batch_size=64, num_workers=8, max_context_len=8191):
    encoding = tiktoken.get_encoding("cl100k_base")
    encoded = [t[:max_context_len] for t in encoding.encode_batch(corpus)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as ex:
        futures = [ex.submit(get_embeddings, batch) for batch in batchify(encoded, batch_size)]
        embeddings = []
        for f in futures:
            embeddings.extend(f.result())
    return embeddings


# --- Similarity ---

def find_similar(input_emb, embeddings, threshold=0.2, top_k=4):
    q = np.array(input_emb, dtype=np.float32)
    q /= np.linalg.norm(q)
    mat = np.array(embeddings, dtype=np.float32)
    sims = mat @ q
    order = np.argsort(sims)[::-1]
    return [(int(i), float(sims[i])) for i in order if sims[i] >= threshold][:top_k]


# --- Image helpers ---

def prepare_image(image_path: Path, max_width=800) -> Image.Image:
    """Resize large images down for web serving, or upscale tiny thumbnails."""
    img = Image.open(image_path).convert("RGB")
    if img.width > max_width:
        # Downscale large images for faster serving
        scale = max_width / img.width
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    elif img.width < 300:
        # Upscale tiny thumbnails (fallback for missing hi-res)
        target = 600
        while img.width < target // 2:
            img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
        scale = target / img.width
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
        img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=80, threshold=2))
        img = ImageEnhance.Contrast(img).enhance(1.08)
    return img



def parse_json_block(raw: str):
    raw = raw.strip()
    if not raw:
        raise ValueError("Empty model response")

    json_like = raw
    fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw, re.IGNORECASE)
    if fence_match:
        json_like = fence_match.group(1)
    elif "{" in raw and "}" in raw:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < end:
            json_like = raw[start : end + 1]

    return json.loads(json_like)


def shrink_for_gpt(image_b64: str, max_px=384) -> str:
    """Resize a base64 image down to max_px for GPT analysis (saves tokens)."""
    raw = base64.b64decode(image_b64)
    img = Image.open(BytesIO(raw)).convert("RGB")
    if max(img.size) > max_px:
        img.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return base64.b64encode(buf.getvalue()).decode()


# --- GPT calls ---

SAMPLE_OPTIONS = {
    "mens-shirt-2133": {"file": "2133.jpg", "label": "Men's Shirt"},
    "womens-top-7143": {"file": "7143.jpg", "label": "Women's Top"},
    "mens-tshirt-4226": {"file": "4226.jpg", "label": "Men's T-Shirt"},
}


@app.get("/api/samples")
def get_samples():
    """Return available sample images."""
    return [
        {"id": k, "label": v["label"], "file": v["file"]}
        for k, v in SAMPLE_OPTIONS.items()
    ]


@app.get("/api/image/{image_id}")
def get_image(image_id: str):
    """Serve an upscaled product image by item ID."""
    path = IMAGES_DIR / f"{image_id}.jpg"
    if not path.exists():
        raise HTTPException(404, "Image not found")
    img = prepare_image(path)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=92)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg")


from pydantic import BaseModel

class ReserveItemRequest(BaseModel):
    id: int
    size: str


class ReserveRequest(BaseModel):
    store_id: str
    zip_code: str = "10001"
    items: list[ReserveItemRequest]

CATEGORY_GROUPS = {
    "topwear": {"Tshirts", "Shirts", "Tops", "Tunics", "Sweaters", "Sweatshirts", "Shrug", "Kurtis", "Kurtas"},
    "bottomwear": {"Jeans", "Trousers", "Shorts", "Skirts", "Capris", "Track Pants", "Leggings", "Lounge Pants", "Lounge Shorts", "Churidar", "Patiala"},
    "footwear": {"Casual Shoes", "Formal Shoes", "Sports Shoes", "Heels", "Flats", "Sandals", "Flip Flops"},
    "outerwear": {"Jackets", "Waistcoat"},
    "fullbody": {"Dresses", "Rompers", "Sarees", "Kurta Sets", "Tracksuits", "Night suits", "Nightdress", "Bath Robe"},
}

TOP_SIZE_ARTICLES = CATEGORY_GROUPS["topwear"] | CATEGORY_GROUPS["outerwear"] | {"Dresses", "Rompers", "Kurta Sets"}
BOTTOM_SIZE_ARTICLES = CATEGORY_GROUPS["bottomwear"]
SHOE_SIZE_ARTICLES = CATEGORY_GROUPS["footwear"]

PRICE_RULES = {
    "Tshirts": (34, 4, 6),
    "Shirts": (62, 5, 6),
    "Tops": (48, 4, 6),
    "Tunics": (56, 4, 6),
    "Sweaters": (74, 5, 6),
    "Sweatshirts": (68, 5, 6),
    "Shrug": (52, 4, 5),
    "Kurtis": (64, 5, 6),
    "Kurtas": (66, 5, 6),
    "Jeans": (78, 6, 6),
    "Trousers": (82, 6, 6),
    "Shorts": (52, 4, 5),
    "Skirts": (58, 5, 5),
    "Capris": (54, 4, 5),
    "Track Pants": (64, 5, 6),
    "Leggings": (42, 4, 5),
    "Lounge Pants": (46, 4, 5),
    "Lounge Shorts": (38, 3, 5),
    "Churidar": (44, 4, 5),
    "Patiala": (48, 4, 5),
    "Casual Shoes": (88, 7, 6),
    "Formal Shoes": (118, 8, 6),
    "Sports Shoes": (104, 8, 6),
    "Heels": (92, 7, 6),
    "Flats": (64, 5, 6),
    "Sandals": (58, 5, 6),
    "Flip Flops": (34, 3, 5),
    "Jackets": (128, 10, 6),
    "Waistcoat": (94, 8, 5),
    "Dresses": (96, 8, 6),
    "Rompers": (78, 6, 5),
    "Sarees": (110, 9, 6),
    "Kurta Sets": (102, 8, 6),
    "Tracksuits": (118, 9, 5),
    "Night suits": (58, 5, 5),
    "Nightdress": (52, 4, 5),
    "Bath Robe": (64, 5, 5),
}


def get_item_price(article_type: str, item_id: int) -> int:
    base, step, variants = PRICE_RULES.get(article_type, (49, 5, 6))
    return base + (item_id % variants) * step


def get_item_sizes(article_type: str, gender: str) -> list[str]:
    normalized_gender = (gender or "").strip().lower()
    if article_type in TOP_SIZE_ARTICLES:
        return ["Small", "Medium", "Large", "Extra Large"]
    if article_type in BOTTOM_SIZE_ARTICLES:
        if normalized_gender == "women":
            return ['24"', '26"', '28"', '30"', '32"', '34"']
        if normalized_gender == "men":
            return ['30"', '32"', '34"', '36"', '38"', '40"']
        return ['28"', '30"', '32"', '34"', '36"', '38"']
    if article_type in SHOE_SIZE_ARTICLES:
        if normalized_gender == "women":
            return ["5", "6", "7", "8", "9", "10"]
        if normalized_gender == "men":
            return ["7", "8", "9", "10", "11", "12"]
        return ["6", "7", "8", "9", "10", "11"]
    return ["One Size"]


def build_verified_item(item, reason: str) -> dict:
    item_id = int(item["id"])
    article_type = str(item.get("articleType", ""))
    gender = str(item.get("gender", ""))
    return {
        "id": item_id,
        "name": str(item["productDisplayName"]),
        "reason": reason,
        "price": get_item_price(article_type, item_id),
        "sizes": get_item_sizes(article_type, gender),
        "articleType": article_type,
    }


def get_store_by_id(store_id: str):
    inv = get_inventory()
    return next((store for store in inv["stores"] if store["id"] == store_id), None)


def build_route_details(store: dict, zip_code: str) -> dict:
    origin = ZIP_COORDS.get(zip_code)
    route_origin = get_route_origin(zip_code)
    distance_mi = None
    if origin:
        distance_mi = round(haversine(origin[0], origin[1], store["lat"], store["lon"]), 1)
    return {
        "origin_zip": zip_code,
        "distance_mi": distance_mi,
        "summary": (
            f"Head to {store['address']} in {store['neighborhood']}."
            + (f" It is about {distance_mi} miles from ZIP {zip_code}." if distance_mi is not None else "")
        ),
        "map_url": (
            "https://www.google.com/maps/dir/?api=1"
            f"&origin={quote_plus(route_origin)}"
            f"&destination={quote_plus(store['address'])}"
        ),
    }



@retry(wait=wait_random_exponential(min=1, max=20), stop=stop_after_attempt(5))
def image_to_description_gpt(image_b64: str) -> str:
    """Convert a clothing image to a structured text description using GPT-4o."""
    resp = get_client().chat.completions.create(
        model=GPT_VISION_MODEL,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe this clothing item in one concise sentence covering: gender target, colour, material (if visible), cut/style, and item type. Example: \"Women's green satin midi skirt, A-line cut, mid-length.\" Return only the description, no extra text."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}", "detail": "low"}},
            ],
        }],
        max_tokens=120,
    )
    return resp.choices[0].message.content.strip()


@retry(wait=wait_random_exponential(min=1, max=20), stop=stop_after_attempt(5))
def classify_and_plan_gpt(description: str, subcategories: list) -> str:
    """Single GPT call: classify intent, parse event, infer gender, generate item descriptions."""
    resp = get_client().chat.completions.create(
        model=GPT_MODEL,
        response_format={"type": "json_object"},
        messages=[{
            "role": "user",
            "content": f"""Classify this fashion query. If it describes an event or occasion, generate a full outfit plan.

Query: "{description}"

Return one of these two JSON structures:

If the query is for a SPECIFIC ITEM (not an event):
{{"workflow": "find-item"}}

If the query describes an EVENT or OCCASION requiring a complete outfit:
{{
  "workflow": "plan-outfit",
  "occasion": "wedding",
  "formality": "semi-formal",
  "season": "summer",
  "budget": 300,
  "gender": "Women",
  "items": [
    {{"description": "Women's navy cowl-neck midi dress", "category": "Dresses"}},
    {{"description": "Gold strappy heeled sandal", "category": "Heels"}},
    {{"description": "Small satin clutch bag", "category": "Clutches"}}
  ]
}}

OR if gender is ambiguous (query does not specify, e.g. "formal outfit for a wedding"):
{{
  "workflow": "plan-outfit",
  "occasion": "wedding",
  "formality": "formal",
  "season": "summer",
  "budget": null,
  "gender": null,
  "men_items": [
    {{"description": "Navy slim-fit suit jacket", "category": "Blazers"}},
    {{"description": "Brown leather Oxford shoes", "category": "Formal Shoes"}},
    {{"description": "White dress shirt", "category": "Shirts"}}
  ],
  "women_items": [
    {{"description": "Floor-length evening gown", "category": "Dresses"}},
    {{"description": "Strappy heeled sandal, nude", "category": "Heels"}},
    {{"description": "Small satin clutch bag", "category": "Clutches"}}
  ]
}}

Rules:
- gender DEFAULTS to null — if in any doubt, use null
- gender is "Women" ONLY if the query explicitly contains women's clothing words (dress, heels, skirt, blouse, handbag) or the words women/woman/female/she/her
- gender is "Men" ONLY if the query explicitly contains men's clothing words (suit, tie, blazer, oxford shoes, chinos) or the words men/man/male/he/him
- Any event or occasion without those explicit cues → gender null (e.g. "work event", "birthday party", "wedding", "rooftop dinner", "smart casual")
- When gender is null, include both men_items and women_items (3 items each), omit items
- When gender is not null, include items (3 items), omit men_items/women_items
- items: hero garment first, footwear second, one accessory or complement third
- budget MUST be null unless the user explicitly typed a number, range, or currency amount
- Each category MUST be exactly one of: {subcategories}
- Do not include markdown fences""",
        }],
    )
    return resp.choices[0].message.content


@retry(wait=wait_random_exponential(min=1, max=20), stop=stop_after_attempt(3))
def refine_outfit_gpt(event: dict, outfit_summary: str, conversation_history: list,
                      user_message: str, subcategories: list) -> str:
    """Ask GPT to refine one or all outfit slots based on user feedback."""
    history_text = "\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
        for m in conversation_history
    ) if conversation_history else "(none)"
    resp = get_client().chat.completions.create(
        model=GPT_MODEL,
        response_format={"type": "json_object"},
        messages=[{
            "role": "user",
            "content": f"""You are a fashion assistant. An outfit has been built for a {event.get('formality','')} {event.get('occasion','')} in {event.get('season','')} for {event.get('gender','')}.

Current outfit:
{outfit_summary}

Conversation so far:
{history_text}

User says: "{user_message}"

Decide if the user wants to change ONE SLOT (e.g. "different shoes", "I don't like the bag") or ALL SLOTS (e.g. "try something different", "make it more casual").

Return JSON:
{{
  "scope": "single",
  "assistant_message": "one sentence describing what you changed",
  "items": [
    {{"description": "...", "category": "..."}}
  ]
}}

OR for a full outfit change:
{{
  "scope": "full",
  "assistant_message": "one sentence describing the new direction",
  "items": [
    {{"description": "...", "category": "..."}},
    {{"description": "...", "category": "..."}},
    {{"description": "...", "category": "..."}}
  ]
}}

Rules:
- scope "single": items must contain exactly 1 item for the slot the user mentioned
- scope "full": items must contain exactly 3 items (hero garment, footwear, accessory)
- Each category MUST be exactly one of: {subcategories}
- Do not include markdown fences""",
        }],
    )
    return resp.choices[0].message.content


@retry(wait=wait_random_exponential(min=1, max=20), stop=stop_after_attempt(3))
def refine_item_gpt(original_description: str, conversation_history: list, user_message: str) -> str:
    """Generate a refined item search description based on user feedback."""
    history_text = "\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
        for m in conversation_history
    ) if conversation_history else "(none)"
    resp = get_client().chat.completions.create(
        model=GPT_MODEL,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": f"""You are a fashion search assistant.

Original search: "{original_description}"
Conversation so far:
{history_text}
User says: "{user_message}"

Generate a refined item search description incorporating the user's feedback.
Return JSON:
{{"refined_description": "...", "assistant_message": "one sentence describing what changed"}}
Do not include markdown fences."""}],
    )
    return resp.choices[0].message.content


class ItemRefineRequest(BaseModel):
    original_description: str
    shown_item_ids: list[int] = []
    conversation_history: list = []
    user_message: str
    zip_code: str = "10001"


@app.post("/api/item/refine")
async def api_item_refine(req: ItemRefineRequest):
    """Refine an item search based on user feedback, excluding already-shown items."""
    raw = refine_item_gpt(req.original_description, req.conversation_history, req.user_message)
    refinement = parse_json_block(raw)
    refined_description = refinement.get("refined_description", req.original_description)
    assistant_message = refinement.get("assistant_message", "Here are some alternatives")
    results = search_catalog_items(
        refined_description,
        req.zip_code,
        limit=3,
        excluded_ids=set(req.shown_item_ids),
    )

    new_history = req.conversation_history + [
        {"role": "user", "content": req.user_message},
        {"role": "assistant", "content": assistant_message},
    ]
    return {
        "description": refined_description,
        "results": results,
        "assistant_message": assistant_message,
        "conversation_history": new_history,
    }



def build_outfit_from_items(items: list, gender: str, zip_code: str, event_data: dict) -> dict:
    """Embed item descriptions, run cosine search per category, return outfit + item_order."""
    df = get_df()
    descriptions = [item["description"] for item in items]
    embeddings_list = get_embeddings(descriptions)
    outfit: dict = {}
    item_order: list = []
    unique_categories = []
    for item in items:
        category = item["category"]
        if category not in unique_categories:
            unique_categories.append(category)
    budget_target = (
        float(event_data["budget"]) / len(unique_categories)
        if event_data.get("budget") not in (None, "")
        and unique_categories
        else None
    )

    for item, emb in zip(items, embeddings_list):
        category = item["category"]
        if category in outfit:
            continue
        cat_df = df[df["articleType"] == category]
        if gender and gender not in ("Unisex", ""):
            cat_df = cat_df[cat_df["gender"].isin([gender, "Unisex"])]
        if cat_df.empty:
            continue
        category_options = build_outfit_category_options(
            cat_df=cat_df,
            embedding=emb,
            zip_code=zip_code,
            budget_target=budget_target,
            limit=2,
        )
        if category_options:
            outfit[category] = {"description": item["description"], "options": category_options}
            item_order.append(category)
    return {
        "workflow": "plan-outfit",
        "event": {
            "occasion": event_data.get("occasion", ""),
            "formality": event_data.get("formality", ""),
            "season": event_data.get("season", ""),
            "gender": gender,
            "budget": event_data.get("budget"),
        },
        "outfit": outfit,
        "item_order": item_order,
    }


@app.post("/api/search")
async def api_search(
    description: str | None = Form(None),
    file: UploadFile | None = File(None),
    zip_code: str = Form("10001"),
):
    """Single GPT call classifies intent, infers gender, generates outfit plan or routes find-item."""
    df = get_df()

    # Images → always find-item
    if file:
        data = await file.read()
        image_b64 = base64.b64encode(data).decode()
        small_b64 = shrink_for_gpt(image_b64)
        normalized_description = image_to_description_gpt(small_b64)
        results = search_catalog_items(normalized_description, zip_code, limit=3)
        return {"workflow": "find-item", "description": normalized_description, "results": results}

    if not description:
        raise HTTPException(400, "Provide a description or image file")

    # Single combined GPT call: classify + parse + generate items
    subcategories = df["articleType"].unique().tolist()
    raw = classify_and_plan_gpt(description.strip(), subcategories)
    plan = parse_json_block(raw)
    plan["budget"] = extract_budget_from_text(description.strip())
    workflow = plan.get("workflow", "find-item")

    if workflow == "plan-outfit":
        gender = plan.get("gender")  # may be None/null
        items = plan.get("items", [])

        if gender is None:
            # Gender ambiguous — return plan for frontend confirmation screen
            return {
                "workflow": "plan-outfit",
                "needs_gender": True,
                "occasion": plan.get("occasion", ""),
                "formality": plan.get("formality", ""),
                "season": plan.get("season", ""),
                "budget": plan.get("budget"),
                "men_items": plan.get("men_items", []),
                "women_items": plan.get("women_items", []),
            }

        if not items:
            workflow = "find-item"  # GPT failed to generate items, fall through
        else:
            return build_outfit_from_items(items, str(gender), zip_code, plan)

    # find-item path
    normalized_description = description.strip()
    results = search_catalog_items(normalized_description, zip_code, limit=3)
    return {"workflow": "find-item", "description": normalized_description, "results": results}


@app.post("/api/outfit/build")
async def api_outfit_build(
    gender: str = Form(...),
    items: str = Form(...),   # JSON array of {description, category}
    zip_code: str = Form("10001"),
    occasion: str = Form(""),
    formality: str = Form(""),
    season: str = Form(""),
    budget: str | None = Form(None),
):
    """Build outfit from confirmed gender + pre-generated item descriptions."""
    items_list = json.loads(items)
    event_data = {
        "occasion": occasion,
        "formality": formality,
        "season": season,
        "budget": float(budget) if budget else None,
    }
    return build_outfit_from_items(items_list, gender.strip().capitalize(), zip_code, event_data)


class RefineRequest(BaseModel):
    event: dict
    current_outfit: dict
    conversation_history: list = []
    user_message: str
    zip_code: str = "10001"


@app.post("/api/outfit/refine")
async def api_outfit_refine(req: RefineRequest):
    """Refine one slot or the full outfit based on user feedback."""
    df = get_df()
    subcategories = df["articleType"].unique().tolist()
    gender = req.event.get("gender", "Women")

    outfit_summary = "\n".join(
        f"- {cat}: {', '.join(opt['name'] for opt in req.current_outfit.get(cat, {}).get('options', [])[:2])}"
        for cat in req.current_outfit
    )

    raw = refine_outfit_gpt(req.event, outfit_summary, req.conversation_history, req.user_message, subcategories)
    refinement = parse_json_block(raw)

    scope = refinement.get("scope", "single")
    new_items = refinement.get("items", [])
    assistant_message = refinement.get("assistant_message", "Updated your outfit")

    descriptions = [item["description"] for item in new_items]
    embeddings_list = get_embeddings(descriptions)

    # Collect all item IDs already shown so we never repeat them
    shown_ids: set[int] = {
        int(opt["id"])
        for slot in req.current_outfit.values()
        for opt in slot.get("options", [])
    }
    budget_target = (
        float(req.event["budget"]) / len(req.current_outfit)
        if req.event.get("budget") not in (None, "")
        and req.current_outfit
        else None
    )

    updated_slots: dict = {}
    for item, emb in zip(new_items, embeddings_list):
        category = item["category"]
        cat_df = df[df["articleType"] == category]
        if gender and gender not in ("Unisex", ""):
            cat_df = cat_df[cat_df["gender"].isin([gender, "Unisex"])]
        if cat_df.empty:
            continue
        options = build_outfit_category_options(
            cat_df=cat_df,
            embedding=emb,
            zip_code=req.zip_code,
            budget_target=budget_target,
            limit=2,
            excluded_ids=shown_ids,
        )
        if options:
            updated_slots[category] = {"description": item["description"], "options": options}

    new_history = req.conversation_history + [
        {"role": "user", "content": req.user_message},
        {"role": "assistant", "content": assistant_message},
    ]

    return {
        "scope": scope,
        "updated_slots": updated_slots,
        "assistant_message": assistant_message,
        "conversation_history": new_history,
    }



@app.post("/api/reserve")
def api_reserve(req: ReserveRequest):
    inv = get_inventory()
    store = get_store_by_id(req.store_id)
    if not store:
        raise HTTPException(404, "Store not found")

    df = get_df()
    reserved_items = []
    total_price = 0

    for requested_item in req.items:
        item_id = str(requested_item.id)
        item_inv = inv["inventory"].get(item_id)
        if not item_inv:
            raise HTTPException(404, f"Inventory not found for item {item_id}")
        if item_inv["stock"].get(req.store_id, 0) < 1:
            raise HTTPException(409, f"Item {item_id} is no longer available at this store")

    for requested_item in req.items:
        item_id = str(requested_item.id)
        inv["inventory"][item_id]["stock"][req.store_id] -= 1
        item_row = df[df["id"] == requested_item.id]
        if item_row.empty:
            continue
        item = item_row.iloc[0]
        reserved = build_verified_item(item, "Reserved for in-store pickup.")
        reserved["size"] = requested_item.size
        reserved["aisle"] = inv["inventory"][item_id]["aisle"]
        total_price += reserved["price"]
        reserved_items.append(reserved)

    return {
        "reservation_id": f"RN-{uuid.uuid4().hex[:8].upper()}",
        "store": store,
        "items": reserved_items,
        "item_count": len(reserved_items),
        "total_price": total_price,
        "route": build_route_details(store, req.zip_code),
    }
