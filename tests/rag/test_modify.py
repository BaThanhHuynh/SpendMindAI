"""Bước 5 — ý định sửa dữ liệu + lời phàn nàn của api/rag/index.py (§3.5), thay LLM bằng đầu ra mẫu.
Chạy: .venv/Scripts/python -X utf8 tests/rag/test_modify.py
"""
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("rag", ROOT / "api" / "rag" / "index.py")
rag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rag)
sys.path.insert(0, str(ROOT / "tests" / "chatbot_eval"))
import run_eval  # noqa: E402

for k in ("DATABASE_URL", "MYSQL_URL", "DB_HOST"):
    os.environ.pop(k, None)
db = json.loads(run_eval.DATA.read_text(encoding="utf-8"))
turns = {t["id"]: t for c in json.loads(run_eval.CASES.read_text(encoding="utf-8"))["conversations"] for t in c["turns"]}
before = hashlib.sha256(run_eval.DATA.read_bytes()).digest()
goc = {"intent": "finance_list", "filters": {"month": "2026-10", "category": "entertainment", "type": "expense", "keyword": None}}


def ask(say, intent, prev=None, action=None, new_category=None, rewritten=None, **flt):
    out = {"intent": intent, "action": action, "new_category": new_category, "rewritten": rewritten or say, "clarify": None,
           "filters": {"month": "2026-10", "category": None, "type": None, "keyword": None} | flt}
    rag.understand = lambda prompt: (out, 1)
    return rag.answer({"user_id": 1, "message": say, "state": prev, "today": "2026-10-25"})


def judged(case, res):
    errs = run_eval.judge(turns[case], res, db, 2026, False)
    assert not errs, (case, errs, res["reply"][:200])
    return res


# ca 14: LLM ghi nhầm danh mục mới vào bộ lọc — code vẫn tìm đúng giao dịch theo ghi chú, đề xuất food + type
res = judged("14", ask("Chuyển giao dịch ún monster sang ăn uống", "modify_data", action="update", new_category="Ăn uống",
                       category="Ăn uống", keyword="ún monster"))
assert res["proposal"]["changes"] == {"category": "food", "type": "expense"} and res["proposal"]["tx"]["description"] == "ún monster"
assert "Giải trí sang Ăn uống?" in res["reply"]
# ca 15: xoá — chỉ đề xuất
judged("15", ask("Xoá giao dịch Net", "modify_data", action="delete", keyword="net"))
# ca 7: phàn nàn có danh mục đúng → hỏi lại, không đề xuất, không đoán giao dịch
res = judged("7", ask("Nó là ăn uống không phải giải trí", "complaint", goc, new_category="food"))
assert res["proposal"] is None and res["state"] is goc
# ca 6: phàn nàn «thiếu» không nêu danh mục → liệt kê lại lượt trước
judged("6", ask("Bạn liệt kê chi tôi là 19 giao dịch đây mới có 2 Thiếu 17 giao dịch nữa", "complaint", goc,
                rewritten="Liệt kê đầy đủ giao dịch mục Giải trí tháng 10/2026"))
# nhiều giao dịch khớp → hỏi lại kèm bảng, không đề xuất; không khớp / thiếu danh mục mới → hỏi lại
res = ask("Xoá giao dịch cf", "modify_data", action="delete", keyword="cf")
assert res["proposal"] is None and res["reply"].startswith("Có ") and "| Ngày |" in res["reply"]
assert ask("Xoá giao dịch du thuyền", "modify_data", action="delete", keyword="du thuyền")["proposal"] is None
assert ask("Chuyển giao dịch net", "modify_data", action="update", keyword="net")["proposal"] is None
assert hashlib.sha256(run_eval.DATA.read_bytes()).digest() == before, "chatbot không được ghi dữ liệu"
print("test_modify: đạt")
