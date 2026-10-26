"""Dịch vụ RAG của SpendMindAI (docs/knowledge/chatbot-rag-thiet-ke.md §3, §6, §7).

PHP (api/controllers/ChatbotController.php::forwardToRag) là cửa duy nhất: nó kiểm phiên đăng nhập và giới hạn tần
suất, rồi gọi vào đây kèm chữ ký HMAC-SHA256 trên "<timestamp>.<body>". Hợp đồng vào/ra: tests/chatbot_eval/run_eval.py.

Bước 3: regex xã giao (§3.2) → một lần gọi LLM viết lại câu hỏi + phân loại ý định (§3.3) → code kiểm lại bộ lọc.
Bước 4: Đường A (§3.4) — code lọc theo bộ lọc đã kiểm, tự đếm / cộng / liệt kê, dựng khối SỰ KIỆN + bảng giao dịch.
Bước 5: sửa / xoá qua chat (§3.5) — chỉ trả đề xuất; dữ liệu chỉ đổi khi người dùng bấm Xác nhận ở js/chatbot.js.
Bước 6: tìm theo ghi chú = khớp cụm từ + vector multilingual-e5-small (ONNX int8, chạy tại chỗ), vector lưu ở CSDL (§4).
Bước 7: LLM diễn đạt SỰ KIỆN + tín hiệu do code tính thành 1–3 câu và gợi ý; code kiểm lại số trước khi trả (§3.6).
"""
import difflib
import functools
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

import numpy as np
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

def db_connect():
    """Kết nối CSDL bằng đúng các biến của api/config/database.php: DATABASE_URL / MYSQL_URL, trường nào thiếu lấy DB_HOST,
    DB_PORT, DB_USER, DB_PASS, DB_NAME; cùng luật SSL (DB_SSL). Không có biến nào → None (chạy ở máy với local_dev_data.json)."""
    env = os.environ.get
    raw = env("DATABASE_URL") or env("MYSQL_URL") or ""
    u = urlsplit(raw)
    host = u.hostname or env("DB_HOST")
    if not host:
        return None
    use_ssl = env("DB_SSL") == "true" or "ssl" in raw or (host not in ("127.0.0.1", "localhost", "::1", "db", "mysql")
                                                           and env("DB_SSL") != "false")
    return pymysql.connect(host=host, port=u.port or int(env("DB_PORT") or 3306),
                           user=unquote(u.username) if u.username else env("DB_USER", "root"),
                           password=unquote(u.password) if u.password is not None else env("DB_PASS", ""),
                           database=u.path.lstrip("/") or env("DB_NAME", "quan_ly_chi_tieu"), connect_timeout=5,
                           ssl=ssl.create_default_context() if use_ssl else None, cursorclass=pymysql.cursors.DictCursor)


def load_user(user_id):
    """(mọi giao dịch, ngân sách {danh mục: hạn mức}) của người dùng, tải một lần mỗi yêu cầu (idx_user_date, database.sql:38).
    Không có CSDL → local_dev_data.json (chạy ở máy)."""
    conn = db_connect()
    if not conn:
        # ponytail: tệp chạy thử trên máy chỉ có một người dùng nên bỏ qua user_id
        d = json.loads(LOCAL_DATA.read_text(encoding="utf-8"))
        return d["transactions"], d.get("budgets") or {}
    with conn, conn.cursor() as cur:
        cur.execute("SELECT id, type, amount, category, date, description FROM transactions WHERE user_id = %s", (user_id,))
        # pymysql trả DECIMAL → Decimal, DATE → date: đưa về cùng dạng với local_dev_data.json
        tx = [r | {"amount": float(r["amount"]), "date": r["date"].isoformat()} for r in cur.fetchall()]
        cur.execute("SELECT category, limit_amount FROM budgets WHERE user_id = %s", (user_id,))
        return tx, {r["category"]: float(r["limit_amount"]) for r in cur.fetchall()}


def user_categories(tx):
    """{mã/tên danh mục: "expense"|"income"} — danh mục chuẩn + danh mục tự đặt của chính người dùng."""
    return {k: v[1] for k, v in CATEGORIES.items()} | {t["category"]: t["type"] for t in tx if t["category"] not in CATEGORIES}


# ---------- Lớp 1: viết lại câu hỏi + phân loại ý định, một lần gọi LLM (§3.3) ----------

_NULLABLE = {"type": "STRING", "nullable": True}
SCHEMA = {"type": "OBJECT", "required": ["rewritten", "intent", "filters", "clarify", "action", "new_category"], "properties": {
    "rewritten": {"type": "STRING"},
    "intent": {"type": "STRING", "enum": INTENTS},
    "filters": {"type": "OBJECT", "required": list(FILTER_KEYS), "properties": {
        "month": _NULLABLE, "category": _NULLABLE,
        "type": {"type": "STRING", "enum": ["expense", "income"], "nullable": True}, "keyword": _NULLABLE}},
    "clarify": _NULLABLE,
    "action": {"type": "STRING", "enum": ["update", "delete"], "nullable": True}, "new_category": _NULLABLE}}

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
- category: chỉ chọn trong «Danh mục của người dùng», ghi đúng mã ở đầu dòng; câu hỏi không nhắc danh mục (vd «tháng 10
  tôi chi bao nhiêu») → null, đừng tự chọn danh mục phổ biến.
  Món / nơi / việc không phải danh mục → đưa vào keyword, không đưa vào category.
- type: "income" khi hỏi về thu nhập, còn lại "expense".
- keyword: tên món / nơi / việc cần tìm trong ghi chú giao dịch, chữ thường, giữ cách viết của người dùng, bỏ động từ
  đi kèm («tiền đi net» → «net», «uống monster» → «monster»); không có → null.
clarify: null, trừ khi intent là unclear.

Với modify_data và complaint:
- filters mô tả giao dịch CẦN sửa (ghi chú, danh mục hiện tại, tháng) — không ghi giá trị mới vào filters.
- new_category: danh mục MỚI người dùng muốn chuyển sang («sang ăn uống», «nó là ăn uống»), ghi đúng mã trong «Danh mục
  của người dùng»; không nêu → null. Ý định khác → null.
- action: "update" khi chuyển / sửa, "delete" khi xoá; ý định khác → null."""


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


def gemini(model, timeout, prompt, system=SYSTEM, schema=SCHEMA):
    cfg = {"temperature": 0, "maxOutputTokens": 1024, "responseMimeType": "application/json", "responseSchema": schema}
    if model.startswith("gemini-3"):
        cfg["thinkingConfig"] = {"thinkingLevel": "minimal"}
    body = json.dumps({"system_instruction": {"parts": [{"text": system}]},
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


# Từ trong tên danh mục quá chung để coi là «đã nhắc tới» («tôi chi bao nhiêu» không phải danh mục «Khác (Chi)»)
_GENERIC = {"chi", "thu", "khac", "them", "duoc"}
TIME = re.compile(r"\b(thang|nam|tuan|hom|ngay|nay|qua|truoc)\b|\d+/\d+")


def mentioned(cat, message):
    """Câu hỏi có nhắc danh mục không: một từ (bỏ dấu, ≥ 2 chữ, không quá chung) của mã hay tên hiển thị xuất hiện nguyên từ."""
    words = set(re.sub(r"[^\w ]+", " ", fold(message)).split())
    names = re.sub(r"[^\w ]+", " ", fold(f"{cat} {CATEGORIES[cat][0] if cat in CATEGORIES else ''}")).split()
    return any(w in words for w in names if len(w) > 1 and w not in _GENERIC)


def resolve(out, prev, cats, today, message=None):
    """(intent, filters, clarify, state mới). State chỉ ghi mới ở lượt tài chính: lượt complaint, xã giao… giữ state cũ.
    message: câu hỏi gốc, để bỏ danh mục LLM tự gán mà câu không nhắc tới."""
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
        if cat and message is not None and cat != _text(prev and prev["filters"], "category") and not mentioned(cat, message):
            # 3.1-flash-lite gán «Ăn uống» cho «tháng 10 tôi chi bao nhiêu» dù lời nhắc cấm → code bỏ
            f["category"] = None
    f["month"] = fix_month(f["month"], today)
    if intent == "finance_compare" and not f["month"]:
        f["month"] = f"{today:%Y-%m}"  # so sánh cần một kỳ: LLM bỏ trống → tháng này so với tháng trước
    f["type"] = cats[f["category"]] if f["category"] else (f["type"] if f["type"] in ("expense", "income") else "expense")
    return intent, f, clarify, ({"intent": intent, "filters": f} if intent in FINANCE else prev)


# ---------- Lớp 2 — Đường A: code lọc, đếm, cộng, liệt kê (§3.4) ----------

def vnd(x):
    return f"{round(x):,}".replace(",", ".") + "đ"


def label(c):
    return CATEGORIES[c][0] if c in CATEGORIES else c


def dmy(d):
    return f"{d[8:]}/{d[5:7]}/{d[:4]}"


def mmyyyy(ym):
    return f"{ym[5:]}/{ym[:4]}"  # «10/2026» — không ghi dạng ngày/tháng để bộ chấm không tưởng là dòng giao dịch


def prev_month(ym):
    return (date.fromisoformat(ym + "-01") - timedelta(days=1)).strftime("%Y-%m")


def select(tx, month, f):
    """Giao dịch khớp bộ lọc, cũ → mới. month=None: mọi thời gian. keyword → search() trên tập đã lọc cấu trúc."""
    rows = sorted((t for t in tx if t["type"] == f["type"] and t["date"].startswith(month or "")
                   and f["category"] in (None, t["category"])), key=lambda t: (t["date"], t["id"]))
    return search(rows, f["keyword"]) if f["keyword"] else rows


# ---------- Đường B — tìm theo ghi chú: cụm từ + vector e5-small chạy tại chỗ (§3.4, §4, §5) ----------

MODEL_DIR = Path(__file__).resolve().parent / "model"
EMBED_MODEL = "multilingual-e5-small-int8"
# Cosine tối thiểu để tính là khớp: chỉnh trên 16 câu hỏi có nhãn (tests/rag/test_search.py) — 0,89 cho 0 dòng khớp sai.
# ponytail: e5-small không nối được tên hãng / tiếng lóng («nước tăng lực» ↔ «monster», «taxi» ↔ «Grab»); đổi sang
# gte-multilingual-base khi người dùng thật hay hỏi kiểu này (§5).
SIM = 0.89
_e5, _vecs, _table_ready = None, {}, False


def e5():
    """(phiên ONNX, tokenizer), nạp một lần mỗi máy. Mô hình chia 2 mảnh < 100 MB vì GitHub chặn tệp lớn hơn."""
    global _e5
    if _e5 is None:
        import onnxruntime as ort
        from tokenizers import Tokenizer
        tok = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
        tok.enable_truncation(128)
        blob = b"".join(p.read_bytes() for p in sorted(MODEL_DIR.glob("model_int8.onnx.part*")))
        _e5 = (ort.InferenceSession(blob, providers=["CPUExecutionProvider"]), tok)
    return _e5


def embed(texts):
    """Vector đơn vị 384 chiều, mean pooling như e5. texts phải có tiền tố «query: » / «passage: ».
    Nhúng TỪNG câu, không đệm: bản int8 lượng tử hoá động theo cả lô, cùng một câu ở lô khác lệch tới ~0,005 cosine —
    vector lưu theo hash nội dung phải chỉ phụ thuộc nội dung."""
    sess, tok = e5()
    out = []
    for text in texts:
        ids = np.array([tok.encode(text).ids], dtype=np.int64)
        h = sess.run(None, {"input_ids": ids, "attention_mask": np.ones_like(ids), "token_type_ids": np.zeros_like(ids)})[0][0]
        v = h.mean(0)
        out.append(v / np.linalg.norm(v))
    return np.array(out, dtype=np.float32).reshape(len(texts), -1)


@functools.lru_cache(maxsize=256)
def query_vector(kw):
    return embed([f"query: {kw}"])[0]


def passage(t):
    return f"passage: {label(t['category'])}. {(t.get('description') or '').strip()}"


def vectors(rows):
    """{tx_id: vector} của các dòng: RAM → bảng transaction_embeddings → nhúng một lô phần còn thiếu rồi ghi lại (§4).
    Khoá là (tx_id, hash nội dung): sửa danh mục / ghi chú ở bất kỳ đâu thì hash đổi và vector được tính lại; xoá giao
    dịch thì khoá ngoại tự xoá vector. Chỉ tra đúng các dòng của người đang hỏi, nên không lẫn dữ liệu giữa người dùng."""
    global _table_ready
    want = {t["id"]: hashlib.sha256(f"{EMBED_MODEL}|{passage(t)}".encode()).hexdigest()[:16] for t in rows}
    miss = [i for i, h in want.items() if _vecs.get(i, ("",))[0] != h]
    if miss:
        if len(_vecs) > 50000:  # ponytail: bộ đệm RAM không giới hạn theo người; xoá sạch khi quá ~75 MB
            _vecs.clear()
        by_id = {t["id"]: t for t in rows}
        conn = db_connect()
        if not conn:  # chạy ở máy: chỉ bộ đệm RAM
            _vecs.update({i: (want[i], v) for i, v in zip(miss, embed([passage(by_id[i]) for i in miss]))})
        else:
            with conn, conn.cursor() as cur:
                if not _table_ready:
                    cur.execute("CREATE TABLE IF NOT EXISTS transaction_embeddings (tx_id VARCHAR(50) NOT NULL PRIMARY KEY, "
                                "content_hash CHAR(16) NOT NULL, vector BLOB NOT NULL, FOREIGN KEY (tx_id) REFERENCES "
                                "transactions (id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 "
                                "COLLATE=utf8mb4_unicode_ci")
                    _table_ready = True
                cur.execute("SELECT tx_id, content_hash, vector FROM transaction_embeddings WHERE tx_id IN ("
                            + ", ".join(["%s"] * len(miss)) + ")", miss)
                for r in cur.fetchall():
                    if want[r["tx_id"]] == r["content_hash"]:
                        _vecs[r["tx_id"]] = (r["content_hash"], np.frombuffer(r["vector"], dtype=np.float32))
                todo = [i for i in miss if _vecs.get(i, ("",))[0] != want[i]]
                if todo:
                    new = embed([passage(by_id[i]) for i in todo])
                    cur.executemany("REPLACE INTO transaction_embeddings (tx_id, content_hash, vector) VALUES (%s, %s, %s)",
                                    [(i, want[i], v.tobytes()) for i, v in zip(todo, new)])
                    conn.commit()
                    _vecs.update({i: (want[i], v) for i, v in zip(todo, new)})
    return {i: _vecs[i][1] for i in want}


def search(rows, kw):
    """Dòng có cụm từ kw trong ghi chú (bỏ dấu) HOẶC cosine(kw, «danh mục. ghi chú») ≥ SIM. Đếm / cộng vẫn ở Đường A.
    ponytail: không xếp hạng BM25 / RRF — câu đếm cần đủ MỌI dòng khớp chứ không phải top-k; thêm khi cần «khớp nhất»."""
    k = fold(kw)
    hit = {t["id"] for t in rows if re.search(rf"\b{re.escape(k)}\b", fold(t.get("description")))}
    rest = [t for t in rows if t["id"] not in hit]
    if rest:
        vec, q = vectors(rest), query_vector(kw)
        hit |= {t["id"] for t in rest if float(vec[t["id"]] @ q) >= SIM}
    return [t for t in rows if t["id"] in hit]


def path_a(tx, intent, f):
    """(khối SỰ KIỆN, bảng giao dịch). Mọi con số do code tính; Bước 7 cho LLM diễn đạt lại SỰ KIỆN, bảng gắn nguyên."""
    rows = select(tx, f["month"], f)
    total = sum(t["amount"] for t in rows)
    facts = [" · ".join([f"KỲ: {mmyyyy(f['month']) if f['month'] else 'mọi thời gian'}",
                         f"DANH MỤC: {label(f['category']) if f['category'] else 'tất cả'}",
                         f"LOẠI: {'thu' if f['type'] == 'income' else 'chi'}"] + ([f"GHI CHÚ CÓ: «{f['keyword']}»"] if f["keyword"] else [])),
             f"SỐ GIAO DỊCH: {len(rows)} · TỔNG: {vnd(total)}" + (f" · TB/GD: {vnd(total / len(rows))}" if rows else "")]
    if rows and not f["category"]:
        by = {}
        for t in rows:
            by[t["category"]] = by.get(t["category"], 0) + t["amount"]
        facts.append("THEO DANH MỤC: " + " · ".join(f"{label(c)} {vnd(s)}" for c, s in sorted(by.items(), key=lambda kv: -kv[1])[:6]))
    if f["month"]:
        # ponytail: chỉ so với tháng liền trước — thêm tháng thứ hai vào lược đồ §3.3 khi gặp «tháng 10 so với tháng 8»
        pm = prev_month(f["month"])
        prev = select(tx, pm, f)
        p = sum(t["amount"] for t in prev)
        facts.append(f"SO VỚI {mmyyyy(pm)}: {len(prev)} giao dịch · TỔNG: {vnd(p)} · {'tăng' if total >= p else 'giảm'} {vnd(abs(total - p))}")
    if not rows:
        return "\n".join(facts), (f"Không tìm thấy giao dịch {'thu' if f['type'] == 'income' else 'chi'} nào"
                                   + (f" mục {label(f['category'])}" if f["category"] else "")
                                   + (f" tháng {mmyyyy(f['month'])}" if f["month"] else "")
                                   + (f" có ghi chú «{f['keyword']}»" if f["keyword"] else "") + ".")
    if intent in ("finance_aggregate", "finance_compare"):
        return "\n".join(facts), ""
    cat = not f["category"]  # không lọc danh mục → thêm cột danh mục
    table = ["| Ngày | Số tiền |" + (" Danh mục |" if cat else "") + " Ghi chú |", "|---|---|" + ("---|" if cat else "") + "---|"]
    table += [f"| {dmy(t['date'])} | {vnd(t['amount'])} |" + (f" {label(t['category'])} |" if cat else "")
              + f" {' '.join((t.get('description') or '').replace('|', '/').split())} |" for t in rows]
    return "\n".join(facts), "\n".join(table)


# ---------- Lớp 3 — LLM diễn đạt SỰ KIỆN + gợi ý, code kiểm lại số (§3.6) ----------

def spend(tx, month):
    """{danh mục: (tổng chi, số giao dịch)} trong tháng."""
    out = {}
    for t in tx:
        if t["type"] == "expense" and t["date"].startswith(month):
            s, n = out.get(t["category"], (0, 0))
            out[t["category"]] = (s + t["amount"], n + 1)
    return out


def signals(tx, budgets, month, cat):
    """Tín hiệu cho gợi ý — code tính, LLM chỉ diễn đạt: vượt / sắp chạm ngân sách, tăng > 20% so với tháng trước,
    nhiều giao dịch nhỏ, chi > thu (chỉ khi không lọc danh mục)."""
    now, before, out = spend(tx, month), spend(tx, prev_month(month)), []
    inc = sum(t["amount"] for t in tx if t["type"] == "income" and t["date"].startswith(month))
    exp = sum(s for s, _ in now.values())
    if not cat and exp > inc:  # tín hiệu cấp tháng đứng đầu để không bị cắt
        out.append(f"CHI > THU tháng {mmyyyy(month)}: chi {vnd(exp)}, thu {vnd(inc)}")
    for c, (s, n) in sorted(now.items(), key=lambda kv: -kv[1][0]):
        if cat and c != cat:
            continue
        lim, p = budgets.get(c) or 0, before.get(c, (0, 0))[0]
        if lim and s > lim:
            out.append(f"{label(c)} VƯỢT NGÂN SÁCH: đã chi {vnd(s)} / hạn mức {vnd(lim)}")
        elif lim and s >= 0.8 * lim:
            out.append(f"{label(c)} đã dùng {round(s / lim * 100)}% ngân sách ({vnd(s)} / {vnd(lim)})")
        if p and s > 1.2 * p:
            out.append(f"{label(c)} TĂNG {round((s - p) / p * 100)}% so với tháng trước ({vnd(p)} → {vnd(s)})")
        if n >= 10 and s / n < 50000:
            out.append(f"{label(c)}: {n} giao dịch nhỏ, TB {vnd(s / n)}")
    return out[:4]


ANSWER_SCHEMA = {"type": "OBJECT", "required": ["answer"], "properties": {"answer": {"type": "STRING"}}}
ANSWER_SYSTEM = """Bạn là trợ lý chi tiêu SpendMindAI. Trả lời «Câu hỏi» bằng tiếng Việt, CHỈ dựa trên SỰ KIỆN và TÍN HIỆU.
1. Chỉ dùng con số có trong SỰ KIỆN / TÍN HIỆU, chép đúng cách viết (vd 921.000đ). Không tự cộng, trừ, làm tròn hay đổi
   đơn vị. Câu hỏi nhắc số khác dữ liệu (vd «19 giao dịch» mà SỰ KIỆN ghi 21) → dùng số của SỰ KIỆN.
2. Luôn nêu SỐ GIAO DỊCH và TỔNG khi SỰ KIỆN có; câu so sánh nêu cả tổng của tháng được so.
3. 1–3 câu, không đánh số, không nêu ngày cụ thể, không chép bảng — bảng giao dịch được gắn sẵn ngay dưới câu trả lời.
4. Bạn không sửa được dữ liệu: không bao giờ nói đã sửa / đã xoá / đã cập nhật.
5. Kết thúc bằng 1–2 gợi ý tài chính cụ thể dựa trên TÍN HIỆU; không có tín hiệu → một gợi ý chung, ngắn.
6. Không chào hỏi, không mở bài. Có thể in đậm con số bằng **…**."""
CLAIM = re.compile(r"\bda (cap nhat|sua|xoa|thay doi|chuyen)")
DAY = re.compile(r"\b\d{1,2}/\d{1,2}\b")  # «12/10»: ngày cụ thể chỉ nằm trong bảng; «10/2026» không khớp


def nums(s):
    return {int(re.sub(r"[.,]", "", m)) for m in re.findall(r"\d{1,3}(?:[.,]\d{3})+|\d+", s)}


def phrase(model, question, facts, sig, must, deadline):
    """(câu trả lời, số lần gọi LLM). Code kiểm lại câu LLM: số không có trong SỰ KIỆN, thiếu số bắt buộc, nêu ngày,
    nhận đã sửa dữ liệu, lỗi hay hết giờ → câu mẫu dựng từ SỰ KIỆN. Đây là chốt «đúng số liệu»."""
    tips = sig or ["Đặt hạn mức cho từng danh mục để biết sớm khi sắp chi quá tay."]
    block = facts + "\nTÍN HIỆU:\n" + "\n".join(f"- {s}" for s in tips)
    fallback = facts + "\n\nĐáng chú ý:\n" + "\n".join(f"- {s}" for s in tips)
    text, calls = None, 0
    for m in [model] + [x for x, _ in MODELS if x != model]:  # lỗi (429 theo phút, 503 quá tải) → model kia, nếu còn giờ
        left = deadline - time.monotonic()
        if left < 2:
            break
        calls += 1
        try:
            text = _text(gemini(m, min(5, left - 0.5), f"Câu hỏi: {question}\n\n{block}", ANSWER_SYSTEM, ANSWER_SCHEMA), "answer")
            break
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
            continue
    ok = text and nums(text) <= nums(block) and must <= nums(text) and not DAY.search(text) and not CLAIM.search(fold(text))
    return (text if ok else fallback), calls


# ---------- Ý định sửa dữ liệu — chỉ đề xuất, không ghi (§3.5) ----------

def propose(tx, f, action, new_cat, cats):
    """(câu trả lời, đề xuất | None). Chỉ đề xuất khi khớp đúng MỘT giao dịch; nhiều hay không khớp thì hỏi lại."""
    action = action if action in ("update", "delete") else ("update" if new_cat else None)
    if not action:
        return "Bạn muốn xoá giao dịch đó hay chuyển nó sang danh mục nào?", None
    if action == "update" and not new_cat:
        return "Bạn muốn chuyển giao dịch đó sang danh mục nào?", None
    if f["category"] == new_cat:  # LLM ghi nhầm danh mục mới vào bộ lọc → bỏ, tìm theo ghi chú / tháng
        f = f | {"category": None}
    # ponytail: chỉ đổi danh mục hoặc xoá; thêm sửa số tiền / ngày / ghi chú khi người dùng cần
    rows = select(tx, f["month"], f)
    if len(rows) != 1:
        if not rows:
            return "Mình không tìm thấy giao dịch nào khớp. Bạn nêu rõ giúp ngày, số tiền hoặc ghi chú nhé?", None
        return (f"Có {len(rows)} giao dịch khớp — bạn muốn {'xoá' if action == 'delete' else 'chuyển'} giao dịch nào? "
                "Nêu thêm ngày hoặc số tiền nhé.\n\n" + path_a(tx, "finance_list", f)[1]), None
    t = rows[0]
    what = f"{dmy(t['date'])} · {vnd(t['amount'])} · {t.get('description') or ''}"
    if action == "delete":
        return (f"Xoá giao dịch {what} ({label(t['category'])})? Bấm Xác nhận để xoá, Huỷ để giữ nguyên.",
                {"action": "delete", "tx_id": t["id"], "changes": {}, "tx": t})
    if new_cat == t["category"]:
        return f"Giao dịch {what} đang ở mục {label(new_cat)} rồi.", None
    return (f"Chuyển giao dịch {what} từ {label(t['category'])} sang {label(new_cat)}? Bấm Xác nhận để lưu, Huỷ để giữ nguyên.",
            {"action": "update", "tx_id": t["id"], "changes": {"category": new_cat, "type": cats[new_cat]}, "tx": t})


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
    deadline = time.monotonic() + 12  # PHP chờ 13s (ChatbotController::forwardToRag)
    today = date.fromisoformat(data.get("today") or date.today().isoformat())
    tx, budgets = load_user(data["user_id"])  # user_id chỉ lấy từ body đã ký, không bao giờ từ LLM
    cats = user_categories(tx)
    raw = data.get("history")
    history = [h for h in (raw if isinstance(raw, list) else []) if isinstance(h, dict) and isinstance(h.get("text"), str)][-6:]
    redo = REDO.fullmatch(" ".join(re.sub(r"[^\w ]+", " ", fold(message)).split()))
    if redo and isinstance(prev, dict) and prev.get("intent") in FINANCE:
        out, calls = {"intent": prev["intent"]}, 0  # resolve() thừa kế đủ bộ lọc từ state và kiểm lại như mọi lượt
    else:
        out, calls = understand(build_prompt(message, history, prev, cats, today))
    intent, filters, clarify, state = resolve(out, prev, cats, today, message)
    if intent == "finance_search" and not TIME.search(fold(message)):
        filters["month"] = None  # tìm theo ghi chú mà câu không nêu thời gian → mọi thời gian (§3.3); model hay tự gán tháng này
    new_cat, proposal = match_category(_text(out, "new_category") or "", cats), None
    if intent == "modify_data" and new_cat and not filters["keyword"]:
        intent = "complaint"  # «nó là ăn uống»: không chỉ rõ giao dịch nào → hỏi lại, không đoán (§3.5)
    if intent == "complaint" and not new_cat and isinstance(prev, dict) and prev.get("intent") in FINANCE:
        # «liệt kê thiếu», «sai rồi» mà không nêu danh mục đúng → chạy lại yêu cầu tài chính lượt trước (§8 ca 6)
        intent, filters, clarify, state = resolve({"intent": prev["intent"]}, prev, cats, today)
    model, question = MODELS[max(calls, 1) - 1][0], _text(out, "rewritten") or message
    if clarify:
        reply = clarify
    elif intent in FINANCE or intent == "advice":
        # advice: gợi ý dựa trên tín hiệu thật của tháng này (§3.6)
        f = filters if intent in FINANCE else {"month": f"{today:%Y-%m}", "category": None, "type": "expense", "keyword": None}
        facts, table = path_a(tx, intent if intent in FINANCE else "finance_aggregate", f)
        rows = select(tx, f["month"], f)
        if not rows:
            reply = table  # «không tìm thấy …»: không cần LLM
        else:
            must = {len(rows), round(sum(t["amount"] for t in rows))} if intent in FINANCE else set()
            if intent == "finance_compare":
                must.add(round(sum(t["amount"] for t in select(tx, prev_month(f["month"]), f))))
            sig = signals(tx, budgets, f["month"] or f"{today:%Y-%m}", f["category"]) if f["type"] == "expense" and not f["keyword"] else []
            text, n = phrase(model, question, facts, sig, must, deadline)
            reply, calls = "\n\n".join(p for p in (text, table) if p), calls + n
    elif intent == "modify_data":
        reply, proposal = propose(tx, filters, out.get("action"), new_cat, cats)
    elif intent == "complaint":  # câu mơ hồ («nó là ăn uống») → hỏi lại, không tự đoán giao dịch (§3.5)
        reply = (f"Bạn muốn chuyển giao dịch nào sang {label(new_cat)}? Nêu ngày, số tiền hoặc ghi chú, mình sẽ hiện thẻ để "
                 "bạn xác nhận." if new_cat else "Mình chưa rõ chỗ nào sai. Bạn nói rõ giúp giao dịch hoặc con số nào nhé?")
    elif intent == "out_of_scope":
        reply = "Mình chỉ trả lời được câu hỏi về thu chi của bạn trong SpendMindAI."
    else:  # smalltalk mà regex không bắt, unclear không kèm câu hỏi lại
        reply = "Bạn hỏi cụ thể hơn giúp mình nhé, ví dụ «tháng này mình chi bao nhiêu cho ăn uống?»."
    return {"reply": reply, "state": state, "proposal": proposal,
            "meta": {"intent": intent, "rewritten": _text(out, "rewritten") or message, "llm_calls": calls,
                     "finish_reason": "STOP"}}


@app.get("/api/rag/healthz")
def healthz():
    return {"ok": True}


@app.post("/api/rag/chat")
async def chat(request: Request):
    data = verify(request.headers, await request.body())
    return await run_in_threadpool(answer, data)  # gọi Gemini / MySQL là chặn → chạy ngoài vòng sự kiện
