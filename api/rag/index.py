"""Dịch vụ RAG của SpendMindAI (docs/knowledge/chatbot-rag-thiet-ke.md §3, §6, §7).

PHP (api/controllers/ChatbotController.php::forwardToRag) là cửa duy nhất: nó kiểm phiên đăng nhập và giới hạn tần
suất, rồi gọi vào đây kèm chữ ký HMAC-SHA256 trên "<timestamp>.<body>". Hợp đồng vào/ra: tests/chatbot_eval/run_eval.py.

Bước 3: regex xã giao (§3.2) → một lần gọi LLM viết lại câu hỏi + phân loại ý định (§3.3) → code kiểm lại bộ lọc.
Bước 4: Đường A (§3.4) — code lọc theo bộ lọc đã kiểm, tự đếm / cộng / liệt kê, dựng khối SỰ KIỆN + bảng giao dịch.
"""
import difflib
import hashlib
import hmac
import json
import os
import re
import ssl
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import unquote, urlsplit

import pymysql
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
MAX_SKEW = 300  # giây: chặn việc gửi lại một yêu cầu cũ bị bắt được
MODELS = (("gemini-3.1-flash-lite", 6), ("gemini-2.5-flash-lite", 5))  # (model, giây chờ): tổng < 13s PHP chờ
LOCAL_DATA = Path(__file__).resolve().parents[2] / "local_dev_data.json"

# Danh mục chuẩn — trùng js/dashboard.js:7-17. Danh mục tự đặt là giá trị lạ trong transactions.category.
CATEGORIES = {"food": ("Ăn uống", "expense"), "transport": ("Di chuyển", "expense"),
              "shopping": ("Mua sắm", "expense"), "entertainment": ("Giải trí", "expense"),
              "home": ("Nhà cửa", "expense"), "other_expense": ("Khác (Chi)", "expense"),
              "salary": ("Lương", "income"), "freelance": ("Freelance / Thêm", "income"),
              "investment": ("Đầu tư", "income"), "gift": ("Được tặng / Khác", "income")}
FINANCE = ["finance_aggregate", "finance_list", "finance_compare", "finance_search"]
INTENTS = ["smalltalk", *FINANCE, "advice", "complaint", "modify_data", "out_of_scope", "unclear"]
FILTER_KEYS = ("month", "category", "type", "keyword")


def fold(s):
    """Chữ thường, bỏ dấu tiếng Việt: «Cảm ơn» → «cam on»."""
    s = unicodedata.normalize("NFD", (s or "").lower().replace("đ", "d"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


# ---------- Lớp 0: regex xã giao (§3.2) ----------

_TAIL = r"(?: (?:ban|bot|em|nhe|nha|nhieu|lam|a|oi))*"
SMALLTALK = [
    (re.compile(rf"(?:xin )?(?:chao|hi|hello|alo|hey){_TAIL}"), "Chào bạn! Bạn muốn xem chi tiêu nào?"),
    (re.compile(rf"(?:ok )?(?:cam on|thank you|thanks|thank|tks){_TAIL}"), "Không có gì! Cần gì cứ hỏi nhé."),
    (re.compile(rf"(?:tam biet|bye|bye bye|goodbye|hen gap lai){_TAIL}"), "Tạm biệt! Hẹn gặp lại."),
    (re.compile(rf"(?:ban la ai|ban lam duoc gi|ban giup duoc gi){_TAIL}"),
     "Mình là trợ lý chi tiêu SpendMindAI: xem tổng chi, liệt kê giao dịch theo danh mục hay tháng, "
     "so sánh các tháng và gợi ý cách tiết kiệm."),
]


# «Làm lại» = chạy lại yêu cầu tài chính lượt trước (§8 ca 8). Nghĩa đã cố định nên code quyết, không hỏi LLM: sau lời
# phàn nàn, model đôi khi hiểu thành modify_data.
REDO = re.compile(rf"lam lai{_TAIL}")


def smalltalk(message):
    """Câu trả lời mẫu nếu CẢ câu (≤ 6 từ) là xã giao; câu có thêm nội dung khác thì để LLM xử lý."""
    words = re.sub(r"[^\w ]+", " ", fold(message)).split()
    if len(words) > 6:
        return None
    return next((reply for rx, reply in SMALLTALK if rx.fullmatch(" ".join(words))), None)


# ---------- Dữ liệu giao dịch của người dùng ----------

def load_transactions(user_id):
    """Mọi giao dịch của người dùng, tải một lần mỗi yêu cầu (chỉ mục idx_user_date, database.sql:38).
    Có DATABASE_URL → MySQL/TiDB; không có → local_dev_data.json."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        # ponytail: tệp chạy thử trên máy chỉ có một người dùng nên bỏ qua user_id
        return json.loads(LOCAL_DATA.read_text(encoding="utf-8"))["transactions"]
    u = urlsplit(url)
    conn = pymysql.connect(host=u.hostname, port=u.port or 3306, user=unquote(u.username or ""),
                           password=unquote(u.password or ""), database=u.path.lstrip("/"), connect_timeout=5,
                           ssl=None if u.hostname in ("127.0.0.1", "localhost", "::1") else ssl.create_default_context(),
                           cursorclass=pymysql.cursors.DictCursor)
    with conn, conn.cursor() as cur:
        cur.execute("SELECT id, type, amount, category, date, description FROM transactions WHERE user_id = %s", (user_id,))
        # pymysql trả DECIMAL → Decimal, DATE → date: đưa về cùng dạng với local_dev_data.json
        return [r | {"amount": float(r["amount"]), "date": r["date"].isoformat()} for r in cur.fetchall()]


def user_categories(tx):
    """{mã/tên danh mục: "expense"|"income"} — danh mục chuẩn + danh mục tự đặt của chính người dùng."""
    return {k: v[1] for k, v in CATEGORIES.items()} | {t["category"]: t["type"] for t in tx if t["category"] not in CATEGORIES}


# ---------- Lớp 1: viết lại câu hỏi + phân loại ý định, một lần gọi LLM (§3.3) ----------

_NULLABLE = {"type": "STRING", "nullable": True}
SCHEMA = {"type": "OBJECT", "required": ["rewritten", "intent", "filters", "clarify"], "properties": {
    "rewritten": {"type": "STRING"},
    "intent": {"type": "STRING", "enum": INTENTS},
    "filters": {"type": "OBJECT", "required": list(FILTER_KEYS), "properties": {
        "month": _NULLABLE, "category": _NULLABLE,
        "type": {"type": "STRING", "enum": ["expense", "income"], "nullable": True}, "keyword": _NULLABLE}},
    "clarify": _NULLABLE}}

SYSTEM = """Bạn là bộ phân tích câu hỏi cho trợ lý chi tiêu SpendMindAI. KHÔNG trả lời câu hỏi; chỉ trả JSON theo lược đồ.

rewritten: viết lại «Câu hỏi mới» thành một câu tự đủ nghĩa, không cần đọc lịch sử. Dùng tên danh mục tiếng Việt
(Giải trí, Ăn uống…) và tháng dạng «tháng M/YYYY». Câu nối tiếp («chi tiết cho tôi», «19 giao dịch đó», «làm lại»)
phải nêu lại đủ danh mục và tháng đang bàn.

intent — chọn một:
- smalltalk: xã giao («bạn khoẻ không»)
- finance_aggregate: hỏi tổng tiền hoặc số giao dịch theo tháng / danh mục («tháng 10 giải trí bao nhiêu»)
- finance_list: muốn xem từng giao dịch («chi tiết giải trí tháng 10», «đã chi gì», «chi vào gì», «liệt kê», «còn thiếu giao dịch»)
- finance_compare: so sánh hai kỳ («tháng này so với tháng trước»)
- finance_search: hỏi về một món, nơi, việc cụ thể ghi trong ghi chú giao dịch chứ không phải tên danh mục — kể cả khi
  hỏi tổng tiền hay số lần («uống monster mấy lần», «tiền đi net», «chi bao nhiêu cho du thuyền»)
- advice: xin lời khuyên chi tiêu, tiết kiệm
- complaint: người dùng bảo trợ lý sai, hoặc giao dịch bị xếp sai danh mục («nó là ăn uống không phải giải trí») — chưa phải lệnh sửa
- modify_data: yêu cầu rõ ràng sửa / chuyển / xoá giao dịch («chuyển giao dịch X sang ăn uống», «xoá giao dịch net»)
- out_of_scope: ngoài chi tiêu cá nhân (thời tiết, tin tức…)
- unclear: không hiểu được kể cả khi đọc lịch sử; khi đó ghi câu hỏi lại vào clarify

«Làm lại», «còn nữa không», «chi tiết hơn», «chi tiết cho tôi» = lặp lại yêu cầu tài chính trong «Trạng thái lượt trước»,
giữ nguyên bộ lọc của trạng thái đó; lời phàn nàn ở lượt giữa không làm đổi bộ lọc.

filters:
- month: "YYYY-MM". «tháng này», «tháng trước» tính theo hôm nay; tháng không ghi năm → năm gần nhất không ở tương lai.
  Câu không nêu thời gian → tháng của trạng thái lượt trước, không có thì tháng này; riêng finance_search không nêu
  thời gian → null (mọi thời gian).
- category: chỉ chọn trong «Danh mục của người dùng», ghi đúng mã ở đầu dòng; không nhắc danh mục → null.
  Món / nơi / việc không phải danh mục → đưa vào keyword, không đưa vào category.
- type: "income" khi hỏi về thu nhập, còn lại "expense".
- keyword: tên món / nơi / việc cần tìm trong ghi chú giao dịch, chữ thường, giữ cách viết của người dùng, bỏ động từ
  đi kèm («tiền đi net» → «net», «uống monster» → «monster»); không có → null.
clarify: null, trừ khi intent là unclear."""


def build_prompt(message, history, prev, cats, today):
    cat_lines = [f"- {c}" + (f" = {CATEGORIES[c][0]}" if c in CATEGORIES else "") + f" · {'thu' if t == 'income' else 'chi'}"
                 for c, t in cats.items()]
    # ponytail: cắt mỗi tin 600 ký tự — danh sách dài của trợ lý chỉ cần phần đầu để hiểu ngữ cảnh
    turns = [f"{'Trợ lý' if h.get('role') == 'bot' else 'Người dùng'}: {h['text'][:600]}" for h in history]
    last_month = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    return (f"Hôm nay: {today.isoformat()} (tháng này {today:%Y-%m}, tháng trước {last_month})\n"
            "Danh mục của người dùng (mã = tên hiển thị · chi/thu):\n" + "\n".join(cat_lines) + "\n"
            f"Trạng thái lượt trước: {json.dumps(prev, ensure_ascii=False) if prev else 'không có'}\n"
            "Hội thoại gần nhất:\n" + ("\n".join(turns) or "(chưa có)") + "\n"
            f"Câu hỏi mới: {message}")


def gemini(model, timeout, prompt):
    cfg = {"temperature": 0, "maxOutputTokens": 1024, "responseMimeType": "application/json", "responseSchema": SCHEMA}
    if model.startswith("gemini-3"):
        cfg["thinkingConfig"] = {"thinkingLevel": "minimal"}
    body = json.dumps({"system_instruction": {"parts": [{"text": SYSTEM}]},
                       "contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": cfg},
                      ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", body,
                                 {"Content-Type": "application/json; charset=UTF-8",
                                  "x-goog-api-key": os.environ.get("GEMINI_API_KEY", "")})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        c = (json.load(r).get("candidates") or [{}])[0]
    if c.get("finishReason") != "STOP":
        raise ValueError(f"finishReason={c.get('finishReason')}")
    return json.loads("".join(p.get("text", "") for p in c["content"]["parts"] if not p.get("thought")))


def understand(prompt):
    """(JSON của LLM, số lần gọi). Model chính lỗi (429, quá giờ, JSON hỏng, bị cắt) → model dự phòng; cả hai lỗi → 503."""
    errors = []
    for calls, (model, timeout) in enumerate(MODELS, 1):
        try:
            return gemini(model, timeout, prompt), calls
        except urllib.error.HTTPError as e:
            errors.append(f"{model} HTTP {e.code}: {' '.join(e.read()[:300].decode('utf-8', 'replace').split())}")
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as e:
            errors.append(f"{model}: {e!r}")
    raise HTTPException(503, "; ".join(errors))


# ---------- Code kiểm lại đầu ra LLM (§3.3) ----------

def match_category(raw, cats):
    """Tên LLM đưa → mã danh mục có thật, khớp mờ trên bản bỏ dấu theo mã lẫn tên hiển thị; không khớp → None."""
    names = {fold(c): c for c in cats} | {fold(CATEGORIES[c][0]): c for c in cats if c in CATEGORIES}
    hit = difflib.get_close_matches(fold(raw), names, n=1, cutoff=0.8)
    return names[hit[0]] if hit else None


def fix_month(raw, today):
    """"YYYY-MM" hợp lệ; tháng ở tương lai lùi về năm gần nhất đã qua («tháng 12» hỏi vào tháng 10). Sai dạng → None."""
    m = re.fullmatch(r"(\d{4})-(\d{2})", raw or "")
    if not m or not 1 <= int(m[2]) <= 12:
        return None
    mo = int(m[2])
    return f"{min(int(m[1]), today.year if mo <= today.month else today.year - 1):04d}-{mo:02d}"


def _text(d, k):
    v = d.get(k) if isinstance(d, dict) else None
    return v.strip() if isinstance(v, str) and v.strip() else None


def resolve(out, prev, cats, today):
    """(intent, filters, clarify, state mới). State chỉ ghi mới ở lượt tài chính: lượt complaint, xã giao… giữ state cũ."""
    intent = out.get("intent") if out.get("intent") in INTENTS else "unclear"
    prev = prev if isinstance(prev, dict) and isinstance(prev.get("filters"), dict) else None
    f = {k: _text(out.get("filters"), k) for k in FILTER_KEYS}
    if intent in FINANCE and prev:
        # Chốt chặn cho «Làm lại», «chi tiết hơn»: thừa kế bằng code, không trông vào LLM.
        # ponytail: thừa kế từng trường — «tổng chi tháng 9» sau một lượt có danh mục vẫn giữ danh mục; thêm giá trị
        # «tất cả» vào lược đồ khi gặp ca thật.
        f = {k: f[k] or _text(prev["filters"], k) for k in FILTER_KEYS}
    clarify = _text(out, "clarify")
    if f["category"]:
        cat = match_category(f["category"], cats)
        if not cat:
            clarify = clarify or f"Mình không thấy danh mục «{f['category']}» trong dữ liệu của bạn. Bạn muốn xem danh mục nào?"
        f["category"] = cat
    f["month"] = fix_month(f["month"], today)
    if intent == "finance_compare" and not f["month"]:
        f["month"] = f"{today:%Y-%m}"  # so sánh cần một kỳ: LLM bỏ trống → tháng này so với tháng trước
    f["type"] = cats[f["category"]] if f["category"] else (f["type"] if f["type"] in ("expense", "income") else "expense")
    return intent, f, clarify, ({"intent": intent, "filters": f} if intent in FINANCE else prev)


# ---------- Lớp 2 — Đường A: code lọc, đếm, cộng, liệt kê (§3.4) ----------

def vnd(x):
    return f"{round(x):,}".replace(",", ".") + "đ"


def select(tx, month, f):
    """Giao dịch khớp bộ lọc, cũ → mới. month=None: mọi thời gian. keyword: nguyên từ trong ghi chú, bỏ dấu."""
    kw = fold(f["keyword"])
    return sorted((t for t in tx if t["type"] == f["type"] and t["date"].startswith(month or "")
                   and f["category"] in (None, t["category"])
                   and (not kw or re.search(rf"\b{re.escape(kw)}\b", fold(t.get("description"))))),
                  key=lambda t: (t["date"], t["id"]))


def path_a(tx, intent, f):
    """(khối SỰ KIỆN, bảng giao dịch). Mọi con số do code tính; Bước 7 cho LLM diễn đạt lại SỰ KIỆN, bảng gắn nguyên."""
    rows, label = select(tx, f["month"], f), lambda c: CATEGORIES[c][0] if c in CATEGORIES else c
    mmyyyy = lambda ym: f"{ym[5:]}/{ym[:4]}"  # «10/2026» — không ghi dạng ngày/tháng để bộ chấm không tưởng là dòng giao dịch
    total = sum(t["amount"] for t in rows)
    facts = [" · ".join([f"KỲ: {mmyyyy(f['month']) if f['month'] else 'mọi thời gian'}",
                         f"DANH MỤC: {label(f['category']) if f['category'] else 'tất cả'}",
                         f"LOẠI: {'thu' if f['type'] == 'income' else 'chi'}"] + ([f"GHI CHÚ CÓ: «{f['keyword']}»"] if f["keyword"] else [])),
             f"SỐ GIAO DỊCH: {len(rows)} · TỔNG: {vnd(total)}" + (f" · TB/GD: {vnd(total / len(rows))}" if rows else "")]
    if f["month"]:
        # ponytail: chỉ so với tháng liền trước — thêm tháng thứ hai vào lược đồ §3.3 khi gặp «tháng 10 so với tháng 8»
        pm = (date.fromisoformat(f["month"] + "-01") - timedelta(days=1)).strftime("%Y-%m")
        prev = select(tx, pm, f)
        p = sum(t["amount"] for t in prev)
        facts.append(f"SO VỚI {mmyyyy(pm)}: {len(prev)} giao dịch · TỔNG: {vnd(p)} · {'tăng' if total >= p else 'giảm'} {vnd(abs(total - p))}")
    if not rows:
        return "\n".join(facts), "Không tìm thấy giao dịch nào khớp" + (f" «{f['keyword']}»" if f["keyword"] else "") + "."
    if intent in ("finance_aggregate", "finance_compare"):
        return "\n".join(facts), ""
    cat = not f["category"]  # không lọc danh mục → thêm cột danh mục
    table = ["| Ngày | Số tiền |" + (" Danh mục |" if cat else "") + " Ghi chú |", "|---|---|" + ("---|" if cat else "") + "---|"]
    table += [f"| {t['date'][8:]}/{t['date'][5:7]}/{t['date'][:4]} | {vnd(t['amount'])} |" + (f" {label(t['category'])} |" if cat else "")
              + f" {' '.join((t.get('description') or '').replace('|', '/').split())} |" for t in rows]
    return "\n".join(facts), "\n".join(table)


# ---------- HTTP ----------

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


def answer(data):
    message, prev = data["message"], data.get("state")
    reply = smalltalk(message)
    if reply:
        return {"reply": reply, "state": prev, "proposal": None,
                "meta": {"intent": "smalltalk", "rewritten": message, "llm_calls": 0, "finish_reason": "STOP"}}
    today = date.fromisoformat(data.get("today") or date.today().isoformat())
    tx = load_transactions(data["user_id"])  # user_id chỉ lấy từ body đã ký, không bao giờ từ LLM
    cats = user_categories(tx)
    raw = data.get("history")
    history = [h for h in (raw if isinstance(raw, list) else []) if isinstance(h, dict) and isinstance(h.get("text"), str)][-6:]
    redo = REDO.fullmatch(" ".join(re.sub(r"[^\w ]+", " ", fold(message)).split()))
    if redo and isinstance(prev, dict) and prev.get("intent") in FINANCE:
        out, calls = {"intent": prev["intent"]}, 0  # resolve() thừa kế đủ bộ lọc từ state và kiểm lại như mọi lượt
    else:
        out, calls = understand(build_prompt(message, history, prev, cats, today))
    intent, filters, clarify, state = resolve(out, prev, cats, today)
    if clarify or intent not in FINANCE:
        reply = clarify or "Trợ lý RAG đang được xây dựng."  # Bước 5+: complaint, modify_data, advice…
    else:
        reply = "\n\n".join(p for p in path_a(tx, intent, filters) if p)  # Bước 7: LLM diễn đạt lại khối SỰ KIỆN
    return {"reply": reply, "state": state, "proposal": None,
            "meta": {"intent": intent, "rewritten": _text(out, "rewritten") or message, "llm_calls": calls,
                     "finish_reason": "STOP"}}


@app.get("/api/rag/healthz")
def healthz():
    return {"ok": True}


@app.post("/api/rag/chat")
async def chat(request: Request):
    data = verify(request.headers, await request.body())
    return await run_in_threadpool(answer, data)  # gọi Gemini / MySQL là chặn → chạy ngoài vòng sự kiện
