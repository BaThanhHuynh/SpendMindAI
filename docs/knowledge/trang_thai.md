# Trạng thái — chatbot RAG

Cập nhật: 2026-10-27. Thiết kế: `docs/knowledge/chatbot-rag-thiet-ke.md` (§7 là kế hoạch từng bước).

Đã chốt với người dùng: **phương án B** (FastAPI trên Vercel, PHP làm cửa xác thực) · nhúng **tại chỗ
`multilingual-e5-small`** (đổi từ Gemini Embedding API, 25/10) · LLM chính `gemini-3.1-flash-lite` (dự phòng
`gemini-2.5-flash-lite`) · **sửa giao dịch qua chat: cho phép, luôn qua nút xác nhận** (thiết kế §3.5) ·
**lịch sử hội thoại lưu ở máy chủ**.

Ràng buộc của e5-small trên Vercel (gói Python tối đa 500 MB): chạy bằng ONNX Runtime + `tokenizers`, bản lượng
tử hoá int8 (~120 MB; bản fp32 ~470 MB sẽ vượt trần), không dùng torch / sentence-transformers. Tiền tố `query: ` /
`passage: `. Vector giao dịch lưu ở CSDL, RAM chỉ là bộ đệm; mỗi câu hỏi chỉ nhúng chính câu hỏi. **Phải đo khởi
động nguội** khi thêm mô hình — chậm quá thì quay về Gemini Embedding hoặc phương án C.

| Bước | Tình trạng | Ghi chú |
|---|---|---|
| 0. Bộ kiểm thử hồi quy | ✅ Xong | `tests/chatbot_eval/` — target `oracle` / `old` / `php` / http |
| 1. Chữa cháy trong PHP | ✅ Mã xong · ⚠️ chưa chấm được hành vi LLM | Khoá Gemini hết hạn mức (429) lúc làm → chạy lại `--target php --only goc` khi hạn mức hồi |
| 2. Khung FastAPI + PHP chuyển tiếp | ✅ Xong, đã lên production (commit 4d93427) | `/api/rag/healthz` 200; POST `/api/rag/chat` không chữ ký 401. Đã bật 27/10 (bước 8) |
| 3. Regex + viết lại câu hỏi + phân loại | ✅ Mã xong, đã lên production (commit d56885e, RAG vẫn tắt) · ⚠️ chưa chấm với model đã chốt | 21/21 đạt `--checks intent,rewritten,llm_calls,filters` nhưng bằng model thay thế (3.1/2.5-flash-lite hết hạn mức ngày) → chạy lại khi hồi; nhánh MySQL chưa chạy. Nhật ký CB.9 |
| 4. Đường A có cấu trúc + khối SỰ KIỆN | ✅ Xong, đã push (35fdf82, 346c44f) | `tests/rag/test_path_a.py`; RAG đọc CSDL bằng đúng biến của `database.php`. Nhật ký CB.10 |
| 5. Ý định sửa + thẻ xác nhận | ✅ Xong, đã push (c4bcbad) | `test_modify.py`; thẻ kiểm trên dashboard thật (Edge headless). CB.11 |
| 6. Nhúng e5-small tại chỗ + tìm theo ghi chú | ✅ Mã xong, đã push (b77d471) · ⚠️ chưa đo khởi động nguội trên Vercel | `test_search.py`: ngưỡng 0,89 → 20 đúng / 0 sai, recall@5 0,76. CB.13 |
| 7. LLM viết câu + gợi ý + kiểm số | ✅ Xong, đã push (7216efa, b77d471) | `test_answer.py`. HTTP với **model đã chốt** 21/21 (27/10). CB.12, CB.13 |
| 8. Bật RAG + chạy bộ kiểm thử trên production | 🟡 Đã bật, production chạy a1cafd6+ (Bước 5–7 + vector) | 27/10 01:52: 2 câu hỏi thật qua app → PHP 200 → RAG 200; 01:53: 2 câu → 502 vì Gemini (3.1 quá tải/quá giờ, 2.5 hết hạn mức ngày — CB.4). Chưa: xác nhận bảng `transaction_embeddings` đã tạo (RAG không ghi log); đo p95. Sự cố 500 đã sửa (CB.15). Tắt RAG = xoá `RAG_URL` rồi redeploy |

Chạy RAG ở máy: nhật ký CB.9 (cách chạy uvicorn); hạn mức Gemini hết thì thay `index.MODELS` trong script chạy (CB.4). Kiểm lại trên máy: PHP bản zip ở scratchpad phiên trước sẽ mất — tải lại theo nhật ký CB.7 (SHA256 ở đó).
§9 thiết kế: đã chốt hết (25/10). **Chưa làm:** lịch sử ở máy chủ → cần bảng lưu hội thoại theo `user_id`; nút «Xóa toàn bộ dữ liệu» phải xoá cả bảng này.
