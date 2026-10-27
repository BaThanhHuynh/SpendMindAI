# CHỈ MỤC `nhat_ky/` — mã mục nằm ở tệp nào

> Sinh tự động bởi `python ~/.claude/harness/harness.py chi-muc nhat_ky` lúc 2026-10-27T16:20:31. **Đừng sửa tay.**
> Cách tra: tìm mã ở bảng dưới rồi mở đúng tệp đó. Cần nguyên văn thì `grep -n "### <mã>" <tệp>`.
> Bảng chỉ nói mục nào ở đâu. **Nội dung và số liệu ở tệp gốc — đừng chép sang đây.**

**18 mã mục trong 2 tệp.**

| Mã | Tệp | Dòng | Tiêu đề |
| --- | --- | ---: | --- |
| `CB.1` | [`2026-10-25.md`](2026-10-25.md) | 3 | Phân tích lỗi chatbot + thiết kế RAG (chưa triển khai) |
| `CB.2` | [`2026-10-25.md`](2026-10-25.md) | 13 | `python -I` bỏ qua `PYTHONIOENCODING` → UnicodeEncodeError cp1252 |
| `CB.3` | [`2026-10-25.md`](2026-10-25.md) | 19 | Bước 0: bộ kiểm thử hồi quy chatbot |
| `CB.4` | [`2026-10-25.md`](2026-10-25.md) | 26 | Gemini miễn phí trả 429 sau ~10 lần gọi `gemini-2.5-flash-lite` |
| `CB.5` | [`2026-10-25.md`](2026-10-25.md) | 43 | `preview_start spendmind-dev` báo cổng 8082 nhưng máy chủ không chạy |
| `CB.6` | [`2026-10-25.md`](2026-10-25.md) | 48 | Vá JSON có dấu `\` bằng script Python trong heredoc làm mất một dấu `\` |
| `CB.7` | [`2026-10-25.md`](2026-10-25.md) | 53 | Bước 1 (chữa cháy PHP) + Bước 2 (khung FastAPI) |
| `CB.8` | [`2026-10-25.md`](2026-10-25.md) | 65 | PHP zip cho Windows: thiếu chứng chỉ gốc và báo `curl_close()` lỗi thời |
| `CB.9` | [`2026-10-25.md`](2026-10-25.md) | 71 | Bước 3: regex xã giao + một lần gọi LLM viết lại / phân loại + code kiểm lại bộ lọc |
| `CB.10` | [`2026-10-25.md`](2026-10-25.md) | 88 | Bước 4: Đường A có cấu trúc + khối SỰ KIỆN + bảng do code dựng |
| `CB.11` | [`2026-10-27.md`](2026-10-27.md) | 3 | Bước 5: ý định sửa / xoá + thẻ xác nhận (commit c4bcbad) |
| `CB.12` | [`2026-10-27.md`](2026-10-27.md) | 15 | Bước 7: LLM diễn đạt SỰ KIỆN, code kiểm từng con số (commit 7216efa) |
| `CB.13` | [`2026-10-27.md`](2026-10-27.md) | 23 | Bước 6: nhúng tại chỗ e5-small + chốt chặn cho model đã chốt (commit b77d471) |
| `CB.14` | [`2026-10-27.md`](2026-10-27.md) | 44 | Bật RAG trên production (27/10) |
| `CB.15` | [`2026-10-27.md`](2026-10-27.md) | 55 | Sự cố: mọi `/api` (PHP) trả 500 từ b77d471 (27/10, ~35 phút gián đoạn) |
| `CB.16` | [`2026-10-27.md`](2026-10-27.md) | 73 | Thêm model dự phòng thứ hai + ngân sách thời gian chung (27/10) |
| `CB.17` | [`2026-10-27.md`](2026-10-27.md) | 79 | Demo trên dashboard thật + lỗi thừa kế bộ lọc (27/10, commit 496354a) |
| `UI.1` | [`2026-10-27.md`](2026-10-27.md) | 93 | Nảy lò xo kiểu Apple cho mọi phần tử bấm được (27/10) |
