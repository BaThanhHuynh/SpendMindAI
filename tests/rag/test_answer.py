"""Bước 7 — LLM diễn đạt SỰ KIỆN + chốt kiểm số của api/rag/index.py (§3.6), thay Gemini bằng đầu ra mẫu.
Chạy: .venv/Scripts/python -X utf8 tests/rag/test_answer.py
"""
import importlib.util
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("rag", ROOT / "api" / "rag" / "index.py")
rag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rag)
for k in ("DATABASE_URL", "MYSQL_URL", "DB_HOST"):
    os.environ.pop(k, None)
tx, budgets = rag.load_user(1)
f = {"month": "2026-10", "category": "entertainment", "type": "expense", "keyword": None}
facts, table = rag.path_a(tx, "finance_list", f)

# tín hiệu do code tính: Giải trí 10/2026 tăng mạnh so với 09 và có nhiều khoản nhỏ; chi > thu chỉ khi không lọc danh mục
sig = rag.signals(tx, budgets, "2026-10", "entertainment")
assert any("TĂNG" in s for s in sig) and any("giao dịch nhỏ" in s for s in sig) and not any("CHI > THU" in s for s in sig), sig
assert any("CHI > THU" in s for s in rag.signals(tx, budgets, "2026-10", None))
assert any("VƯỢT NGÂN SÁCH" in s for s in rag.signals(tx, {"entertainment": 500000}, "2026-10", "entertainment"))


def say(text):
    rag.gemini = lambda *a, **k: {"answer": text}
    return rag.phrase("m", "Liệt kê giao dịch Giải trí tháng 10/2026", facts, sig, {21, 936000}, time.monotonic() + 12)


good = "Tháng 10/2026 bạn có **21** giao dịch Giải trí, tổng **936.000đ**. Nên gom bớt các khoản cà phê nhỏ."
assert say(good) == (good, 1)
for bad in ["Bạn có 21 giao dịch, tổng 921.000đ.",                    # số không có trong SỰ KIỆN
            "Bạn có 21 giao dịch Giải trí trong tháng.",              # thiếu tổng bắt buộc
            "Có 21 giao dịch, tổng 936.000đ, lớn nhất ngày 12/10.",   # nêu ngày cụ thể (bảng đã có)
            "Đã cập nhật: 21 giao dịch, tổng 936.000đ.",              # nhận đã sửa dữ liệu
            ""]:
    text, calls = say(bad)
    assert text.startswith(facts) and "Đáng chú ý:" in text and calls == 1, bad
tried = []
rag.gemini = lambda model, *a: tried.append(model) or (_ for _ in ()).throw(TimeoutError())
assert rag.phrase("m", "q", facts, [], set(), time.monotonic() + 12)[0].startswith(facts)
assert tried == ["m", *[m for m, _ in rag.MODELS]], "lỗi → thử lần lượt model dự phòng"
assert rag.phrase("m", "q", facts, [], set(), time.monotonic() + 1)[1] == 0, "hết giờ → không gọi LLM"

# answer(): LLM viết câu, code gắn bảng; advice dùng tín hiệu tháng này; out_of_scope không gọi LLM viết câu
rag.understand = lambda p: ({"intent": "finance_list", "rewritten": "q", "clarify": None, "action": None, "new_category": None,
                             "filters": {"month": "2026-10", "category": "Giải trí", "type": None, "keyword": None}}, 1)
rag.gemini = lambda *a, **k: {"answer": good}
res = rag.answer({"user_id": 1, "message": "Giải trí tháng 10 chi gì", "state": None, "today": "2026-10-25"})
assert res["reply"] == good + "\n\n" + table and res["meta"]["llm_calls"] == 2
rag.understand = lambda p: ({"intent": "advice", "rewritten": "q", "clarify": None, "action": None, "new_category": None,
                             "filters": {"month": None, "category": None, "type": None, "keyword": None}}, 1)
seen = []
rag.gemini = lambda model, timeout, prompt, *a: seen.append(prompt) or {"answer": "Giảm cà phê để tiết kiệm."}
assert rag.answer({"user_id": 1, "message": "Làm sao tiết kiệm hơn", "state": None, "today": "2026-10-25"})["reply"] == "Giảm cà phê để tiết kiệm."
assert "THEO DANH MỤC:" in seen[0] and "CHI > THU" in seen[0], seen
rag.understand = lambda p: ({"intent": "out_of_scope", "rewritten": "q", "clarify": None, "action": None, "new_category": None,
                             "filters": {"month": None, "category": None, "type": None, "keyword": None}}, 1)
res = rag.answer({"user_id": 1, "message": "Thời tiết hôm nay", "state": None, "today": "2026-10-25"})
assert res["meta"]["llm_calls"] == 1 and not any(c.isdigit() for c in res["reply"])
print("test_answer: đạt")
