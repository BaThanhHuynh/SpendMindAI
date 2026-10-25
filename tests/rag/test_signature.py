"""Bước 2 — tự kiểm chữ ký HMAC của api/rag/index.py.  Chạy: .venv/Scripts/python tests/rag/test_signature.py"""
import hashlib
import hmac
import importlib.util
import json
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

SECRET = "khoa-chi-de-kiem-thu"  # giá trị giả, chỉ dùng trong tệp này
os.environ["RAG_INTERNAL_SECRET"] = SECRET
spec = importlib.util.spec_from_file_location("rag", Path(__file__).resolve().parents[2] / "api" / "rag" / "index.py")
rag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rag)
client = TestClient(rag.app)


def signed(body, ts=None, secret=SECRET):
    ts = str(ts or int(time.time()))
    return {"X-RAG-Timestamp": ts,
            "X-RAG-Signature": hmac.new(secret.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()}


body = json.dumps({"user_id": 1, "message": "Xin chào", "history": [], "state": None, "today": "2026-10-25"}).encode()
assert client.get("/api/rag/healthz").status_code == 200
assert client.post("/api/rag/chat", content=body).status_code == 401, "thiếu chữ ký"
assert client.post("/api/rag/chat", content=body, headers=signed(body, secret="sai")).status_code == 401, "sai khoá"
assert client.post("/api/rag/chat", content=body, headers=signed(body, ts=int(time.time()) - 600)).status_code == 401, "quá hạn"
assert client.post("/api/rag/chat", content=body + b" ", headers=signed(body)).status_code == 401, "body bị sửa"
r = client.post("/api/rag/chat", content=body, headers=signed(body))
assert r.status_code == 200 and set(r.json()) == {"reply", "state", "proposal", "meta"}, r.text
print("test_signature: đạt")
