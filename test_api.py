import os
import sys
import time
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
print("Thinko AI — NVIDIA API Diagnostic Test")
print("=" * 60)

if not api_key:
    print("[ERROR] No NVIDIA_API_KEY found in environment or start.sh!")
    print("Please set your NVIDIA API key in start.sh or export it:")
    print('  export NVIDIA_API_KEY="nvapi-..."')
    sys.exit(1)

print(f"[OK] Found API Key: {api_key[:12]}...{api_key[-4:]}")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

models_to_test = [
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-8b-instruct",
    "deepseek-ai/deepseek-v4.1-flash",
]

for model in models_to_test:
    print(f"\n--- Testing model: {model} ---")
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with only the word 'WORKING'."}],
        "max_tokens": 30,
        "temperature": 0.5,
    }
    t0 = time.time()
    try:
        resp = requests.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=20,
        )
        elapsed = round(time.time() - t0, 2)
        print(f"Status Code: {resp.status_code} ({elapsed}s)")
        if resp.status_code == 200:
            data = resp.json()
            content = data["choices"][0]["message"].get("content", "")
            print(f"Response: {content.strip()}")
            print(f"--> [SUCCESS] {model} is FAST and WORKING!")
        else:
            print(f"Response error ({resp.status_code}): {resp.text[:200]}")
    except requests.exceptions.Timeout:
        print(f"--> [TIMEOUT] {model} took >20s to respond (NVIDIA queue or down).")
    except Exception as e:
        print(f"--> [ERROR] {e}")

print("\n" + "=" * 60)
