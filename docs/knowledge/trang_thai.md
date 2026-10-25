# Trạng thái — chatbot RAG

Cập nhật: 2026-10-25. Thiết kế: `docs/knowledge/chatbot-rag-thiet-ke.md` (§7 là kế hoạch từng bước).

Đã chốt với người dùng: **phương án B** (FastAPI trên Vercel, PHP làm cửa xác thực) · **Gemini Embedding API** ·
LLM chính `gemini-3.1-flash-lite` (dự phòng `gemini-2.5-flash-lite`).

| Bước | Tình trạng | Ghi chú |
|---|---|---|
| 0. Bộ kiểm thử hồi quy | ✅ Xong | `tests/chatbot_eval/` — target `oracle` / `old` / `php` / http |
| 1. Chữa cháy trong PHP | ✅ Mã xong · ⚠️ chưa chấm được hành vi LLM | Khoá Gemini hết hạn mức (429) lúc làm → chạy lại `--target php --only goc` khi hạn mức hồi |
| 2. Khung FastAPI + PHP chuyển tiếp | ✅ Xong, đã lên production (commit 4d93427) | `/api/rag/healthz` 200; POST `/api/rag/chat` không chữ ký 401. Chưa bật: cần đặt `RAG_URL` + `RAG_INTERNAL_SECRET` trên Vercel |
| 3. Regex + viết lại câu hỏi + phân loại | ⬜ Bước tiếp theo | |
| 4–8 | ⬜ Chưa làm | |

Kiểm lại trên máy: PHP bản zip ở scratchpad phiên trước sẽ mất — tải lại theo nhật ký CB.7 (SHA256 ở đó).
Còn ngỏ ở §9 thiết kế: sửa dữ liệu qua chat có nút xác nhận hay không; lịch sử giữ ở trình duyệt hay máy chủ.
