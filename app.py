from openai import OpenAI
import os
import time
import logging
from collections import defaultdict, deque

from flask import Flask, request, jsonify, render_template
from google import genai
from google.genai import types

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

logging.basicConfig(level=logging.INFO)

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
API_KEY = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=API_KEY) if API_KEY else None

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

# Basic per-IP request limit for the prototype.
# For a larger public service, use shared rate limiting.
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


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "application": "CODE AI",
        "ai_configured": client is not None
    })


@app.route("/api/chat", methods=["POST"])
def chat():

    if client is None:
        return jsonify({
            "error": "AI API key is not configured."
        }), 503

    ip = request.remote_addr or "unknown"

    if not allowed_request(ip):
        return jsonify({
            "error": "Too many requests. Please wait a minute."
        }), 429

    data = request.get_json(silent=True) or {}

    mode = data.get("mode", "general")
    messages = data.get("messages", [])

    if mode not in ["general", "coding"]:
        return jsonify({"error": "Invalid AI mode."}), 400

    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "Please enter a message."}), 400

    if len(messages) > 20:
        messages = messages[-20:]

    contents = []

    for message in messages:

        if not isinstance(message, dict):
            return jsonify({"error": "Invalid message."}), 400

        role = message.get("role")
        content = message.get("content")

        if role not in ["user", "assistant"]:
            return jsonify({"error": "Invalid message role."}), 400

        if not isinstance(content, str) or not content.strip():
            return jsonify({"error": "Message cannot be empty."}), 400

        if len(content) > 8000:
            return jsonify({"error": "Message is too long."}), 400

        contents.append({
            "role": "user" if role == "user" else "model",
            "parts": [{"text": content}]
        })

    if not any(m["role"] == "user" for m in messages):
        return jsonify({"error": "A user message is required."}), 400

    system_prompt = (
        CODING_PROMPT if mode == "coding"
        else GENERAL_PROMPT
    )

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.7,
                max_output_tokens=3000
            )
        )

        answer = response.text

        if not answer:
            return jsonify({
                "error": "The AI returned an empty response."
            }), 502

        return jsonify({
            "success": True,
            "mode": mode,
            "answer": answer
        })

    except Exception:
        logging.exception("CODE AI API error")

        return jsonify({
            "error": "AI service error. Please try again later."
        }), 502


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
