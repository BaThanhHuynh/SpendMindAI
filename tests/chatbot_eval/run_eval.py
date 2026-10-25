"""Bộ kiểm thử hồi quy chatbot SpendMindAI — Bước 0 của docs/knowledge/chatbot-rag-thiet-ke.md (§7, §8).

Đáp án số không ghi cứng: tính từ local_dev_data.json lúc chạy, theo bộ lọc khai trong cases.json.

  python -X utf8 tests/chatbot_eval/run_eval.py --target oracle   # tự kiểm bộ chấm: phải ĐẠT hết
  python -X utf8 tests/chatbot_eval/run_eval.py --target old      # chatbot TRƯỚC Bước 1 dựng lại + Gemini thật: ca 1-8 phải TRƯỢT
  PHP_BIN=<php.exe> .venv/Scripts/python -X utf8 tests/chatbot_eval/run_eval.py --target php   # ChatbotController.php thật
  python -X utf8 tests/chatbot_eval/run_eval.py --target http://localhost:8080/api/rag/chat --only goc -v
  ... --checks intent,rewritten,llm_calls,filters   # chỉ chấm các kiểm của một bước (vd Bước 3)

Hợp đồng API hệ mới (target http):
  gửi  {"message", "history": [{"role": "user"|"bot", "text"}] (6 tin gần nhất), "state", "today": "YYYY-MM-DD"}
  nhận {"reply", "state": {"intent", "filters": {"month", "category", "type", "keyword"}} | null,
        "proposal": {"action": "update"|"delete", "tx_id", "changes": {...}} | null,
        "meta": {"intent", "rewritten", "llm_calls", "finish_reason"}}
  Gọi thẳng dịch vụ RAG (api/rag, bỏ qua PHP): đặt RAG_INTERNAL_SECRET để bộ chạy tự ký và gửi user_id như PHP.
"""
import argparse
import collections
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "local_dev_data.json"
CASES = Path(__file__).resolve().parent / "cases.json"
HARNESS = Path(__file__).resolve().parent / "php_harness.php"

NUM = re.compile(r"(\d{1,3}(?:[.,]\d{3})+|\d+)(\s*k\b)?", re.I)
DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b")
ACTION_CLAIM = re.compile(r"\bda (cap nhat|sua|xoa|thay doi|chuyen giao dich)")


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").lower().replace("đ", "d"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def vnd(x):
    return f"{round(x):,}".replace(",", ".") + "đ"


def to_int(m):
    return int(re.sub(r"[.,]", "", m[1])) * (1000 if m[2] else 1)


def pick(db, f):
    kw = fold(f.get("keyword"))
    return [t for t in db["transactions"]
            if t["type"] == f.get("type", "expense")
            and t["date"].startswith(f.get("month", ""))
            and t["category"] == f.get("category", t["category"])
            and (not kw or re.search(rf"\b{re.escape(kw)}\b", fold(t.get("description"))))]


def agg(db, v):
    rows = pick(db, v["filter"])
    return len(rows) if v["agg"] == "count" else round(sum(t["amount"] for t in rows))


def pairs(text, year):
    """(ngày ISO, số tiền) của mọi dòng có ngày; số tiền = số >= 1.000 đầu tiên sau khi bỏ phần ngày."""
    # ponytail: một dòng = một giao dịch; câu tóm tắt có cả ngày lẫn số tiền («từ 01/10 … 936.000đ») bị tính
    # là dòng thừa. Gặp thì để hệ mới xuống dòng tóm tắt riêng không ghi ngày, hoặc lọc dòng trong bảng.
    out = collections.Counter()
    for line in text.splitlines():
        m = DATE.search(line)
        if not m:
            continue
        y, mo, d = (m[1], m[2], m[3]) if m[1] else (m[6] or year, m[5], m[4])
        rest = line[:m.start()] + " " + line[m.end():]
        amounts = [n for n in map(to_int, NUM.finditer(rest)) if n >= 1000]
        if amounts:
            out[(f"{int(y):04d}-{int(mo):02d}-{int(d):02d}", amounts[0])] += 1
    return out


def judge(turn, res, db, year, changed):
    reply, meta, errs = res.get("reply") or "", res.get("meta"), []
    if not reply.strip():
        errs.append("trả lời rỗng")
    if reply.count("**") % 2 or (meta and meta.get("finish_reason") not in (None, "STOP")):
        errs.append("bị cắt cụt")
    if ACTION_CLAIM.search(fold(reply)):
        errs.append("tuyên bố đã sửa dữ liệu")
    if changed:
        errs.append("dữ liệu bị thay đổi")
    for e in turn.get("expect", []):
        k = e["check"]
        if k == "lists":
            want = collections.Counter((t["date"], round(t["amount"])) for t in pick(db, e["filter"]))
            got = pairs(reply, year)
            miss, extra = sum((want - got).values()), sum((got - want).values())
            if miss or extra:
                errs.append(f"danh sách: thiếu {miss}/{sum(want.values())}, thừa {extra}")
        elif k == "mentions":
            nums = set(map(to_int, NUM.finditer(reply)))
            errs += [f"thiếu số {v['agg']}={x}" for v in e["values"] if (x := agg(db, v)) not in nums]
        elif k == "forbid":
            if re.search(e["regex"], fold(reply)):
                errs.append(f"có nội dung cấm /{e['regex']}/")
        elif k == "require":
            if not re.search(e["regex"], fold(reply)):
                errs.append(f"thiếu /{e['regex']}/")
        elif k == "proposal":
            p = res.get("proposal") or {}
            ok = (p.get("action") == e["action"] and p.get("tx_id") in {t["id"] for t in pick(db, e["filter"])}
                  and all((p.get("changes") or {}).get(a) == b for a, b in e.get("set", {}).items()))
            if not ok:
                errs.append("không có đề xuất xác nhận đúng")
        elif k == "filters":
            got = (res.get("state") or {}).get("filters") or {}
            if any(got.get(a) != b for a, b in e["want"].items()):
                errs.append(f"bộ lọc {got} ≠ {e['want']}")
        elif not meta:
            if "không có meta" not in errs:
                errs.append("không có meta")
        elif k == "intent" and meta.get("intent") not in e["any"]:
            errs.append(f"ý định {meta.get('intent')} ∉ {e['any']}")
        elif k == "rewritten" and not all(w in fold(meta.get("rewritten")) for w in e["has"]):
            errs.append(f"câu viết lại thiếu {e['has']}: «{meta.get('rewritten')}»")
        elif k == "llm_calls" and meta.get("llm_calls", 99) > e["max"]:
            errs.append(f"gọi LLM {meta.get('llm_calls')} lần > {e['max']}")
    return errs


def validate(cases, db):
    bad = []
    for conv in cases["conversations"]:
        for turn in conv["turns"]:
            for e in turn.get("expect", []):
                fs = [v["filter"] for v in e.get("values", [])] + ([e["filter"]] if "filter" in e else [])
                bad += [f"ca {turn['id']}: bộ lọc {f} rỗng" for f in fs if not pick(db, f) and not e.get("allow_empty")]
    return bad


# ---------- target: oracle (đáp án mẫu dựng từ chính kỳ vọng — để kiểm bộ chấm) ----------

def oracle(turn, db):
    lines, prop, state = [], None, None
    meta = {"intent": None, "rewritten": "", "llm_calls": 1, "finish_reason": "STOP"}
    for e in turn.get("expect", []):
        k = e["check"]
        if k == "lists":
            lines += [f"{t['date'][8:]}/{t['date'][5:7]} · {vnd(t['amount'])} · {t.get('description') or ''}"
                      for t in pick(db, e["filter"])]
        elif k == "mentions":
            lines += [str(agg(db, v)) if v["agg"] == "count" else vnd(agg(db, v)) for v in e["values"]]
        elif k == "require":
            lines.append(e["oracle"])
        elif k == "proposal":
            prop = {"action": e["action"], "tx_id": pick(db, e["filter"])[0]["id"], "changes": e.get("set", {})}
        elif k == "intent":
            meta["intent"] = e["any"][0]
        elif k == "rewritten":
            meta["rewritten"] = " ".join(e["has"])
        elif k == "llm_calls":
            meta["llm_calls"] = e["max"]
        elif k == "filters":
            state = {"filters": e["want"]}
    return {"reply": "\n".join(lines) or "Ok.", "meta": meta, "proposal": prop, "state": state}


# ---------- target: old (dựng lại api/controllers/ChatbotController.php::handleChat, không lịch sử) ----------

LABELS = {"food": "Ăn uống", "transport": "Di chuyển", "shopping": "Mua sắm", "entertainment": "Giải trí",
          "home": "Nhà cửa", "other_expense": "Khác (Chi)", "salary": "Lương", "freelance": "Freelance",
          "investment": "Đầu tư", "gift": "Được tặng / Khác"}


def env_var(name, default=""):
    if os.environ.get(name):
        return os.environ[name]
    env = ROOT / ".env"
    for line in env.read_text(encoding="utf-8").splitlines() if env.exists() else []:
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return default


def display_name(raw):
    name = (raw or "").strip().split("@")[0]
    if re.fullmatch(r"[a-z0-9._-]+", name, re.I):
        name = re.sub(r"\d+$", "", name)
        name = " ".join(w[:1].upper() + w[1:] for w in re.sub(r"[._-]", " ", name).strip().split(" "))
    return "Bá Thành" if name.lower() in ("huynhbathanh", "huynh bathanh") else (name or "bạn")


def old_prompt(db, today):
    tx, ym, lab = db["transactions"], today.strftime("%Y-%m"), lambda c: LABELS.get(c, c)
    s = lambda rows, kind: sum(t["amount"] for t in rows if t["type"] == kind)
    month = [t for t in tx if t["date"][:7] == ym]
    inc, exp, m_inc, m_exp = s(tx, "income"), s(tx, "expense"), s(month, "income"), s(month, "expense")
    cats = collections.defaultdict(lambda: [0, 0])
    for t in month:
        if t["type"] == "expense":
            cats[t["category"]][0] += t["amount"]
            cats[t["category"]][1] += 1
    cat_lines = [f"  • {lab(c)}: {vnd(v[0])} ({v[1]} giao dịch)" for c, v in sorted(cats.items(), key=lambda kv: -kv[1][0])]
    b_lines = []
    for c, limit in (db.get("budgets") or {}).items():
        if limit > 0:
            spent = cats[c][0] if c in cats else 0
            pct = ("%.1f" % round(spent / limit * 100, 1)).rstrip("0").rstrip(".")
            tail = (f"[ĐÃ VƯỢT {vnd(spent - limit)} ({pct}%)]" if spent > limit
                    else f"[Còn lại: {vnd(limit - spent)} ({pct}%)]")
            b_lines.append(f"  • {lab(c)}: Đã chi {vnd(spent)} / Hạn mức {vnd(limit)} {tail}")
    recent = sorted(tx, key=lambda t: (t["date"], t["id"]), reverse=True)[:15]
    t_lines = [f"  • Ngày {t['date']}: {'(+Thu)' if t['type'] == 'income' else '(-Chi)'} {vnd(t['amount'])} | {lab(t['category'])}"
               + (f" - Ghi chú: {t['description'].strip()}" if t.get("description") else "") for t in recent]
    net, mstr = m_inc - m_exp, today.strftime("%m/%Y")
    return (f"Bạn là trợ lý tài chính thông minh SpendMindAI của '{display_name(db['user'].get('username'))}'. Hôm nay là {today.strftime('%d/%m/%Y')}.\n\n"
            "=== DỮ LIỆU TÀI CHÍNH THỰC TẾ (TÍNH TỪ CƠ SỞ DỮ LIỆU) ===\n"
            f"1. Số dư ròng tích lũy hiện tại: {vnd(inc - exp)} (Tổng thu: {vnd(inc)} | Tổng chi: {vnd(exp)})\n"
            f"2. Tháng này ({mstr}):\n"
            f"   - Tổng thu nhập: {vnd(m_inc)}\n"
            f"   - Tổng chi tiêu: {vnd(m_exp)}\n"
            f"   - Dòng tiền ròng: {'+' if net >= 0 else ''}{vnd(net)}\n"
            f"3. Chi tiêu từng danh mục tháng {mstr}:\n" + ("\n".join(cat_lines) or "  • Chưa phát sinh chi tiêu tháng này.") + "\n"
            f"4. Tình hình ngân sách tháng {mstr}:\n" + ("\n".join(b_lines) or "  • Chưa thiết lập ngân sách.") + "\n"
            "5. 15 giao dịch gần đây nhất:\n" + ("\n".join(t_lines) or "  • Chưa ghi nhận giao dịch nào.") + "\n\n"
            "=== QUY TẮC PHẢN HỒI (BẮT BUỘC) ===\n"
            "1. CỰC KỲ NGẮN GỌN & ĐÚNG TRỌNG TÂM: Hỏi gì đáp nấy trong 1-3 câu hoặc bảng/danh sách ngắn. Tuyệt đối KHÔNG chào hỏi lặp lại ('Xin chào...', 'Chào bạn...'), KHÔNG mở bài dài dòng ('Theo dữ liệu...'), KHÔNG kết bài sáo rỗng ('Chúc bạn...').\n"
            "2. CHÍNH XÁC TUYỆT ĐỐI: Dùng đúng các con số đã được tính sẵn ở trên, không tự tính nhẩm sai lệch, không bịa số liệu.\n"
            "3. ĐỊNH DẠNG RÕ RÀNG: In đậm các con số tiền (ví dụ: **150.000đ**).\n"
            "4. CHỈ TRẢ LỜI TÀI CHÍNH: Nếu câu hỏi ngoài lề không liên quan tài chính cá nhân, từ chối đúng 1 câu ngắn gọn.")


def gemini(model, key, system, message):
    body = json.dumps({"system_instruction": {"parts": [{"text": system}]},
                       "contents": [{"parts": [{"text": message}]}],
                       "generationConfig": {"temperature": 0.2, "topP": 0.8, "maxOutputTokens": 350}},
                      ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                                 body, {"Content-Type": "application/json; charset=UTF-8", "x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        return None, f"{model} HTTP {e.code}: {' '.join(e.read()[:400].decode('utf-8', 'replace').split())[:160]}"
    except (urllib.error.URLError, TimeoutError) as e:
        return None, f"{model}: {e}"
    c = (data.get("candidates") or [{}])[0]
    text = ((c.get("content") or {}).get("parts") or [{}])[0].get("text", "").strip()
    return text or None, f"{model} finishReason={c.get('finishReason')}"


def old_target(db, today, message):
    key = env_var("GEMINI_API_KEY")
    if not key:
        return {"error": "thiếu GEMINI_API_KEY (biến môi trường hoặc .env)"}
    system, model = old_prompt(db, today), env_var("GEMINI_MODEL", "gemini-2.5-flash-lite")
    reply, info = gemini(model, key, system, message)
    if reply is None and model != "gemini-2.5-flash":
        reply, info2 = gemini("gemini-2.5-flash", key, system, message)
        info += " → " + info2
    return {"reply": reply, "meta": None, "debug": info} if reply else {"error": info}


# ---------- target: php (api/controllers/ChatbotController.php thật, qua php_harness.php) ----------

def php_target(message, history, state):
    php = os.environ.get("PHP_BIN", "php")
    # PHP 8.5 báo curl_close() lỗi thời ở mã cũ của ChatbotController — ẩn loại này để stdout vẫn là JSON
    flags = ["-d", f"extension_dir={Path(php).parent / 'ext'}", "-d", "error_reporting=E_ALL & ~E_DEPRECATED"]
    for ext in ("pdo_sqlite", "curl", "mbstring", "openssl"):
        flags += ["-d", f"extension={ext}"]
    try:
        import certifi  # bản PHP zip cho Windows không kèm chứng chỉ gốc → curl tới Gemini lỗi SSL
        flags += ["-d", f"curl.cainfo={certifi.where()}"]
    except ImportError:
        pass
    body = json.dumps({"message": message, "history": history, "state": state}, ensure_ascii=False).encode("utf-8")
    r = subprocess.run([php, *flags, str(HARNESS)], input=body, capture_output=True, timeout=60)
    try:
        out = json.loads(r.stdout)
    except json.JSONDecodeError:  # cảnh báo/lỗi PHP in ra stdout → hiện nguyên văn
        return {"error": f"PHP thoát {r.returncode}: {' '.join((r.stdout + r.stderr).decode('utf-8', 'replace').split())[:300]}"}
    return out if out.get("success") else {"error": f"HTTP {out.get('http')}: {out.get('message')}"}


# ---------- target: http (hệ mới) ----------

def http_target(url, message, history, state, today, user_id):
    body = json.dumps({"user_id": user_id, "message": message, "history": history, "state": state, "today": today},
                      ensure_ascii=False).encode("utf-8")
    headers, secret = {"Content-Type": "application/json"}, os.environ.get("RAG_INTERNAL_SECRET")
    if secret:
        ts = str(int(time.time()))
        headers |= {"X-RAG-Timestamp": ts,
                    "X-RAG-Signature": hmac.new(secret.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()}
    req = urllib.request.Request(url, body, headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {' '.join(e.read()[:400].decode('utf-8', 'replace').split())[:160]}"}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        return {"error": str(e)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="oracle | old | php | http(s)://...")
    ap.add_argument("--only", help="danh sách id hội thoại, cách nhau dấu phẩy (vd: goc,9a)")
    ap.add_argument("-v", action="store_true", help="in câu trả lời của target")
    ap.add_argument("--checks", help="chỉ chấm các kiểm này, cách nhau dấu phẩy (vd: intent,rewritten,llm_calls,filters)")
    a = ap.parse_args()
    cases, db = json.loads(CASES.read_text(encoding="utf-8")), json.loads(DATA.read_text(encoding="utf-8"))
    bad = validate(cases, db)
    if bad:
        sys.exit("Ca không hợp lệ với dữ liệu hiện tại:\n  " + "\n  ".join(bad))
    today, only = date.fromisoformat(cases["today"]), set((a.only or "").split(",")) - {""}
    checks = set((a.checks or "").split(",")) - {""}
    tally = collections.Counter()
    for conv in cases["conversations"]:
        if only and conv["id"] not in only:
            continue
        history, state = [], None
        for turn in conv["turns"]:
            before = hashlib.sha256(DATA.read_bytes()).digest()
            if a.target == "oracle":
                res = oracle(turn, db)
            elif a.target == "php":
                res = php_target(turn["say"], history, state)
            elif a.target == "old":
                res = old_target(db, today, turn["say"])
            else:
                res = http_target(a.target, turn["say"], history, state, cases["today"], int(db["user"].get("userId") or 1))
            changed = hashlib.sha256(DATA.read_bytes()).digest() != before
            if res.get("error"):
                status, why = "LỖI", res["error"]
            else:
                graded = {**turn, "expect": [e for e in turn.get("expect", []) if e["check"] in checks]} if checks else turn
                errs = judge(graded, res, db, today.year, changed)
                status, why = ("TRƯỢT" if errs else "ĐẠT"), "; ".join(errs)
            if res.get("debug"):
                why += f"  [{res['debug']}]"
            tally[status] += 1
            print(f"{turn['id']:>3}  {status:<5}  {turn['say'][:42]:<42}  {why}")
            if a.v and res.get("reply"):
                print("       ↳ " + res["reply"][:400].replace("\n", "\n         "))
            history = (history + [{"role": "user", "text": turn["say"]},
                                  {"role": "bot", "text": res.get("reply") or ""}])[-6:]
            state = res.get("state")
    print(f"\nĐẠT {tally['ĐẠT']} · TRƯỢT {tally['TRƯỢT']} · LỖI {tally['LỖI']}")
    sys.exit(0 if tally["ĐẠT"] == sum(tally.values()) else 1)


if __name__ == "__main__":
    main()
