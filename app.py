import os
import time
import logging
from collections import defaultdict, deque
from pathlib import Path

from flask import Flask, request, jsonify, render_template
from openai import OpenAI

# --------------------------------------------------
# 1. PROJECT PATHS AND FLASK CONFIGURATION
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = Flask(
    __name__,
    template_folder=str(TEMPLATE_DIR),
    static_folder=str(STATIC_DIR),
    static_url_path="/static",
)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("code_ai")

# --------------------------------------------------
# 2. OPENAI CONFIGURATION
# --------------------------------------------------

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
API_KEY = os.getenv("OPENAI_API_KEY")

# The key is read only from the server environment. Never put it in frontend code.
client = OpenAI(api_key=API_KEY, timeout=45.0, max_retries=2) if API_KEY else None

GENERAL_PROMPT = """
You are CODE AI, a helpful general-purpose AI assistant.

Answer questions accurately and clearly.
Explain difficult concepts in simple language.
Help with education, mathematics, science, technology,
writing and everyday knowledge.

Never invent facts when uncertain.
Use examples when they improve understanding.
"""
CODING_PROMPT = """
You are CODE AI, an advanced programming assistant.

Support C, C++, Python, Java, JavaScript, HTML, CSS,
SQL and other programming languages.

Generate readable and correct code.
Debug errors and explain their causes.
Explain code step by step when requested.
Create programming exercises at different difficulty levels.
Respect the user's requested coding style.

Never claim code has been executed unless it actually has.
"""

# --------------------------------------------------
# 3. BASIC PER-IP RATE LIMITING
# --------------------------------------------------

request_times = defaultdict(deque)

def allowed_request(ip):
    now = time.time()
    history = request_times[ip]

    while history and now - history[0] > 60:
        history.popleft()

    if len(history) >= 12:
        return False

    history.append(now)
    return True


# --------------------------------------------------
# 4. HOMEPAGE
# --------------------------------------------------

@app.route("/", methods=["GET", "HEAD"])
def home():
    homepage = TEMPLATE_DIR / "index.html"
    if not homepage.is_file():
        logger.error("Missing homepage template: %s", homepage)
        return "CODE AI homepage file is missing.", 500

    return render_template("index.html")


# --------------------------------------------------
# 5. HEALTH CHECK
# --------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "application": "CODE AI",
        "ai_configured": client is not None,
        "model": MODEL,
        "template_exists": (TEMPLATE_DIR / "index.html").is_file(),
        "static_exists": STATIC_DIR.is_dir(),
    })


# --------------------------------------------------
# 6. AI CHAT
# --------------------------------------------------

@app.route("/api/chat", methods=["POST"])
def chat():
    if client is None:
        return jsonify({
            "error": "OpenAI API key is not configured in Render. Add OPENAI_API_KEY."
        }), 503

    ip = request.remote_addr or "unknown"
    if not allowed_request(ip):
        return jsonify({
            "error": "Too many requests. Please wait a minute."
        }), 429

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request. Please send JSON data."
        }), 400

    mode = data.get("mode", "general")
    messages = data.get("messages", [])

    if mode not in ("general", "coding"):
        return jsonify({"error": "Invalid AI mode."}), 400

    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "Please enter a message."}), 400

    # Keep the latest 20 messages, matching the original prototype behaviour.
    messages = messages[-20:]
openai_messages = [{
        "role": "system",
        "content": CODING_PROMPT if mode == "coding" else GENERAL_PROMPT,
    }]

    for message in messages:
        if not isinstance(message, dict):
            return jsonify({"error": "Invalid message format."}), 400

        role = message.get("role")
        content = message.get("content")

        if role not in ("user", "assistant"):
            return jsonify({"error": "Invalid message role."}), 400

        if not isinstance(content, str) or not content.strip():
            return jsonify({"error": "Message cannot be empty."}), 400

        if len(content) > 8000:
            return jsonify({"error": "Message is too long."}), 400

        openai_messages.append({
            "role": role,
            "content": content,
        })

    if not any(message["role"] == "user" for message in openai_messages[1:]):
        return jsonify({"error": "A user message is required."}), 400

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=openai_messages,
            temperature=0.7,
            max_tokens=3000,
        )

        answer = response.choices[0].message.content
        if not answer or not answer.strip():
            return jsonify({
                "error": "The AI returned an empty response."
            }), 502

        return jsonify({
            "success": True,
            "mode": mode,
            "answer": answer,
        })

    except Exception:
        # Full details go to Render logs; do not expose secrets or raw exceptions to visitors.
        logger.exception("CODE AI OpenAI API error")
        return jsonify({
            "error": "OpenAI service error. Check the Render logs and API configuration."
        }), 502


# --------------------------------------------------
# 7. APPLICATION START
# --------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False,
    )
