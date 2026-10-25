"""Dịch vụ RAG của SpendMindAI — Bước 2: khung (docs/knowledge/chatbot-rag-thiet-ke.md §6, §7).

PHP (api/controllers/ChatbotController.php::forwardToRag) là cửa duy nhất: nó kiểm phiên đăng nhập và giới hạn tần
suất, rồi gọi vào đây kèm chữ ký HMAC-SHA256 trên "<timestamp>.<body>". Hợp đồng vào/ra: tests/chatbot_eval/run_eval.py.
"""
import hashlib
import hmac
import json
import os
import time

from fastapi import FastAPI, HTTPException, Request

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
MAX_SKEW = 300  # giây: chặn việc gửi lại một yêu cầu cũ bị bắt được


def verify(headers, body: bytes) -> dict:
    secret = os.environ.get("RAG_INTERNAL_SECRET", "")
    ts, sig = headers.get("x-rag-timestamp", ""), headers.get("x-rag-signature", "")
    if not secret or not ts.isdigit() or abs(time.time() - int(ts)) > MAX_SKEW:
        raise HTTPException(401)
    want = hmac.new(secret.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(want.encode(), sig.encode()):
        raise HTTPException(401)
    data = json.loads(body)
    if not isinstance(data, dict) or not isinstance(data.get("user_id"), int) or not isinstance(data.get("message"), str):
        raise HTTPException(400)
    return data


@app.get("/api/rag/healthz")
def healthz():
    return {"ok": True}


@app.post("/api/rag/chat")
async def chat(request: Request):
    data = verify(request.headers, await request.body())
    # Bước 3+ thay phần này bằng pipeline: regex → viết lại câu hỏi → truy xuất → sinh câu trả lời
    return {"reply": "Trợ lý RAG đang được xây dựng.", "state": data.get("state"), "proposal": None,
            "meta": {"intent": None, "rewritten": data["message"], "llm_calls": 0, "finish_reason": "STOP"}}
