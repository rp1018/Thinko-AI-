"""
Thinko AI — backend
-------------------
Small, stateless Flask server:

  GET  /            -> serves the built React app (static/app/index.html)
  POST /api/chat    -> streams a reply from NVIDIA as Server-Sent Events
  GET  /api/health  -> quick status check
"""

import json
import os
import re
import time

import requests
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE_DIR, "static", "app")

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "static"), static_url_path="/static")


# ------------------------------------------------------------------ auto-load key
def ensure_api_key():
    """Ensure NVIDIA_API_KEY is populated from environment, .env, or start.sh."""
    current = os.environ.get("NVIDIA_API_KEY", "").strip()
    if current and not current.startswith("nvapi-xxxx"):
        return current

    env_file = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("NVIDIA_API_KEY="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val and not val.startswith("nvapi-xxxx"):
                            os.environ["NVIDIA_API_KEY"] = val
                            return val
        except Exception:
            pass

    start_sh = os.path.join(BASE_DIR, "start.sh")
    if os.path.exists(start_sh):
        try:
            with open(start_sh, "r", encoding="utf-8") as f:
                for line in f:
                    if "NVIDIA_API_KEY=" in line:
                        m = re.search(r'NVIDIA_API_KEY=["\']?([^"\'\s]+)["\']?', line)
                        if m:
                            val = m.group(1).strip()
                            if val and not val.startswith("nvapi-xxxx"):
                                os.environ["NVIDIA_API_KEY"] = val
                                return val
        except Exception:
            pass

    return ""


ensure_api_key()

NVIDIA_BASE_URL = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
SERP_API_KEY = os.environ.get("SERP_API_KEY")

CONNECT_TIMEOUT = 10
READ_TIMEOUT = 25

MAX_MESSAGES = 60
MAX_CHARS = 400_000
EFFORTS = {"low", "high", "max"}

# Preferred high-performance models in priority order
PREFERRED_MODELS = [
    "mistralai/mistral-large-2-instruct",
    "deepseek-ai/deepseek-v4.1-flash",
    "qwen/qwen2.5-72b-instruct",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "deepseek-ai/deepseek-r1",
]

_cached_live_models = []
_active_model = None


def get_live_models():
    """Fetch all active model IDs currently online on NVIDIA."""
    global _cached_live_models
    if _cached_live_models:
        return _cached_live_models
    key = ensure_api_key()
    if not key:
        return []
    try:
        resp = requests.get(
            f"{NVIDIA_BASE_URL}/models",
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            timeout=8,
        )
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            _cached_live_models = [m["id"] for m in data]
            print(f"[Thinko] Successfully fetched {len(_cached_live_models)} live models from NVIDIA.")
            return _cached_live_models
    except Exception as e:
        print(f"[Thinko] Warning: Could not fetch live models list: {e}")
    return []


def resolve_candidate_models():
    """Build candidate models list prioritizing live, non-expired endpoints."""
    live = get_live_models()
    candidates = []

    # If user explicitly set NVIDIA_MODEL, try that first
    explicit = os.environ.get("NVIDIA_MODEL")
    if explicit:
        candidates.append(explicit)

    # Add preferred models that are confirmed live on the API
    if live:
        for pref in PREFERRED_MODELS:
            if pref in live and pref not in candidates:
                candidates.append(pref)
        # Any remaining instruct/chat models in live
        for m in live:
            if ("instruct" in m or "chat" in m) and m not in candidates:
                candidates.append(m)
    else:
        for pref in PREFERRED_MODELS:
            if pref not in candidates:
                candidates.append(pref)

    return candidates or PREFERRED_MODELS


def get_active_model():
    global _active_model
    if _active_model:
        return _active_model
    candidates = resolve_candidate_models()
    _active_model = candidates[0] if candidates else PREFERRED_MODELS[0]
    return _active_model


SYSTEM_PROMPT = (
    "You are Thinko, a sharp, warm and genuinely helpful AI assistant. "
    "Always communicate and reply strictly in English only, unless the user explicitly asks to translate into another language. "
    "Answer clearly and directly. Use Markdown when it helps (short headings, lists, tables, "
    "fenced code blocks with a language tag). Keep replies concise unless the user asks for depth. "
    "If you are given web results, use them and mention the source names naturally; "
    "never invent links."
)


# ------------------------------------------------------------------ helpers
def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def clean_messages(raw):
    if not isinstance(raw, list):
        return None
    out = []
    for m in raw:
        if not isinstance(m, dict):
            continue
        role, content = m.get("role"), m.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            out.append({"role": role, "content": content})
    out = out[-MAX_MESSAGES:]
    while len(out) > 1 and sum(len(m["content"]) for m in out) > MAX_CHARS:
        out.pop(0)
    if not out or out[-1]["role"] != "user":
        return None
    return out


def search_web(query: str):
    if not SERP_API_KEY:
        return []
    try:
        res = requests.get(
            "https://serpapi.com/search.json",
            params={"q": query, "api_key": SERP_API_KEY, "num": 5},
            timeout=8,
        )
        res.raise_for_status()
        items = res.json().get("organic_results", [])[:5]
        return [
            {"title": i.get("title", ""), "link": i.get("link", ""), "snippet": i.get("snippet", "")}
            for i in items
            if i.get("link")
        ]
    except Exception:
        return []


def friendly_error(status=None, exc=None):
    if exc is not None:
        if isinstance(exc, requests.exceptions.ReadTimeout):
            return "The model took too long to answer (>25s). Switched to backup model."
        if isinstance(exc, requests.exceptions.ConnectTimeout):
            return "Couldn't reach NVIDIA in time. Check your internet connection."
        return f"Network error connecting to NVIDIA: {exc}"
    if status in (401, 403):
        return "NVIDIA rejected your API key. Please check your key at build.nvidia.com."
    if status == 410:
        return "This model has reached end-of-life on NVIDIA and is no longer available."
    if status == 404:
        return "That model is not available on your NVIDIA account right now."
    if status == 429:
        return "NVIDIA rate limit reached. Please wait a few seconds and try again."
    if status and status >= 500:
        return f"NVIDIA server error ({status}). Please retry shortly."
    return f"The model returned an error ({status})."


def open_upstream(model, messages, effort, temperature, max_tokens):
    key = ensure_api_key()
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    if effort in EFFORTS and "deepseek" in model:
        payload["reasoning_effort"] = effort

    def post(body):
        return requests.post(
            f"{NVIDIA_BASE_URL}/chat/completions",
            headers=headers,
            json=body,
            stream=True,
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )

    resp = post(payload)
    if resp.status_code in (400, 422) and "reasoning_effort" in payload:
        print(f"[Thinko] {model} rejected reasoning_effort ({resp.status_code}), retrying clean payload...")
        resp.close()
        payload.pop("reasoning_effort")
        resp = post(payload)
    return resp


# ------------------------------------------------------------------ routes
@app.route("/")
def index():
    if not os.path.exists(os.path.join(APP_DIR, "index.html")):
        return (
            "Frontend not built yet. Run: cd frontend && npm install && npm run build",
            503,
        )
    return send_from_directory(APP_DIR, "index.html")


@app.route("/api/health")
def health():
    key = ensure_api_key()
    active = get_active_model()
    return jsonify(
        {
            "ok": True,
            "model": active,
            "key_set": bool(key),
            "web_search": bool(SERP_API_KEY),
        }
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    global _active_model
    data = request.get_json(silent=True) or {}
    messages = clean_messages(data.get("messages"))
    if not messages:
        return jsonify({"error": "Send a messages array that ends with a user message."}), 400

    instructions = (data.get("instructions") or "").strip()[:2000]
    effort = str(data.get("effort") or "").lower()
    use_web = bool(data.get("web"))
    try:
        temperature = min(2.0, max(0.0, float(data.get("temperature", 0.7))))
    except (TypeError, ValueError):
        temperature = 0.7

    user_query = messages[-1]["content"][:60].replace("\n", " ")
    print(f"\n[Thinko] >>> New chat request: '{user_query}'")

    def generate():
        global _active_model
        key = ensure_api_key()
        if not key:
            print("[Thinko] Error: NVIDIA_API_KEY not set")
            yield sse({"type": "error", "message": "NVIDIA_API_KEY is not set on the server."})
            return

        system = SYSTEM_PROMPT
        if instructions:
            system += f"\n\nThe user's custom instructions:\n{instructions}"

        if use_web:
            if not SERP_API_KEY:
                yield sse({"type": "notice", "message": "Web search isn't configured on the server (SERP_API_KEY)."})
            else:
                query = messages[-1]["content"][:300]
                results = search_web(query)
                if results:
                    yield sse({"type": "sources", "items": [{"title": r["title"], "link": r["link"]} for r in results]})
                    block = "\n".join(f"- {r['title']} ({r['link']}): {r['snippet']}" for r in results)
                    system += f"\n\nLive web results for the latest user message:\n{block}"

        convo = [{"role": "system", "content": system}] + messages
        candidates = resolve_candidate_models()

        started = time.time()
        for attempt, model in enumerate(candidates):
            resp = None
            produced = False
            in_think = False
            print(f"[Thinko] (Attempt {attempt + 1}/{len(candidates)}) Calling: {model}...")

            try:
                resp = open_upstream(model, convo, effort, temperature, 4096)
                status = resp.status_code
                print(f"[Thinko] {model} response status: {status}")

                if status != 200:
                    err_body = resp.text[:200]
                    resp.close()
                    print(f"[Thinko] Error from {model} ({status}): {err_body}")

                    # 401/403: API key is invalid
                    if status in (401, 403):
                        yield sse({"type": "error", "message": friendly_error(status=status)})
                        return

                    # 410 (Gone/EOL), 404, 422, 429, 5xx: Try next model!
                    if attempt + 1 < len(candidates):
                        next_model = candidates[attempt + 1]
                        print(f"[Thinko] Skipping dead/busy model {model}, trying {next_model}...")
                        yield sse({
                            "type": "notice",
                            "message": f"{model.split('/')[-1]} is unavailable ({status}). Switching to {next_model.split('/')[-1]}..."
                        })
                        continue

                    yield sse({"type": "error", "message": friendly_error(status=status)})
                    return

                # Success! Mark this as the active working model
                _active_model = model
                yield sse({"type": "meta", "model": model, "fallback": attempt > 0})

                for line in resp.iter_lines(decode_unicode=True):
                    if not line or not line.startswith("data:"):
                        continue
                    chunk = line[5:].strip()
                    if chunk == "[DONE]":
                        break
                    try:
                        obj = json.loads(chunk)
                    except ValueError:
                        continue

                    choices = obj.get("choices") or []
                    if not choices:
                        continue

                    delta = choices[0].get("delta") or {}
                    reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                    text = delta.get("content")

                    if reasoning:
                        produced = True
                        yield sse({"type": "reasoning", "delta": reasoning})

                    if text:
                        if "<think>" in text:
                            in_think = True
                            before, after = text.split("<think>", 1)
                            if before:
                                produced = True
                                yield sse({"type": "token", "delta": before})
                            text = after

                        if in_think:
                            if "</think>" in text:
                                in_think = False
                                thought, after = text.split("</think>", 1)
                                if thought:
                                    produced = True
                                    yield sse({"type": "reasoning", "delta": thought})
                                if after:
                                    produced = True
                                    yield sse({"type": "token", "delta": after})
                            else:
                                produced = True
                                yield sse({"type": "reasoning", "delta": text})
                        else:
                            produced = True
                            yield sse({"type": "token", "delta": text})

                duration_ms = int((time.time() - started) * 1000)
                print(f"[Thinko] Done streaming from {model} in {duration_ms}ms")
                yield sse({"type": "done", "ms": duration_ms})
                return

            except (requests.exceptions.RequestException, OSError) as exc:
                print(f"[Thinko] Exception with {model}: {exc}")
                if not produced and attempt + 1 < len(candidates):
                    next_model = candidates[attempt + 1]
                    yield sse({
                        "type": "notice",
                        "message": f"{model.split('/')[-1]} timed out. Switched to {next_model.split('/')[-1]}..."
                    })
                    continue
                yield sse({"type": "error", "message": friendly_error(exc=exc)})
                return
            except GeneratorExit:
                print("[Thinko] Client disconnected.")
                raise
            finally:
                if resp is not None:
                    resp.close()

        yield sse({"type": "error", "message": "All AI models were busy or unavailable right now. Please try again."})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    key_found = bool(ensure_api_key())
    candidates = resolve_candidate_models()
    active = get_active_model()
    print("\n" + "=" * 60)
    print(" THINKO AI SERVER STARTED")
    print("=" * 60)
    print(f" URL:             http://localhost:{port}")
    print(f" Active Model:    {active}")
    print(f" Total Candidates: {len(candidates)}")
    print(f" API Key:         {'Loaded [OK]' if key_found else 'MISSING [!] (set in start.sh or env)'}")
    print("=" * 60 + "\n")
    app.run(host="0.0.0.0", port=port, threaded=True)
