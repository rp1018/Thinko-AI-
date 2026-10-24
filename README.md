# Thinko AI v2

Flask backend + React UI (built files already in static/app, no Node needed on Render).
Model: meta/llama-3.3-70b-instruct via NVIDIA.

## Run locally
pip install -r requirements.txt
set NVIDIA_API_KEY=nvapi-...   (export on Linux/Mac)
python app.py   -> http://localhost:5000

## Deploy (Render)
Start command comes from Procfile. Env: NVIDIA_API_KEY (required), NVIDIA_MODEL, NVIDIA_FALLBACK_MODEL, SERP_API_KEY (optional, web search).

## Edit UI
cd frontend; npm install; npm run dev (port 5173, proxies /api to :5000); npm run build (writes to ../static/app)

Chats are saved in the browser per account; the server stores nothing.
