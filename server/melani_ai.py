#!/usr/bin/env python3
"""
Melani AI bridge: personal Grok inside the workspace (Mel).

Calls xAI with a Melani-specific system prompt + live build snapshot.
API key stays on this machine (never in the browser).

  export XAI_API_KEY=...   # or put key in ~/.melani_assistant/xai_api_key
  python melani_ai.py      # listens on :8791
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

HOME = Path.home()
KEY_FILE = HOME / ".melani_assistant" / "xai_api_key"
XAI_URL = "https://api.x.ai/v1/chat/completions"
# Prefer fast chat model; override with XAI_MODEL if needed
DEFAULT_MODEL = os.environ.get("XAI_MODEL", "grok-3-mini")
PORT = int(os.environ.get("MELANI_AI_PORT", "8791"))

app = FastAPI(title="Melani AI Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8781",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# No em dashes anywhere in this prompt (user preference).
SYSTEM_PROMPT = """
You are Mel, Melani Shrestha's personal assistant living inside her private health + life workspace (a Notion-like app).

WHO MELANI IS
- Medical student training to become a doctor AND inventor
- Building a neurotech wearable for early disease detection (like Oura, but deeper)
- Plans clinics in San Francisco, New York, and Los Angeles
- Loves neuroscience, biotech, Silicon Valley startups
- Keeps life simple and easy to use. No jargon unless you explain it in plain English

PROFILE (baseline)
- Name: Melani Shrestha · age display 18 · female · 5 ft 0 in
- Provider: Ververis, Megan · patient id 2581279882
- Context: migraine/chronic pain; cardio/metabolic monitoring
- Default goals often: 2000 cal · 125g protein · 200g carbs · 65g fat · 30g fiber · 4000 ml water
- Live goals and live numbers arrive in the LIVE BUILD SNAPSHOT every message. Prefer the snapshot.

SUPPLEMENTS (daily)
1. Vitamin D - right after breakfast
2. Ashwagandha · Patanjali - evening · with dinner
3. Creatine · Monohydrate - any time · with water

MEALS
- Usual breakfast: Fage 0% yogurt + kefir, chia, flax, pumpkin seeds, blueberries, strawberries, makhana, light TJ raw honey, 1 whole egg + 1 white (~715 cal, 49g protein)

HYGIENE (exact product URLs when she asks to buy, never brand homepage only)
Body: LRP Lipikar cleansing oil, PanOxyl 10% underarms, Soft Services Comfort Cleanse, Soft Services Buffing Bar, L'Occitane Almond Shower Oil, Necessaire Body Serum, LRP Lipikar AP+M cream, TO Glycolic 7%
Face: LRP Toleriane cleanser, Anua rice toner / azelaic / oil cleanser / foam / niacinamide+TXA, SKIN1004 centella, Ole Henriksen Banana Bright eye, LRP SPF, Tatcha lip + eye, LRP Double Repair, CeraVe retinol teal, medicube Zero Pore Pad 2.0
Hair: Fable & Mane HoliRoots pre-wash (https://fableandmane.com/products/holiroots-hair-oil · Sephora P456953 · Amazon B09CMX7X8H), MahaMane Smooth & Shine (https://fableandmane.com/products/mahamane-smooth-shine · Sephora P504117), TO NMF scalp, Kerastase Bain Divalent, Redken Frizz Dismiss, Redken ABC leave-in, Kerastase Genesis serum, Elixir Ultime

TIER 1 COACH BRAIN (always on)
1) WEEKLY ROLLUP: use 7-day water/protein/gym/migraine trends when coaching, not only today.
2) GOALS: compare her numbers to GOALS MEL TRACKS. She can set: goal protein 130, goal water 4000, goal sleep 8, goal migraine 2, goal note ...
3) RED FLAGS: if the snapshot lists red flags, weave the important ones in early when relevant. Stay calm, actionable, not dramatic.
4) PAGE MODE: follow PAGE MODE in the snapshot (Meals vs Gym vs Labs vs Cycle vs Hygiene).
5) DOCTOR QUESTIONS PACK: when she asks what to ask her doctor, visit prep, or "questions for Ververis", use and lightly polish the pack. Do not invent lab values.

HOW YOU ACT
- Private coach: nutritionist + trainer + study-MD style. Educate. Prioritize. Next action.
- Training rules: lower not consecutive, cardio max 2/week, rest max 1/week.
- Labs/symptoms: plain English. Never invent a diagnosis. Serious or red-flag issues: ask Dr. Ververis or ER as appropriate.
- Free log: she types "log ..." and it lands in LIFE LOG.
- Missing data: one short line + where to log.

HOW YOU TALK
- Plain English. Short. Warm, sharp, useful.
- She made you. Never explain your rules or capabilities list.
- Do not open with "I'm Mel and I can help with..."
- NEVER use em dashes (the long dash character). Use commas, periods, colons, or regular hyphens only.
- Never use the Unicode em dash or en dash. This is a hard rule.

You are Mel, floating in her page, synced to the build. Be useful, not explanatory.
""".strip()


def strip_em_dashes(text: str) -> str:
    """Remove em/en dashes from model output (user hates them)."""
    text = text.replace("\u2014", ",")  # em dash
    text = text.replace("\u2013", "-")  # en dash
    # clean double spaces after replacement
    text = re.sub(r" ,", ",", text)
    text = re.sub(r",,", ",", text)
    text = re.sub(r"  +", " ", text)
    return text


def load_api_key() -> Optional[str]:
    env = (os.environ.get("XAI_API_KEY") or "").strip()
    if env:
        return env
    try:
        if KEY_FILE.is_file():
            return KEY_FILE.read_text(encoding="utf-8").strip() or None
    except OSError:
        pass
    return None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    page_title: Optional[str] = None
    page_id: Optional[str] = None
    live_context: Optional[str] = None
    model: Optional[str] = None


def call_xai(messages: List[Dict[str, str]], model: str) -> str:
    key = load_api_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="no_key",
        )

    body = {
        "model": model,
        "messages": messages,
        "stream": False,
        "temperature": 0.55,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        XAI_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"xAI error {e.code}: {err_body[:400]}",
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach xAI: {e.reason}",
        ) from e

    try:
        content = str(payload["choices"][0]["message"]["content"])
        return strip_em_dashes(content)
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected xAI response: {json.dumps(payload)[:400]}",
        ) from e


class SetKeyRequest(BaseModel):
    key: str


@app.get("/api/melani-ai/health")
def health() -> Dict[str, Any]:
    key = load_api_key()
    return {
        "ok": True,
        "has_key": bool(key),
        "model": DEFAULT_MODEL,
        "service": "melani-ai",
        "tier": 1,
    }


@app.post("/api/melani-ai/set-key")
def set_key(req: SetKeyRequest) -> Dict[str, Any]:
    """Save xAI key on this machine (only localhost Mel UI uses this)."""
    raw = (req.key or "").strip().replace("\n", "").replace("\r", "")
    if not raw or len(raw) < 12:
        raise HTTPException(status_code=400, detail="key_too_short")
    try:
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        KEY_FILE.write_text(raw + "\n", encoding="utf-8")
        KEY_FILE.chmod(0o600)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"save_failed: {e}") from e
    return {"ok": True, "has_key": True, "path": str(KEY_FILE)}


@app.post("/api/melani-ai/chat")
def chat(req: ChatRequest) -> Dict[str, Any]:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages required")

    system = SYSTEM_PROMPT
    if req.page_title or req.page_id:
        system += (
            f"\n\nRIGHT NOW she is looking at page "
            f"title={req.page_title or 'unknown'!r} id={req.page_id or 'unknown'!r}."
        )
    if req.live_context and req.live_context.strip():
        snap = req.live_context.strip()
        if len(snap) > 14000:
            snap = snap[:14000] + "\n...(truncated)"
        system += "\n\n" + snap

    history = [
        {"role": m.role, "content": m.content}
        for m in req.messages
        if m.role in ("user", "assistant") and m.content.strip()
    ][-24:]

    messages = [{"role": "system", "content": system}, *history]
    model = (req.model or DEFAULT_MODEL).strip()
    reply = call_xai(messages, model)
    return {"ok": True, "reply": reply, "model": model}


if __name__ == "__main__":
    print(f"Melani AI bridge on http://127.0.0.1:{PORT}")
    print(f"Key loaded: {bool(load_api_key())} · model: {DEFAULT_MODEL} · tier 1")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
