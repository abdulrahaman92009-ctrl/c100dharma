# CODE AI

A general-purpose AI and programming assistant.

## Features

- General AI question answering
- Coding AI mode
- Python, C, C++, Java, JavaScript and SQL assistance
- Code block display and copy
- Conversation history in browser local storage
- Responsive interface
- Flask backend
- Gemini API integration

## Local setup

Install dependencies:

    pip install -r requirements.txt

Set environment variable:

    GEMINI_API_KEY=your_key

Run:

    python app.py

## Production

Build:

    pip install -r requirements.txt

Start:

    gunicorn app:app

Configure GEMINI_API_KEY in the hosting provider's
private environment settings.

Never commit API keys to GitHub.
