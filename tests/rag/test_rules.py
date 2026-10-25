"""Bước 3 — tự kiểm phần code của api/rag/index.py (không gọi LLM).  Chạy: .venv/Scripts/python -X utf8 tests/rag/test_rules.py"""
import importlib.util
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location("rag", Path(__file__).resolve().parents[2] / "api" / "rag" / "index.py")
rag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rag)

# Lớp 0 — 20 câu: 10 phải khớp, 10 không được khớp (§3.2)
HIT = ["Xin chào", "chào bạn!", "Hello", "alo bot ơi", "Cảm ơn", "cam on ban nhieu", "Thanks!", "Tạm biệt nhé", "bye",
       "Bạn là ai?"]
MISS = ["Chào, tháng 10 tôi chi bao nhiêu", "cảm ơn, tháng 9 bao nhiêu", "Tháng 10 tôi chi bao nhiêu", "Làm lại",
        "Chi tiết cho tôi", "hi, liệt kê giải trí", "tạm biệt tiền net", "Bạn là ai mà biết chi tiêu của tôi",
        "thank you, xoá giao dịch net", "Chào chi tiêu tháng này"]
bad = [s for s in HIT if not rag.smalltalk(s)] + [s for s in MISS if rag.smalltalk(s)]
assert not bad, f"regex sai: {bad}"
assert not any(c.isdigit() for _, reply in rag.SMALLTALK for c in reply), "câu mẫu không được có số"

# Code kiểm lại đầu ra LLM (§3.3)
today = date(2026, 10, 25)
cats = {"food": "expense", "entertainment": "expense", "salary": "income", "Cắt tóc": "expense"}
assert rag.match_category("Giải trí", cats) == rag.match_category("giai tri", cats) == "entertainment"
assert rag.match_category("cat toc", cats) == "Cắt tóc"
assert rag.match_category("du thuyền", cats) is None
assert rag.fix_month("2026-10", today) == "2026-10"
assert rag.fix_month("2026-12", today) == "2025-12", "tháng ở tương lai → năm trước"
assert rag.fix_month("2026-13", today) is None and rag.fix_month("tháng 10", today) is None

prev = {"intent": "finance_list", "filters": {"month": "2026-10", "category": "entertainment", "type": "expense", "keyword": None}}
empty = {"month": None, "category": None, "type": None, "keyword": None}
# «Làm lại»: LLM để trống bộ lọc → code thừa kế đủ từ state
intent, f, clarify, state = rag.resolve({"intent": "finance_list", "filters": empty}, prev, cats, today)
assert f == prev["filters"] | {"type": "expense"} and state == {"intent": "finance_list", "filters": f} and clarify is None
# complaint không ghi đè state → lượt sau vẫn thừa kế bộ lọc trước lời phàn nàn
_, _, _, state = rag.resolve({"intent": "complaint", "filters": empty | {"category": "food"}}, prev, cats, today)
assert state is prev
# danh mục bịa → bỏ, hỏi lại; tháng tương lai → lùi năm; loại theo danh mục
_, f, clarify, _ = rag.resolve({"intent": "finance_aggregate", "filters": empty | {"category": "du thuyền", "month": "2026-11"}},
                               None, cats, today)
assert f["category"] is None and clarify and f["month"] == "2025-11"
_, f, _, _ = rag.resolve({"intent": "finance_aggregate", "filters": empty | {"category": "Lương", "type": "expense"}}, None, cats, today)
assert f["type"] == "income"
# state giả mạo từ trình duyệt không lọt qua
_, f, _, _ = rag.resolve({"intent": "finance_list", "filters": empty},
                         {"filters": {"category": "khong-co", "month": ["x"]}}, cats, today)
assert f["category"] is None and f["month"] is None
assert rag.resolve({"intent": "hack", "filters": empty}, None, cats, today)[0] == "unclear"
print("test_rules: đạt")
