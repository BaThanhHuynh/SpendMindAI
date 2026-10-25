"""Bước 4 — Đường A + khối SỰ KIỆN của api/rag/index.py (không gọi LLM).  Chạy: .venv/Scripts/python -X utf8 tests/rag/test_path_a.py

Bộ lọc lấy từ chính các ca đếm / tổng / liệt kê trong tests/chatbot_eval/cases.json, chấm bằng run_eval.judge.
Nhánh MySQL: câu SELECT thật chạy trên SQLite (pymysql.connect giả, trả Decimal / date như pymysql), rồi đối chiếu
với COUNT / SUM bằng SQL độc lập.
"""
import decimal
import importlib.util
import json
import os
import sqlite3
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("rag", ROOT / "api" / "rag" / "index.py")
rag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rag)
sys.path.insert(0, str(ROOT / "tests" / "chatbot_eval"))
import run_eval  # noqa: E402

db = json.loads(run_eval.DATA.read_text(encoding="utf-8"))
cases = json.loads(run_eval.CASES.read_text(encoding="utf-8"))
os.environ.pop("DATABASE_URL", None)
tx = rag.load_transactions(1)


def reply(rows, intent, flt):
    f = {"month": None, "category": None, "type": "expense", "keyword": None} | flt
    return "\n\n".join(p for p in rag.path_a(rows, intent, f) if p)


# 1. Mọi ca có kiểm lists / mentions: code ra đúng số, đủ dòng, không lẫn nội dung cấm
graded = []
for conv in cases["conversations"]:
    for turn in conv["turns"]:
        exp = [e for e in turn.get("expect", []) if e["check"] in ("lists", "mentions", "forbid")]
        flt = next((e.get("filter") or e["values"][0]["filter"] for e in exp if e["check"] in ("lists", "mentions")), None)
        if flt is None:
            continue
        intent = next(e["any"][0] for e in turn["expect"] if e["check"] == "intent")
        errs = run_eval.judge({"expect": exp}, {"reply": reply(tx, intent, flt), "meta": None}, db, 2026, False)
        assert not errs, f"ca {turn['id']}: {errs}"
        graded.append(turn["id"])
assert len(graded) == 13, graded  # goc 1-6, 8 + ca 10, 11, 12, 13, 17, 18

goc = {"month": "2026-10", "category": "entertainment"}
out = reply(tx, "finance_list", goc)  # judge đã kiểm đủ ngày + số tiền (21 dòng ở tệp mẫu, 19 ở dữ liệu thật lúc báo lỗi)
assert all(f"| {t['description']} |" in out for t in run_eval.pick(db, goc)), "mỗi dòng phải có ghi chú"
# so sánh mà LLM bỏ trống tháng → tháng này (ca 18 từng ra «mọi thời gian»)
empty = {"month": None, "category": None, "type": None, "keyword": None}
assert rag.resolve({"intent": "finance_compare", "filters": empty}, None, rag.user_categories(tx), date(2026, 10, 25))[1]["month"] == "2026-10"
# «Làm lại» sau lời phàn nàn (ca 8): code chạy lại lượt tài chính trước, 0 lần gọi LLM, chấm đủ mọi kiểm của ca
prev = {"intent": "finance_list", "filters": {"month": "2026-10", "category": "entertainment", "type": "expense", "keyword": None}}
res = rag.answer({"user_id": 1, "message": "Làm lại!", "state": prev, "today": "2026-10-25"})
case8 = next(t for c in cases["conversations"] for t in c["turns"] if t["id"] == "8")
assert res["meta"]["llm_calls"] == 0 and not run_eval.judge(case8, res, db, 2026, False), res["meta"]

# 2. Nhánh MySQL — dữ liệu cùng tệp mẫu + một giao dịch của người dùng khác (phải bị loại)
lite = sqlite3.connect(":memory:")
lite.execute("CREATE TABLE transactions (id TEXT, user_id INT, type TEXT, amount NUMERIC, category TEXT, date TEXT, description TEXT)")
lite.executemany("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?)",
                 [(t["id"], 1, t["type"], t["amount"], t["category"], t["date"], t.get("description")) for t in db["transactions"]]
                 + [("khac", 2, "expense", 999000, "entertainment", "2026-10-01", "người khác")])


class FakeConn:  # đủ cho `with conn, conn.cursor() as cur` + DictCursor của pymysql
    def __init__(self, **kw):
        assert kw["cursorclass"] is rag.pymysql.cursors.DictCursor and kw["database"] == "spendmind"
        FakeConn.kw = kw

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    cursor = __enter__

    def execute(self, sql, args):
        cur = lite.execute(sql.replace("%s", "?"), args)
        cols = [d[0] for d in cur.description]
        self.rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in self.rows:
            r["amount"], r["date"] = decimal.Decimal(str(r["amount"])), date.fromisoformat(r["date"])

    def fetchall(self):
        return self.rows


os.environ["DATABASE_URL"] = "mysql://u:p@db.example:4000/spendmind"
rag.pymysql.connect = FakeConn
my = rag.load_transactions(1)
assert len(my) == len(tx) and rag.user_categories(my) == rag.user_categories(tx)
for intent, flt in [("finance_list", goc), ("finance_aggregate", {"month": "2026-10"}), ("finance_search", {"keyword": "net"}),
                    ("finance_aggregate", {"month": "2026-09", "category": "transport"})]:
    assert reply(my, intent, flt) == reply(tx, intent, flt), flt
    where = " AND ".join(["user_id = 1", "type = 'expense'"] + [f"{k} = '{v}'" for k, v in flt.items() if k == "category"]
                         + [f"date LIKE '{v}%'" for k, v in flt.items() if k == "month"])
    if "keyword" not in flt:
        n, s = lite.execute(f"SELECT COUNT(*), SUM(amount) FROM transactions WHERE {where}").fetchone()
        assert f"SỐ GIAO DỊCH: {n} · TỔNG: {rag.vnd(s)}" in reply(my, intent, flt), (flt, n, s)
assert FakeConn.kw["host"] == "db.example" and FakeConn.kw["port"] == 4000 and FakeConn.kw["ssl"] is not None

# production có thể chỉ đặt DB_HOST / DB_USER / … như api/config/database.php, không có DATABASE_URL
os.environ.pop("DATABASE_URL")
os.environ |= {"DB_HOST": "db.example", "DB_USER": "u", "DB_PASS": "p", "DB_NAME": "spendmind"}
assert len(rag.load_transactions(1)) == len(tx)
assert (FakeConn.kw["port"], FakeConn.kw["user"], FakeConn.kw["password"], FakeConn.kw["ssl"] is not None) == (3306, "u", "p", True)
os.environ["DB_SSL"] = "false"
rag.load_transactions(1)
assert FakeConn.kw["ssl"] is None

print(f"test_path_a: đạt ({len(graded)} ca chấm bằng run_eval.judge, nhánh MySQL khớp COUNT/SUM của SQL)")
