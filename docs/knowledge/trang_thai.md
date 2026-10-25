# Trạng thái — chatbot RAG

Cập nhật: 2026-10-25. Thiết kế: `docs/knowledge/chatbot-rag-thiet-ke.md` (§7 là kế hoạch từng bước).

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
| 2. Khung FastAPI + PHP chuyển tiếp | ✅ Xong, đã lên production (commit 4d93427) | `/api/rag/healthz` 200; POST `/api/rag/chat` không chữ ký 401. Chưa bật: cần đặt `RAG_URL` + `RAG_INTERNAL_SECRET` trên Vercel |
| 3. Regex + viết lại câu hỏi + phân loại | ✅ Mã xong, đã lên production (commit d56885e, RAG vẫn tắt) · ⚠️ chưa chấm với model đã chốt | 21/21 đạt `--checks intent,rewritten,llm_calls,filters` nhưng bằng model thay thế (3.1/2.5-flash-lite hết hạn mức ngày) → chạy lại khi hồi; nhánh MySQL chưa chạy. Nhật ký CB.9 |
| 4. Đường A có cấu trúc + khối SỰ KIỆN | ✅ Mã xong, đã commit, chưa push (RAG vẫn tắt) · ⚠️ chưa chấm với model đã chốt · ⚠️ MySQL thật chưa chạy | `tests/rag/test_path_a.py` đạt (nhánh MySQL qua SQLite giả + COUNT/SUM SQL). HTTP 18/21 bằng `gemini-flash-lite-latest`; trượt 7, 14, 15 = Bước 5. `reply` hiện là SỰ KIỆN + bảng nguyên văn, LLM diễn đạt ở Bước 7. Nhật ký CB.10 |
| 5. Ý định sửa + thẻ xác nhận | ⬜ Bước tiếp theo | Ca 7 (hỏi lại khi phàn nàn), 14, 15 (`proposal`) |
| 6–8 | ⬜ Chưa làm | |

Chạy RAG ở máy: nhật ký CB.9 (cách chạy uvicorn); hạn mức Gemini hết thì thay `index.MODELS` trong script chạy (CB.4). Kiểm lại trên máy: PHP bản zip ở scratchpad phiên trước sẽ mất — tải lại theo nhật ký CB.7 (SHA256 ở đó).
§9 thiết kế: đã chốt hết (25/10). Lịch sử ở máy chủ → cần bảng lưu hội thoại theo `user_id`; nút «Xóa toàn bộ dữ liệu» phải xoá cả bảng này.
