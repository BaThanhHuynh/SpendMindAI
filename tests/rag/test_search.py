"""Bước 6 — tìm theo ghi chú bằng multilingual-e5-small int8 chạy tại chỗ (§3.4, §5).
Tái lập số đo đã dùng để chọn ngưỡng SIM: 16 câu hỏi có nhãn trên ghi chú thật của local_dev_data.json.
Chạy: .venv/Scripts/python -X utf8 tests/rag/test_search.py
"""
import hashlib
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

blob = b"".join(p.read_bytes() for p in sorted(rag.MODEL_DIR.glob("model_int8.onnx.part*")))
assert hashlib.sha256(blob).hexdigest() == "4d24e2bc01a447951524466ef533e52944bf48509e6552810bcee1a2711cb02c", "mô hình ghép sai"
t0 = time.perf_counter()
rag.e5()
load = time.perf_counter() - t0
tx, _ = rag.load_user(1)
t0 = time.perf_counter()
rag.vectors(tx)
batch = time.perf_counter() - t0

# từ khoá như LLM trích → mọi ghi chú phải tìm ra; hai câu cuối không được khớp gì
Q = {"nước tăng lực": {"ún monster"}, "chơi game": {"Net"}, "xem phim": {"coi phim"},
     "cà phê": {"Cf", "Cà phê", "cf", "cà phê", "Cafe _ gửi đồ"}, "karaoke": {"Kara nhậu"}, "bánh sinh nhật": {"Bánh kem"},
     "gửi xe máy": {"Gửi xe", "gửi xe"}, "taxi": {"Grab", "Grab ra bến xe", "Grab đi, về"}, "đổ xăng": {"Xăng", "xăng"},
     "đi chợ": {"Chợ", "Chợ chìu", "chợ", "Đi chợ", "Đi chợ maxidi", "2 hộp.cơm trắng + tiền chợ + bạc xỉu hehe"},
     "phở": {"Phở", "Cơm gà phở"}, "trà sữa": {"Trà sữa", "Trà tc"}, "cắt tóc": {"Cắt tóc", "Hớt tóc"},
     "trả nợ": {"Trả Thịnh", "Trả nợ"}, "du thuyền": set(), "máy bay": set()}
desc = lambda t: (t.get("description") or "").strip()  # noqa: E731
vec = rag.vectors(tx)
tp = fp = fn = 0
r5 = []
for q, want in Q.items():
    got = {desc(t) for t in rag.search(tx, q)}
    tp, fp, fn = tp + len(got & want), fp + len(got - want), fn + len(want - got)
    if want:
        best = {}
        for t in tx:
            best[desc(t)] = max(best.get(desc(t), -1), float(vec[t["id"]] @ rag.query_vector(q)))
        top5 = set(sorted(best, key=best.get, reverse=True)[:5])
        r5.append(len(top5 & want) / min(5, len(want)))
print(f"nạp mô hình {load:.2f}s · nhúng {len(tx)} dòng {batch:.2f}s · khớp đúng {tp}, khớp sai {fp}, sót {fn} · "
      f"recall@5 {sum(r5) / len(r5):.2f}")
assert fp == 0 and tp >= 20 and sum(r5) / len(r5) >= 0.75, (tp, fp, r5)  # số đo khi chọn SIM: 20 đúng, 0 sai, recall@5 0,76

# thêm / sửa / xoá một giao dịch rồi hỏi lại → kết quả đổi đúng (vector theo hash nội dung)
new = {"id": "test-phim", "type": "expense", "amount": 120000, "category": "entertainment", "date": "2026-10-25",
       "description": "Vé xem phim CGV"}
assert "Vé xem phim CGV" in {desc(t) for t in rag.search(tx + [new], "xem phim")}
edited = [t | {"description": "Bún bò"} if desc(t) == "coi phim" else t for t in tx]
assert not {desc(t) for t in rag.search(edited, "xem phim")}
assert not rag.search([t for t in tx if desc(t) != "coi phim"], "xem phim")
print("test_search: đạt")
