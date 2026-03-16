# RetailNext AI Style Assistant

RetailNext AI Style Assistant is a demo retail experience for a Fortune 1000 department store use case. Customers can search for a specific item, describe an event to get a full outfit, refine results conversationally, and reserve in-stock items at a nearby store.

This repository was built with Codex and GPT 5.4.

## What the app does

- Search for a single fashion item from text or an uploaded image
- Describe an event or occasion and receive a full outfit recommendation
- Refine item and outfit results with free-text follow-up prompts
- View store-aware stock availability based on a selected zip code
- Reserve one item or an entire outfit at a store

## Why this exists

The project is designed around a common retail problem: shoppers discover styles online or know the kind of look they want, but fail to find matching in-store inventory for an upcoming event. The app demonstrates how OpenAI models can be combined with retrieval, ranking, and a lightweight frontend to improve style discovery, inventory utilization, and customer conversion.

## Product workflows

### 1. Find item

The user enters a text query such as "black dress" or uploads a product image.

The backend:

- normalizes the query when needed
- embeds the item description
- compares it against a pre-indexed catalog
- ranks results using similarity plus lightweight text preference scoring
- returns the best in-stock matches

The user can then refine the results with prompts such as "make it more casual" or "show something darker".

### 2. Plan outfit

The user describes an event such as "summer wedding" or "interview outfit under 300 dollars".

The backend:

- classifies the request as an outfit workflow
- extracts structured event context such as occasion, formality, season, and budget
- generates suggested outfit items
- embeds each item description and retrieves the best catalog match per category
- returns a complete outfit with stock-aware store information

The outfit can also be refined through a conversational loop.

## Architecture

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4

The frontend is responsible for:

- collecting user input
- managing screen transitions
- calling backend APIs
- rendering result cards, chat refinement history, and reservation flows

### Backend

- FastAPI
- Python 3.12
- Pandas and NumPy for catalog loading and retrieval
- Pillow for image handling
- Tenacity for retry logic

The backend is responsible for:

- loading product and inventory sample data
- loading or generating embeddings
- calling OpenAI models
- performing similarity search and ranking
- maintaining stateless refinement endpoints
- returning store-aware responses for the frontend

### OpenAI usage

The app uses three OpenAI patterns:

- `gpt-4o-mini` for structured text reasoning such as workflow classification and refinement
- `gpt-4o` for vision-based image understanding
- `text-embedding-3-large` for semantic retrieval over the catalog

At startup, the backend loads precomputed catalog embeddings from `data/sample_clothes/embeddings.npy`. If that file is missing, it generates embeddings from the catalog and saves them back to disk for later runs.

## Repository structure

```text
.
|- backend/
|  |- main.py
|  |- requirements.txt
|  `- .env.example
|- data/
|  `- sample_clothes/
|- frontend/
|  |- app/
|  |- components/
|  |- public/
|  `- package.json
|- render.yaml
`- README.md
```

## Key backend endpoints

- `GET /api/samples`
  - Returns sample image options used by the experience
- `GET /api/image/{image_id}`
  - Serves a sample catalog image
- `POST /api/search`
  - Main entry point for text or image search
- `POST /api/item/refine`
  - Refines item search results based on conversation history
- `POST /api/outfit/build`
  - Builds a full outfit from structured item descriptions
- `POST /api/outfit/refine`
  - Refines one slot or an entire outfit
- `POST /api/reserve`
  - Reserves selected items at a store

## Local development

### Prerequisites

- Python 3.12
- Node.js 20 or newer
- npm
- An OpenAI API key

### 1. Configure environment variables

Backend:

```bash
cd backend
cp .env.example .env
```

Then set:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Frontend:

Create `frontend/.env.local` and set:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Deployment

This repository includes a `render.yaml` for deploying both services on Render:

- `retailnext-api` for the FastAPI backend
- `retailnext-frontend` for the Next.js frontend

The frontend reads `NEXT_PUBLIC_API_URL` from the backend service URL exposed by Render.




## Notes

- The sample catalog and inventory data are stored locally in `data/sample_clothes/`
- The backend is intentionally stateless for refinement; the client sends conversation history on each request
- The repository includes both application code and sample retail data used for demo purposes
