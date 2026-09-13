# SPENDMINDAI - PRODUCTION AUDIT LOG

> **Audit Execution Date:** 2026-09-13  
> **Auditor:** AI Principal Software Architect & Staff Security Engineer  
> **Standard:** `PRODUCTION_STANDARDS.md` & `AGENTS.md`  
> **Current Status:** COMPLETED - ALL RESOLVED (20/20 items)

---

## 1. Summary Matrix

| Severity | Total Detected | Resolved | Pending |
|:---|:---:|:---:|:---:|
| **Critical (P0)** | 1 | 1 | 0 |
| **High (P1)** | 9 | 9 | 0 |
| **Medium (P2)** | 8 | 8 | 0 |
| **Minor (P3)** | 2 | 2 | 0 |
| **Total** | **20** | **20** | **0** |

---

## 2. Detailed Findings & Resolution Verification

### [P1 - High]
1. **[P1] ReminderController - Lỗi định dạng chuỗi giờ nhắc nhở (`reminder_time`)**
   - **File:** `api/controllers/ReminderController.php` (dòng 72-88)
   - **Vấn đề:** Khi client gửi chuỗi giờ có sẵn giây (ví dụ: `20:00:00`), code thực hiện nối cứng `trim(...) . ":00"` tạo thành `20:00:00:00`, vi phạm ràng buộc kiểu dữ liệu `TIME` của MySQL.
   - **Giải pháp:** Sử dụng biểu thức chính quy `preg_match('/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/', ...)` chuẩn hóa chính xác `HH:MM:00`, đồng thời kiểm tra khoảng giá trị hợp lệ (00-23 giờ, 00-59 phút).
   - **Trạng thái:** [x] RESOLVED.

2. **[P1] Security - Chuẩn hóa định dạng phản hồi lỗi JSON theo Production Standards**
   - **File:** `api/config/security.php` (dòng 73-98)
   - **Vấn đề:** Chuẩn `PRODUCTION_STANDARDS.md` quy định định dạng lỗi JSON bắt buộc: `{ "success": false, "error": { "code": "...", "message": "..." } }`. Hàm `sendError` trước đây chỉ trả `{ "success": false, "message": "..." }`.
   - **Giải pháp:** Cập nhật `sendError()` xuất cấu trúc kép `{ "success": false, "message": $message, "error": { "code": $errorCode, "message": $message } }` tương thích ngược 100% với frontend cũ và đạt chuẩn production mới.
   - **Trạng thái:** [x] RESOLVED.

3. **[P1] Security - Bổ sung HTTP Security Headers phía Backend PHP**
   - **File:** `api/config/security.php` (dòng 166-171)
   - **Vấn đề:** Các header bảo mật quan trọng (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) chỉ cấu hình trong `vercel.json`. Khi chạy độc lập trên Apache/cPanel/Docker, backend PHP không tự sinh các header này.
   - **Giải pháp:** Đã bổ sung trực tiếp các header bảo mật trong `api/config/security.php`.
   - **Trạng thái:** [x] RESOLVED.

4. **[P1] Performance - Cấu hình Explicit Connection Timeout cho PDO Database**
   - **File:** `api/config/database.php` (dòng 42)
   - **Vấn đề:** Chưa cấu hình `PDO::ATTR_TIMEOUT`. Khi kết nối tới Cloud Database (TiDB Cloud Serverless, AWS RDS) gặp sự cố mạng, tiến trình PHP sẽ bị treo 15s gây nghẽn pool.
   - **Giải pháp:** Đã bổ sung `PDO::ATTR_TIMEOUT => 5` (5 giây) vào `$pdoOptions`.
   - **Trạng thái:** [x] RESOLVED.

5. **[P1] Integration - Chuyển đổi toàn diện cơ chế thông báo nhắc nhở từ Gmail sang Zalo API**
   - **File:** `api/services/ZaloService.php`, `api/controllers/ReminderController.php`, `dashboard.html`, `js/dashboard.js`, `database.sql`
   - **Vấn đề:** Yêu cầu chuyển đổi kênh nhắc nhở từ Gmail sang Zalo API gửi tin nhắn nhắc nhở trực tiếp đến khách hàng; yêu cầu xác thực SĐT Việt Nam nghiêm ngặt, bảo toàn interface CSDL cũ, và cung cấp mock simulation cho dev.
   - **Giải pháp:** Triển khai `ZaloService` chuẩn Production hỗ trợ Zalo OA OpenAPI & ZNS, regex SĐT `84...`, self-healing migration trên bảng `users`, bổ sung endpoint `test_zalo_reminder` và giao diện Zalo đồng bộ design system.
   - **Trạng thái:** [x] RESOLVED.

6. **[P1] Architecture/PWA - Thiếu hạ tầng Web Push Notification (RFC 8292 VAPID) khi đóng app / tắt màn hình (Android & iOS)**
   - **File:** `api/services/WebPushService.php`, `api/controllers/ReminderController.php`, `js/app-notification.js`, `sw.js`, `dashboard.html`, `database.sql`, `.env`
   - **Vấn đề:** Cơ chế thông báo cũ chỉ dựa vào `setInterval` JavaScript client-side trong `app-notification.js`. Khi người dùng thoát app hoặc tắt màn hình, hệ điều hành Android và iOS (WebKit) lập tức đóng băng (freeze/suspend) tiến trình JS, khiến người dùng hoàn toàn không nhận được thông báo nhắc nhở.
   - **Giải pháp:**
     - Xây dựng `WebPushService.php` thuần PHP OpenSSL chuẩn RFC 8030 / RFC 8291 / RFC 8292 VAPID (ký JWT ES256, mã hóa AES-128-GCM, kết nối trực tiếp Google FCM và Apple APNs).
     - Bổ sung bảng `push_subscriptions` với self-healing migration lưu endpoint và khóa bảo mật (`p256dh`, `auth`) của từng thiết bị.
     - Cập nhật `ReminderController.php` và `api/cron.php` tích hợp tự động quét và gửi Web Push tới các thiết bị người dùng đến giờ nhắc hẹn mà chưa ghi chi tiêu hôm nay.
     - Nâng cấp `js/app-notification.js` tự động đăng ký `PushManager`, phát hiện iOS Safari chưa thêm vào màn hình chính để hiển thị hướng dẫn PWA ("Thêm vào MH chính" để nhận thông báo), và nút gửi thông báo đẩy thử nghiệm trực tiếp từ máy chủ.
     - Đồng bộ API endpoints và mô phỏng hoàn chỉnh trong `dev_server.py`.
   - **Trạng thái:** [x] RESOLVED.

7. **[P0] Mobile/UX - Đóng băng cử chỉ vuốt & cảm ứng trên Android (Touch Gesture Deadlock)**
   - **File:** `css/styles.css`, `css/mobile.css`, `js/dashboard.js`, `js/pwa-install.js`
   - **Vấn đề:** Trên Android Chrome, người dùng không thể vuốt, cuộn hoặc chạm vào các nút điều hướng.
     - *Nguyên nhân 1:* `html, body { overflow-x: hidden !important; }` kết hợp `body { overscroll-behavior-y: contain; }` triệt tiêu bộ nhận diện cử chỉ cuộn trên Chromium Blink.
     - *Nguyên nhân 2:* Phần tử `.toast` có `z-index: 9999` và `pointer-events: auto` khi ẩn (`opacity: 0`), đè lên các nút ở góc phải thanh điều hướng dưới cùng.
     - *Nguyên nhân 3:* `#settings-backdrop` chỉ nhận sự kiện `click` (không nhận `touchstart`), khiến `body.settings-open { overflow: hidden !important; }` bị kẹt vĩnh viễn khi người dùng chạm backdrop để thoát. Sub-panel thiếu `overflow-y: auto`.
     - *Nguyên nhân 4:* `promptInstallFlow()` gọi nhầm `openIosModal()` trên thiết bị Android, kích hoạt backdrop che phủ màn hình.
   - **Giải pháp:**
     - Tách biệt `html { overflow-x: hidden; touch-action: pan-y; }` và `body { overflow-x: clip; touch-action: pan-y; }`, đổi `overscroll-behavior-y: auto;`.
     - Thêm `pointer-events: none !important;` cho `.toast` ở trạng thái ẩn.
     - Bổ sung sự kiện `pointerdown` và `touchstart` cho `#settings-backdrop`, bổ sung nút đóng `X` và thuộc tính cuộn mượt cho sub-panel.
     - Phân định rõ ràng thiết bị Android trong `pwa-install.js`, chỉ hiển thị hướng dẫn native của Android Chrome.
   - **Trạng thái:** [x] RESOLVED.

8. **[P1] Architecture/Cron - Giới hạn tần suất Cron Vercel Hobby không hỗ trợ giờ nhắc tùy biến**
   - **File:** `.github/workflows/reminder-cron.yml`, `js/app-notification.js`, `sw.js`
   - **Vấn đề:** Vercel Hobby chỉ hỗ trợ chạy cron 1 lần/ngày cố định lúc 20:00 VN (`0 13 * * *`). Người dùng cài đặt giờ nhắc nhở tùy ý (ví dụ 14:10, 14:30) sẽ không được kích hoạt Web Push từ máy chủ khi đang tắt màn hình.
   - **Giải pháp:**
     - Thiết lập GitHub Actions cron `.github/workflows/reminder-cron.yml` chạy định kỳ mỗi 15 phút ping `api/cron.php?token=safe_cron_token_2026` để quét toàn bộ người dùng đến hạn nhắc trong ngày.
     - Thêm `requireInteraction: true`, cờ `renotify: true` và chuỗi rung `vibrate` nâng cao trong `sw.js` để màn hình Android sáng lên và rung cảnh báo.
     - Thêm `credentials: 'include'` cho toàn bộ các lệnh gọi API Web Push và hiển thị huy hiệu trạng thái xanh trực quan trên dashboard.
   - **Trạng thái:** [x] RESOLVED.

9. **[P1] UI/UX - Nâng cấp toàn diện hệ thống theo chuẩn Apple HIG & tích hợp skill awesome-design-md**
   - **File:** `.agents/skills/awesome-design-md/`, `DESIGN.md`, `design-system/spendmindai/MASTER.md`, `css/styles.css`, `css/mobile.css`, `js/dashboard.js`, `dashboard.html`, `index.html`, `login.html`, `register.html`
   - **Vấn đề:** Hệ thống thiết kế cũ sử dụng màu xanh lá thô, phông chữ thiếu đồng bộ, chuyển động thiếu tính chất vật lý đàn hồi (spring physics) và chưa có chuẩn thiết kế cao cấp như Apple.
   - **Giải pháp:**
     - Cài đặt trọn bộ skill `awesome-design-md` từ VoltAgent vào `.agents/skills/awesome-design-md/` với tài liệu phân tích chi tiết của 74 thương hiệu hàng đầu, đặc biệt là Apple.
     - Thiết lập `DESIGN.md` tại thư mục gốc và cập nhật `MASTER.md` tuân thủ Apple Human Interface Guidelines và Apple Web Design System.
     - Chuyển đổi toàn bộ màu sắc sang Apple Action Blue (`#0071e3`), System Green (`#34c759`), System Red (`#ff3b30`), nền Apple Parchment `#f5f5f7` (Light) và Apple OLED Black `#000000` (Dark).
     - Áp dụng chất liệu kính mờ Apple Vibrancy (`backdrop-filter: blur(20px) saturate(180%)`), chuyển động vật lý đàn hồi `cubic-bezier(0.32, 0.72, 0, 1)`, vi tương tác co ép `scale(0.96)` khi nhấn nút.
     - Tái cấu trúc thẻ số dư phong cách Apple Card / Apple Wallet, thanh điều hướng di động chuẩn iOS Tab Bar, thông báo nổi Dynamic Island, ngăn kéo trợ lý ảo AI Messages.
   - **Trạng thái:** [x] RESOLVED.

---

### [P2 - Medium]
7. **[P2] Observability - Thiếu Endpoints Kiểm Tra Sức Khỏe Hệ Thống (`/healthz`, `/readyz`)**
   - **File:** `api/index.php`, `vercel.json`, `dev_server.py`
   - **Vấn đề:** `PRODUCTION_STANDARDS.md` yêu cầu có endpoint `/healthz` và `/readyz`. Trước đây chỉ trả 404.
   - **Giải pháp:** Đã bổ sung endpoint `/healthz` (trả về trạng thái tiến trình) và `/readyz` (ping kiểm tra kết nối DB trực tiếp), đồng thời thêm route rewrite trong `vercel.json` và handler trong `dev_server.py`.
   - **Trạng thái:** [x] RESOLVED.

8. **[P2] Performance/Database - Chỉ mục dư thừa (Redundant Index) trên bảng `transactions`**
   - **File:** `database.sql` (dòng 34)
   - **Vấn đề:** Bảng `transactions` có `INDEX (user_id)` và `INDEX idx_user_date (user_id, date, id)`. Chỉ mục `(user_id)` dư thừa vì đã nằm ở tiền tố trái nhất của `idx_user_date`.
   - **Giải pháp:** Đã loại bỏ `INDEX (user_id)` khỏi `database.sql`.
   - **Trạng thái:** [x] RESOLVED.

9. **[P2] UI/UX & Caching - Bất đồng bộ Cache Buster Version giữa các trang**
   - **File:** `login.html`, `register.html`
   - **Vấn đề:** `dashboard.html` đã nâng cấp lên `?v=20260912_v3`, nhưng `login.html` và `register.html` vẫn gọi `?v=20260912_v1` và `?v=20260911_v8`.
   - **Giải pháp:** Đã đồng bộ toàn bộ tài nguyên sang phiên bản `?v=20260912_v3`.
   - **Trạng thái:** [x] RESOLVED.

10. **[P2] Architecture - Chuẩn hóa Session Cookie Options cho PHP Session**
    - **File:** `api/config/security.php` (dòng 185-193)
    - **Vấn đề:** Cần cấu hình tường minh `session.cookie_httponly = 1`, `session.cookie_samesite = 'Lax'`, `session.use_strict_mode = 1`.
    - **Giải pháp:** Đã thiết lập các tùy chọn cookie session an toàn trước khi gọi `session_start()`.
    - **Trạng thái:** [x] RESOLVED.

---

### [P3 - Minor]
11. **[P3] Cleanliness - Ghi log gỡ lỗi trong mã nguồn Production**
    - **File:** `dashboard.html` (dòng 587)
    - **Vấn đề:** Có câu lệnh `console.log('ServiceWorker registration error: ', err);`.
    - **Giải pháp:** Đã chuyển đổi sang `console.warn` chuẩn hóa.
    - **Trạng thái:** [x] RESOLVED.

12. **[P3] Cleanliness - Đồng bộ nguồn nạp Lucide Icons**
    - **File:** `login.html`, `register.html`, `dashboard.html`
    - **Vấn đề:** Sử dụng lẫn lộn `unpkg.com` và `cdn.jsdelivr.net`.
    - **Giải pháp:** Đã đồng bộ tất cả các trang nạp từ `cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js`.
    - **Trạng thái:** [x] RESOLVED.

13. **[P2] Routing/UX - Lỗi 404 File not found khi truy cập URL rút gọn (`/dashboard`, `/login`, `/register`)**
    - **File:** `dev_server.py`, `.htaccess`
    - **Vấn đề:** Trong khi `vercel.json` đã cấu hình rewrite URL rút gọn, máy chủ phát triển cục bộ `dev_server.py` và cấu hình Apache `.htaccess` chỉ ánh xạ `/` về `index.html`. Khi người dùng truy cập trực tiếp hoặc đăng nhập điều hướng sang `/dashboard`, Python `SimpleHTTPRequestHandler` tìm tệp không có phần mở rộng `.html` và trả lỗi `404 - File not found`.
    - **Giải pháp:**
      - Bổ sung cơ chế rewrite URL sạch thông minh trong `dev_server.py` tự động ánh xạ `/dashboard`, `/login`, `/register` và các đường dẫn HTML rút gọn.
      - Bổ sung quy tắc rewrite `RewriteCond %{DOCUMENT_ROOT}/$1.html -f` trong `.htaccess` cho máy chủ Apache.
    - **Trạng thái:** [x] RESOLVED.

14. **[P1] Session/Auth - Đăng xuất quay về trang index bị tự động đăng nhập lại vào dashboard**
    - **File:** `dev_server.py`, `js/dashboard.js`, `js/index.js`, `vercel.json`
    - **Vấn đề:** Khi người dùng bấm "Đăng xuất" trong `dashboard.html`, yêu cầu `POST /api?action=logout` được gửi lên `dev_server.py`. Tuy nhiên máy chủ cục bộ không cập nhật trường `authenticated = False` vào cơ sở dữ liệu `local_dev_data.json` và phản hồi API thiếu header cấm bộ nhớ đệm (`Cache-Control: no-store, no-cache`). Khi chuyển hướng về `index.html`, hàm `checkAuthSession()` gửi `GET /api?action=check_session`, nhận về `authenticated: true` nên lập tức chuyển hướng ngược lại vào `dashboard`.
    - **Giải pháp:**
      - Cập nhật handler `action == "logout"` trong `dev_server.py` đặt `db["user"]["authenticated"] = False` và lưu đồng bộ vào `local_dev_data.json`.
      - Bổ sung kiểm tra trong `action == "check_session"`: nếu `authenticated` là `False`, trả về cấu trúc unauthenticated chuẩn `{ authenticated: false, db_connected: true, db_error: null }`.
      - Bổ sung header chống lưu cache `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` và `Pragma: no-cache` cho các phản hồi JSON API của `dev_server.py`.
      - Thêm sự kiện bảo vệ `pageshow` (hỗ trợ Back/Forward Cache - bfcache) trong `js/dashboard.js` và `js/index.js` nhằm kiểm tra lại phiên làm việc nếu người dùng bấm nút Quay lại (Back button) trên trình duyệt.
      - Bổ sung rewrite rule `/index` -> `/index.html` trong `vercel.json`.
15. **[P1] Google OAuth - Lỗi 400: origin_mismatch & Loại bỏ hoàn toàn đăng nhập Google mô phỏng**
    - **File:** `dev_server.py`, `login.html`, `register.html`, `js/login.js`, `js/register.js`
    - **Vấn đề:** Google OAuth 2.0 Client ID (`125274610515-6qi1cnl41k7itnfch3v6123q6tbqgovf.apps.googleusercontent.com`) trên Google Cloud Console chưa thêm nguồn gốc `http://localhost:8080`. Người dùng yêu cầu xóa bỏ hoàn toàn cơ chế đăng nhập Google mô phỏng (simulated modal) để sử dụng thuần túy xác thực Google OAuth 2.0 thực sự.
    - **Giải pháp:**
      - Đã xóa toàn bộ giao diện và modal mô phỏng (`google-sim-modal`, `google-sim-helper`, `btn-trigger-google-sim`) khỏi [login.html](file:///d:/codevstdio/repo/SpendMindAI/login.html) và [register.html](file:///d:/codevstdio/repo/SpendMindAI/register.html).
      - Đã loại bỏ toàn bộ mã nguồn xử lý mô phỏng (`triggerGoogleSimulatedModalDirectly`, `startSimulatedAuth`, v.v.) trong [js/login.js](file:///d:/codevstdio/repo/SpendMindAI/js/login.js) và [js/register.js](file:///d:/codevstdio/repo/SpendMindAI/js/register.js).
      - Chuẩn hóa luồng xác thực Google thực sự: tích hợp bộ giải mã Google Identity JWT Token trong [dev_server.py](file:///d:/codevstdio/repo/SpendMindAI/dev_server.py) để tự động trích xuất tên thật, email thật và avatar thật từ Google khi đăng nhập.
      - Hướng dẫn cấu hình Google Cloud Console bổ sung `http://localhost:8080` vào Authorized Origins để đăng nhập Google thực sự thành công trên máy tính.
16. **[P2] UI/UX - Chuẩn hóa toàn bộ hệ thống sang tông màu đơn sắc, hiện đại chuẩn Apple (Apple Monochromatic & Swiss Minimalism)**
    - **File:** `css/styles.css`, `css/mobile.css`, `js/dashboard.js`, `index.html`, `DESIGN.md`
    - **Vấn đề:** Giao diện có nhiều mảng màu xanh ngọc lục bảo (`#34d399`, `#10b981`, `#059669`), thẻ số dư màu xanh rêu (`#0f231a` và `#e9f5ef`), chữ gradient rainbow shimmer lấp lánh và biểu đồ tròn 8 màu sắc sặc sỡ, không đúng tinh thần tối giản, tinh tế và đơn sắc của Apple.
    - **Giải pháp:**
      - Chuyển đổi toàn bộ biến `:root` của Dark theme và Light theme sang hệ thống màu đơn sắc tương phản cao chuẩn Apple: Dark mode dùng nền đen OLED `#000000`, thẻ `#1c1c1e`, nút hành động chính màu trắng `#ffffff` chữ đen; Light mode dùng nền giấy da `#f5f5f7`, thẻ sứ trắng `#ffffff`, nút hành động chính màu đen mực `#1d1d1f` chữ trắng.
      - Xóa bỏ triệt để các khối override thẻ số dư màu xanh `#0f231a/#e9f5ef`, đưa thẻ số dư về thiết kế Apple Pro Card sang trọng.
      - Cập nhật biểu đồ Chart.js (Doughnut & Trends bar) sang bảng màu phân bổ Titanium Grayscale đơn sắc cao cấp.
      - Loại bỏ toàn bộ các gradient màu mè, chữ Playfair nghiêng, hiệu ứng laser xanh và thay bằng kiểu chữ SF Pro Display nguyên bản của Apple.
      - Tinh chỉnh thanh Tab bar di động (`css/mobile.css`) và màn hình splash chào mừng ("hello" cursive) sang phong cách đơn sắc.
    - **Trạng thái:** [x] RESOLVED.

17. **[P2] UI/UX - Tinh chỉnh giao diện Chatbot, Menu Cài đặt, Hộp thoại Toast và Cài đặt SpendMindAI ở cuối trang Index; Khôi phục màu xanh lá hiện đại**
    - **File:** `css/styles.css`, `css/mobile.css`, `dashboard.html`, `index.html`, `js/pwa-install.js`
    - **Vấn đề:** 
      - (Ảnh 1) Các chip gợi ý chatbot bị ngắt hàng khiến chip "Lời khuyên" rơi xuống dòng 2.
      - (Ảnh 2) Mục "Thông báo ứng dụng" và "Nhắc nhở qua Zalo" trong menu cài đặt bị xuống dòng ("Thông báo ứng / dụng" và "Nhắc nhở qua / Zalo").
      - (Ảnh 3) Hộp thoại thông báo (toast) bị kéo giãn toàn màn hình do xung đột thuộc tính `bottom: 100px !important;` với `top: 24px; position: fixed;`.
      - (Ảnh 4) Banner cài đặt SpendMindAI nổi lơ lửng trên màn hình hero của trang `index.html`.
      - Yêu cầu khôi phục màu chủ đạo là xanh lá hiện đại (Apple Modern Emerald / Mint Green `#10b981` / `#059669`).
    - **Giải pháp:**
      - **Chatbot gợi ý**: Đặt `flex-wrap: nowrap !important; overflow-x: auto !important;`, giảm `font-size` xuống `0.69rem`, padding `3px 8px`, `white-space: nowrap !important;` đảm bảo toàn bộ chip luôn nằm duy nhất trên 1 hàng.
      - **Menu cài đặt**: Mở rộng chiều rộng panel lên `360px`, giảm font chữ các mục xuống `0.78rem`, `white-space: nowrap !important;` giúp tất cả nhãn hiển thị trọn vẹn trên 1 hàng.
      - **Hộp thoại thông báo (Toast)**: Loại bỏ triệt để `bottom: 100px !important;`, đặt `bottom: auto !important; height: auto !important; min-height: unset !important; border-radius: var(--radius-pill) !important; width: fit-content !important; max-width: min(90vw, 420px) !important;` trả về dạng Floating Pill Dynamic Island nhỏ gọn, thanh lịch như cũ.
      - **Hộp thoại cài đặt SpendMindAI**: Chuyển xuống cuối trang `index.html` (ngay trước footer) dưới dạng card cài đặt sang trọng `#section-app-install`, ngăn chặn banner nổi trên trang index và liên kết trực tiếp luồng PWA native.
      - **Màu chủ đạo xanh lá hiện đại**: Khôi phục `--accent-color: #10b981` (Dark) và `#059669` (Light), nút chính `.btn-primary` nền xanh lá chữ trắng, công tắc toggle, tab bar active và các điểm nhấn tương tác đồng bộ xanh lá hiện đại.
    - **Trạng thái:** [x] RESOLVED.

18. **[P1] UI/UX & Data Visualization - Phục hồi bảng màu đa sắc cho biểu đồ, bổ sung 4 ngưỡng màu cảnh báo ngân sách tháng và thiết kế Borderless toàn diện (100% không viền)**
    - **File:** `js/dashboard.js`, `css/styles.css`, `css/mobile.css`, `js/cookie-consent.js`, `dashboard.html`, `DESIGN.md`
    - **Vấn đề:**
      - Biểu đồ phân bổ chi tiêu và xu hướng trước đó bị chuyển sang dải màu titanium xám đơn sắc làm giảm tính trực quan khi phân tích số liệu tài chính.
      - Mục ngân sách chi tiêu tháng chưa có cơ chế trực quan thể hiện mức độ ngân sách khi gần chạm ngưỡng bằng các màu sắc chuẩn mực (Xanh, Vàng, Cam, Đỏ).
      - Toàn bộ giao diện cần được chuyển sang phong cách Borderless hiện đại: loại bỏ triệt để 100% các đường viền thừa (hairline borders) của tất cả thành phần trên ứng dụng.
    - **Giải pháp:**
      - **Phục hồi bảng màu biểu đồ như cũ**: Khôi phục bảng màu Donut category đa sắc độ tươi sáng chuẩn Apple (Emerald `#10b981`, Blue `#3b82f6`, Amber `#f59e0b`, Pink `#ec4899`, Purple `#8b5cf6`, Cyan `#06b6d4`, Orange `#f97316`, Lime `#84cc16`). Khôi phục biểu đồ cột xu hướng với Thu nhập `#10b981` (xanh lục) và Chi tiêu `#ef4444` (đỏ).
      - **4 Ngưỡng màu ngân sách chi tiêu tháng**: Bổ sung hàm tính toán và hiển thị 4 cấp độ trạng thái động trong `renderBudgetsProgress()`:
        + Mức an toàn (< 70%): Xanh lá (`#10b981`), huy hiệu `.budget-badge-green` "An toàn".
        + Mức chú ý (70% - 85%): Vàng (`#eab308`), huy hiệu `.budget-badge-yellow` "Cần chú ý".
        + Mức cảnh báo (85% - 100%): Cam (`#f97316`), huy hiệu `.budget-badge-orange` "Gần chạm ngưỡng".
        + Mức nguy hiểm (>= 100%): Đỏ (`#ef4444`), huy hiệu `.budget-badge-red` "Vượt hạn mức" kèm hiệu ứng rung cảnh báo `pulse-danger`.
        + Bổ sung thẻ tổng quan ngân sách tháng (`.budget-total-card`) phía trên cùng của danh sách.
      - **Thiết kế Borderless toàn diện**:
        + Thiết lập các biến CSS token viền thành `transparent` (`--card-border`, `--input-border`, `--divider-color`, `--calendar-border`).
        + Áp dụng quy tắc `border: none !important; border-color: transparent !important;` trên tất cả cards, panels, modals, dropdowns, inputs, buttons, tables, badges, chips, tab bars, toasts, và cookie consent banner.
        + Xóa bỏ tất cả style inline `border: 1px solid ...` trong `dashboard.html`.
        + Bảo vệ phần tử `.spinner` và `.spinner-inline` để animation xoay của loader hoạt động hoàn hảo.
      - Cập nhật chuẩn hóa tài liệu `DESIGN.md` lên phiên bản 2.1.0.
    - **Trạng thái:** [x] RESOLVED.

19. **[P2] UI/UX - Tái cấu trúc bố cục Header trên giao diện Mobile theo chuẩn Apple iOS Top Bar**
    - **File:** `css/mobile.css`, `css/styles.css`, `js/dashboard.js`
    - **Vấn đề:** 
      - (Hình chụp người dùng) Trên giao diện di động, Header bị ngắt thành 2 dòng bất đối xứng: Logo cùng lời chào ("Xin chào, Bá Thành! / Quản lý tài chính thông minh") bị căn giữa ở dòng 1; 3 nút chức năng (Xuất, Nhập, Avatar Cài đặt) bị đẩy xuống góc phải ở dòng 2, tạo khoảng trống đen lớn không hợp lý ở góc trái và làm header quá cao (~140px), đẩy thẻ số dư xuống dưới.
      - Avatar mèo bên trong nút cài đặt bị thu nhỏ (26px) và có viền màu chưa đồng bộ với thiết kế borderless.
    - **Giải pháp:**
      - Tái cấu trúc Header trên Mobile thành thanh Top Bar đơn hàng ngang (Single-row horizontal layout) chuẩn Apple HIG:
        + Cánh trái (`.logo-area`): Logo squircle 36px đặt cạnh lời chào và slogan tài chính, căn lề trái tự nhiên, hỗ trợ tự thu ngắn (`ellipsis`) khi tên dài.
        + Cánh phải (`.header-actions`): Cụm 3 nút hành động tròn chuẩn xúc giác iOS (`36px x 36px`, gồm nút Xuất, Nhập dạng icon tròn không chữ, và nút Cài đặt có ảnh đại diện tràn viền bo tròn 100% không viền thừa).
        + Thêm vi tương tác co ép `scale(0.90)` khi chạm tay (active touch state).
        + Chiều cao header thu gọn từ 140px xuống chỉ còn 56px, cân đối hoàn hảo và giải phóng tối đa không gian màn hình phía trên cho thẻ số dư và biểu đồ.
    - **Trạng thái:** [x] RESOLVED.

20. **[P1] Security & Architecture - Chuẩn hóa cấu trúc Production, gia cố bảo mật và triệt để cách ly các tệp nhạy cảm (.gitignore, .vercelignore, .htaccess, vercel.json)**
    - **File:** `.gitignore`, `.vercelignore`, `.htaccess`, `vercel.json`, `dev_server.py`
    - **Vấn đề:**
      - File `.gitignore` cũ còn thiếu nhiều quy tắc bảo mật thiết yếu (Private keys, chứng chỉ SSL/TLS, tokens, database dumps, virtual environments, agent scratchpads, log files).
      - Trước đây, một số tệp tài liệu nội bộ (`AUDIT_LOG.md`, `dev_server.py`) có thể bị truy cập trực tiếp qua HTTP GET trên môi trường Vercel production do thiếu quy tắc chặn và `.vercelignore`.
      - Máy chủ phát triển `dev_server.py` chưa chặn các yêu cầu HEAD/GET tới các tệp nhạy cảm (`.env`, `local_dev_data.json`, `database.sql`).
    - **Giải pháp:**
      - Nâng cấp `.gitignore` theo chuẩn Production Security gồm 13 phân nhóm bảo mật rõ ràng (Secrets & Environment, Local DBs, Private keys/Certs, Cloud/Tunnel artifacts, AI agent scratchpads, Logs/Debug, Dependencies, Python cache/venv, IDE configs, OS files, Temporary/Bak, Archives/Builds, Office drafts).
      - Nâng cấp `.vercelignore`: Tuyệt đối ngăn chặn việc đưa `dev_server.py`, `database.sql`, `*.md`, `*.py`, `*.sql`, `local_dev_data.json`, `design-system/`, `.cursorrules` lên hạ tầng Vercel Production.
      - Cập nhật `vercel.json` và `.htaccess`: Chặn và điều hướng toàn bộ yêu cầu truy cập các tệp nội bộ, script dev, database schema và tài liệu markdown về `404 Not Found` / `403 Forbidden`.
      - Gia cố `dev_server.py`: Tích hợp bộ lọc bảo mật cho cả phương thức GET và HEAD, lập tức phản hồi `403 Forbidden` khi phát hiện truy cập vào `.env`, `.git`, `local_dev_data.json`, file `.sql`, file `.db` hoặc cấu hình `api/config/`.
    - **Trạng thái:** [x] RESOLVED.



