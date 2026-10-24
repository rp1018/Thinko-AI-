import os
import sys
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_key():
    key = os.environ.get("NVIDIA_API_KEY")
    if key and not key.startswith("nvapi-xxxx"):
        return key
    start_sh = os.path.join(BASE_DIR, "start.sh")
    if os.path.exists(start_sh):
        with open(start_sh, "r", encoding="utf-8") as f:
            for line in f:
                if "NVIDIA_API_KEY=" in line:
                    val = line.split("NVIDIA_API_KEY=", 1)[1].split()[0].strip().strip('"').strip("'")
                    if val and not val.startswith("nvapi-xxxx"):
                        return val
    return None

api_key = get_key()
print("=" * 60)
print("Querying Available NVIDIA Models...")
print("=" * 60)

headers = {
    "Authorization": f"Bearer {api_key}",
    "Accept": "application/json",
}

try:
    resp = requests.get("https://integrate.api.nvidia.com/v1/models", headers=headers, timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        models = [m["id"] for m in data.get("data", [])]
        print(f"Total models found: {len(models)}\n")
        chat_models = [m for m in models if "instruct" in m or "chat" in m or "nemotron" in m or "deepseek" in m or "qwen" in m or "llama" in m or "mistral" in m]
        print("--- Active Chat Models ---")
        for m in sorted(chat_models):
            print(f" - {m}")
    else:
        print(f"Failed to fetch models: {resp.status_code} - {resp.text}")
except Exception as e:
    print(f"Error: {e}")

print("=" * 60)
