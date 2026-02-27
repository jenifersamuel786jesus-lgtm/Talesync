import ipaddress
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Dict, List
from urllib.parse import urlparse

import requests
import spacy
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from transformers import pipeline

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=ROOT_DIR / ".env", encoding="utf-8-sig")

app = FastAPI(title="Talesync AI Worker")

WORKER_SECRET = (
  os.getenv("WORKER_SECRET")
  or os.getenv("\ufeffWORKER_SECRET")
  or ""
).strip()
API_CALLBACK_BASE = os.getenv("API_CALLBACK_BASE", "http://localhost:8080/api/uploads/worker-callback")
MULTI_NER_MODEL = os.getenv("NER_MODEL", "Babelscape/wikineural-multilingual-ner")
ASSEMBLYAI_API_KEY = (os.getenv("ASSEMBLYAI_API_KEY") or "").strip()
ALLOW_LOCAL_AUDIO_FETCH = (os.getenv("ALLOW_LOCAL_AUDIO_FETCH") or "").strip().lower() == "true"
DEPLOY_ENV = (os.getenv("VERCEL_ENV") or os.getenv("NODE_ENV") or "").strip().lower()
IS_PRODUCTION = DEPLOY_ENV == "production"

english_ner = spacy.load(os.getenv("SPACY_MODEL", "en_core_web_sm"))
embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
try:
  multilingual_ner = pipeline("token-classification", model=MULTI_NER_MODEL, aggregation_strategy="simple")
except Exception:
  multilingual_ner = None


class ProcessRequest(BaseModel):
  memoryId: str
  audioUrl: str


def clean_items(items: List[str], blocked: set[str]) -> List[str]:
  out = []
  for item in items:
    normalized = re.sub(r"\s+", " ", (item or "").strip())
    lowered = normalized.lower()
    if not normalized:
      continue
    if lowered in blocked:
      continue
    if len(normalized) < 2:
      continue
    if re.fullmatch(r"[\W_]+", normalized):
      continue
    if normalized not in out:
      out.append(normalized)
  return out[:20]


def extract_dates(text: str) -> List[str]:
  date_patterns = [
    r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
    r"\b\d{4}\b",
    r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b",
  ]
  found = []
  for pattern in date_patterns:
    found.extend(re.findall(pattern, text, flags=re.IGNORECASE))
  return found


def extract_entities(text: str, language: str) -> Dict[str, List[str]]:
  people, places, dates = [], [], []

  try:
    if multilingual_ner:
      results = multilingual_ner(text)
      for ent in results:
        label = ent.get("entity_group", "")
        word = ent.get("word", "")
        if label in {"PER", "PERSON"}:
          people.append(word)
        elif label in {"LOC", "LOCATION"}:
          places.append(word)
  except Exception:
    pass

  if language == "en":
    doc = english_ner(text)
    for ent in doc.ents:
      if ent.label_ == "PERSON":
        people.append(ent.text)
      elif ent.label_ in {"GPE", "LOC", "FAC"}:
        places.append(ent.text)
      elif ent.label_ in {"DATE", "TIME"}:
        dates.append(ent.text)

  dates.extend(extract_dates(text))

  blocked_words = {"memory", "story", "talesync", "life"}
  return {
    "people": clean_items(people, blocked_words),
    "places": clean_items(places, blocked_words),
    "dates": clean_items(dates, set()),
  }


def detect_topic(text: str) -> str:
  text_lower = text.lower()
  if any(word in text_lower for word in ["war", "army", "soldier", "battle"]):
    return "History and Service"
  if any(word in text_lower for word in ["school", "college", "teacher", "study"]):
    return "Education Journey"
  if any(word in text_lower for word in ["mother", "father", "family", "children"]):
    return "Family Life"
  if any(word in text_lower for word in ["work", "factory", "job", "company"]):
    return "Work and Career"
  return "Life Memory"


def is_private_or_local_host(hostname: str) -> bool:
  if not hostname:
    return False
  host = hostname.strip().lower()
  if host in {"localhost", "127.0.0.1", "::1"}:
    return True
  try:
    ip = ipaddress.ip_address(host)
    return ip.is_private or ip.is_loopback or ip.is_link_local
  except ValueError:
    return False


def upload_bytes_to_assemblyai(file_path: str) -> str:
  headers = {"authorization": ASSEMBLYAI_API_KEY}
  with open(file_path, "rb") as f:
    res = requests.post(
      "https://api.assemblyai.com/v2/upload",
      headers=headers,
      data=f,
      timeout=300,
    )
  res.raise_for_status()
  upload_url = (res.json() or {}).get("upload_url", "").strip()
  if not upload_url:
    raise RuntimeError("AssemblyAI upload failed: missing upload_url")
  return upload_url


def transcribe_with_assemblyai(audio_url: str) -> tuple[str, str]:
  headers = {
    "authorization": ASSEMBLYAI_API_KEY,
    "content-type": "application/json",
  }
  create_payload = {
    "audio_url": audio_url,
    "speech_models": ["universal-2"],
    "language_detection": True,
  }
  create_res = requests.post(
    "https://api.assemblyai.com/v2/transcript",
    headers=headers,
    json=create_payload,
    timeout=60,
  )
  create_res.raise_for_status()
  transcript_id = (create_res.json() or {}).get("id", "").strip()
  if not transcript_id:
    raise RuntimeError("AssemblyAI transcription create failed: missing id")

  status_url = f"https://api.assemblyai.com/v2/transcript/{transcript_id}"
  deadline = time.time() + 600
  while time.time() < deadline:
    poll_res = requests.get(status_url, headers={"authorization": ASSEMBLYAI_API_KEY}, timeout=60)
    poll_res.raise_for_status()
    body = poll_res.json() or {}
    status = (body.get("status") or "").lower()
    if status == "completed":
      text = (body.get("text") or "").strip()
      language_code = (body.get("language_code") or "").strip().lower()
      language = language_code.split("_", 1)[0] if language_code else ""
      return text, language
    if status == "error":
      raise RuntimeError(body.get("error") or "AssemblyAI transcription failed")
    time.sleep(2)

  raise RuntimeError("AssemblyAI transcription timeout after 10 minutes")


def transcribe_audio(url: str) -> tuple[str, str]:
  if not ASSEMBLYAI_API_KEY:
    raise RuntimeError("ASSEMBLYAI_API_KEY is missing in ai-worker/.env")

  temp_path = None
  try:
    parsed = urlparse(url)
    allow_private_fetch = ALLOW_LOCAL_AUDIO_FETCH or not IS_PRODUCTION
    if is_private_or_local_host(parsed.hostname or "") and not allow_private_fetch:
      raise RuntimeError("Blocked private/local audio URL")

    source_url = url
    if is_private_or_local_host(parsed.hostname or ""):
      with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as tmp:
        temp_path = tmp.name
      audio_res = requests.get(url, timeout=180)
      audio_res.raise_for_status()
      with open(temp_path, "wb") as f:
        f.write(audio_res.content)
      source_url = upload_bytes_to_assemblyai(temp_path)

    return transcribe_with_assemblyai(source_url)
  finally:
    if temp_path:
      try:
        os.unlink(temp_path)
      except Exception:
        pass


@app.get("/health")
def health():
  return {"ok": True}


@app.post("/process")
def process_memory(payload: ProcessRequest, x_worker_secret: str = Header(default="")):
  if not WORKER_SECRET or x_worker_secret != WORKER_SECRET:
    raise HTTPException(status_code=401, detail="Unauthorized")

  try:
    transcript, language = transcribe_audio(payload.audioUrl)
    entities = extract_entities(transcript, language)
    topic = detect_topic(transcript)
    try:
      embedding = embedder.encode(transcript).tolist() if transcript else []
    except Exception:
      embedding = []

    callback_payload = {
      "transcript": transcript,
      "entities": entities,
      "topic": topic,
      "embedding": embedding,
      "status": "completed",
    }

    callback_res = requests.post(
      f"{API_CALLBACK_BASE}/{payload.memoryId}",
      json=callback_payload,
      headers={"x-worker-secret": WORKER_SECRET},
      timeout=60,
    )
    callback_res.raise_for_status()
    return {"ok": True}
  except Exception as exc:
    fail_payload = {
      "transcript": "",
      "entities": {"people": [], "places": [], "dates": []},
      "topic": "",
      "embedding": [],
      "status": "failed",
      "processingError": str(exc)[:400],
    }
    requests.post(
      f"{API_CALLBACK_BASE}/{payload.memoryId}",
      json=fail_payload,
      headers={"x-worker-secret": WORKER_SECRET},
      timeout=60,
    )
    raise HTTPException(status_code=500, detail=str(exc))
