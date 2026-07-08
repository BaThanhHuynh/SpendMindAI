# SpendMindAI - Quản Lý Tài Chính Cá Nhân Thông Minh Tích Hợp Gemini AI

SpendMindAI là ứng dụng web quản lý tài chính cá nhân toàn diện được xây dựng trên mô hình tối giản nhưng tối ưu hiệu năng: **Backend PHP thuần (hướng module)** kết hợp **Database MySQL** và **Frontend HTML/CSS/JavaScript thuần** không qua framework cồng kềnh. Dự án nổi bật với giao diện Glassmorphism hiện đại và trợ lý ảo thông minh sử dụng API **Google Gemini 3.1 Flash-Lite** giúp tương tác và tư vấn tài chính trực quan.

---

## Các Tính Năng Nổi Bật

*   **Dashboard Trực Quan & Hiện Đại**:
    *   Trực quan hóa thu nhập và chi tiêu qua biểu đồ Xu hướng (Trend chart) và biểu đồ Cơ cấu (Donut chart).
    *   Tự động tính toán tổng số dư khả dụng thực tế của tháng hiện tại.
    *   Tự động lọc dữ liệu và tiến trình ngân sách theo tháng được lựa chọn.
*   **Trợ Lý AI Tài Chính Cáp Cao (Gemini API)**:
    *   Tích hợp trực tiếp mô hình **Gemini 3.1 Flash-Lite** thế hệ mới.
    *   Cơ chế gọi API trực tiếp từ trình duyệt của người dùng (Client-side API call) thông qua việc tải API key an toàn từ backend khi đã đăng nhập.
    *   Bypass hoàn toàn giới hạn địa lý (Geographic/Datacenter block) của VPS nước ngoài.
    *   Giao diện Gemini-style tối giản, chuyên nghiệp với màn hình khởi đầu thân thiện và định dạng highlight thông tin tài chính quan trọng.
*   **Quản Lý Hạn Mức Ngân Sách (Budgets)**:
    *   Đặt hạn mức chi tiêu hàng tháng cho từng danh mục riêng biệt.
    *   Thanh tiến trình trực quan chuyển màu cảnh báo tự động khi tiếp cận hoặc vượt ngưỡng chi tiêu.
*   **Đăng Nhập Đa Người Dùng & Google Sign-in**:
    *   Hệ thống đăng ký, đăng nhập bảo mật bằng cơ chế Session và mật khẩu mã hóa Bcrypt.
    *   Hỗ trợ liên kết tài khoản Google Sign-in để đăng nhập nhanh chóng.
*   **Gửi Email Nhắc Nhở Nhập Liệu Tự Động**:
    *   Hệ thống gửi mail nhắc nhở nhập liệu tự động theo khung giờ cài đặt riêng của từng người dùng.
    *   Sử dụng kết nối SMTP qua Socket TCP thuần bằng PHP, độc lập hoàn toàn không dùng thư viện ngoài.
*   **Giao Diện Hỗ Trợ Đa Chế Độ (Light/Dark Mode)**: Giao diện Glassmorphism sang trọng, mượt mà, hỗ trợ chuyển đổi giao diện sáng tối nhanh chóng.

---

## Công Nghệ Sử Dụng

*   **Backend**: PHP 8.x (Hướng cấu trúc Module sạch sẽ), tương tác cơ sở dữ liệu qua PDO an toàn khỏi SQL Injection.
*   **Database**: MySQL / MariaDB (Hỗ trợ cơ chế tự động cài đặt database và tự tạo bảng tự động khi chạy lần đầu).
*   **Frontend**: HTML5, CSS3 (Glassmorphic variables), JavaScript thuần (ES6+, Fetch API, Chart.js).
*   **AI Integration**: Google Gemini API (`gemini-3.1-flash-lite`).
*   **Môi trường chạy**: Apache/Nginx, Docker (tùy chọn), hoặc LEMP Stack trên VPS Ubuntu.

---

## Cấu Trúc Thư Mục Dự Án

```text
QuanLyChiTieu/
├── css/
│   └── styles.css              # File CSS chứa toàn bộ kiểu dáng giao diện Glassmorphism và Responsive
├── images/                     # Ảnh mockup và logo chính thức của ứng dụng (logoapp.png)
├── includes/                   # Các tệp xử lý backend PHP hướng module
│   ├── auth_handlers.php       # Xử lý đăng ký, đăng nhập, liên kết Google OAuth
│   ├── budget_handlers.php     # Xử lý thiết lập hạn mức ngân sách
│   ├── config.php              # Nạp biến môi trường (.env), thiết lập PDO và tự động tạo bảng (migration)
│   ├── mailer.php              # Bộ gửi mail SMTP qua Socket thuần không phụ thuộc thư viện ngoài
│   ├── reminder_handlers.php   # Xử lý kiểm tra và gửi mail nhắc nhở
│   ├── reminder_helper.php     # Các hàm phụ trợ kiểm tra giờ giấc nhắc nhở
│   └── transaction_handlers.php# Xử lý CRUD giao dịch thu chi và thống kê số liệu
├── js/                         # Logic điều khiển Frontend bằng Javascript thuần
│   ├── chatbot.js              # Tương tác giao diện chatbot và truy vấn trực tiếp đến Google Gemini API
│   ├── dashboard.js            # Quản lý giao dịch, hạn mức, biểu đồ thống kê và thiết lập trên Dashboard
│   ├── index.js                # Logic hiệu ứng Landing page và tự động định tuyến
│   ├── login.js                # Logic đăng nhập tài khoản và tích hợp Google Login SDK
│   └── register.js             # Logic đăng ký tài khoản mới
├── vps_deployment/             # Kịch bản cấu hình cấu trúc tự động lên VPS Ubuntu
│   ├── deploy.sh               # Bash script tự động cấu hình LEMP Stack & SSL Let's Encrypt
│   └── nginx.conf              # File cấu hình Nginx tối ưu hóa bảo mật và nén gzip cho dự án
├── .env                        # Chứa các biến môi trường cấu hình DB, SMTP, Gemini API (Không commit!)
├── .env.example                # File cấu hình mẫu cho các biến môi trường
├── .gitignore                  # Chỉ định các file/thư mục nhạy cảm cần tránh đưa lên Git
├── api.php                     # Cổng API duy nhất chuyển tiếp yêu cầu (Single entry point router)
├── cron.php                    # Cron-job kiểm tra chạy ngầm định kỳ gửi email nhắc nhở người dùng
├── dashboard.html              # Giao diện Bảng điều khiển chính
├── database.sql                # Script cấu trúc database dự phòng
├── index.html                  # Trang giới thiệu ứng dụng (Landing Page)
├── login.html                  # Giao diện Đăng nhập tài khoản
├── register.html               # Giao diện Đăng ký tài khoản
└── watch_deploy.py             # Script chạy ngầm local tự động deploy lên VPS khi lưu file (Ctrl+S)
```

---

## Hướng Dẫn Cài Đặt Chi Tiết (Local XAMPP)

### 1. Chuẩn Bị Môi Trường
*   Tải và cài đặt [XAMPP](https://www.apachefriends.org) (Yêu cầu PHP phiên bản 8.0 trở lên và MySQL).
*   Khởi chạy dịch vụ **Apache** và **MySQL** trên cửa sổ quản lý XAMPP Control Panel.

### 2. Copy Thư Mục Mã Nguồn
Di chuyển thư mục `QuanLyChiTieu` vào bên trong thư mục Web Root của XAMPP:
```text
C:\xampp\htdocs\QuanLyChiTieu
```

### 3. Cấu Hình Biến Môi Trường (.env)
1.  Nhân bản tệp `.env.example` thành `.env` nằm tại thư mục gốc của dự án.
2.  Mở `.env` bằng trình soạn thảo và điền các cấu hình của bạn:
    ```env
    # Cấu hình Database
    DB_HOST=127.0.0.1
    DB_NAME=quan_ly_chi_tieu
    DB_USER=root
    DB_PASS=

    # Cấu hình SMTP để gửi mail nhắc nhở
    SMTP_ENABLED=true
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=465
    SMTP_USER=email_cua_ban@gmail.com
    SMTP_PASS=mat_khau_ung_dung_gmail

    # Khóa Google Gemini API
    GEMINI_API_KEY=khoa_api_gemini_cua_ban
    ```
    > *Lưu ý*: `SMTP_PASS` phải là mật khẩu ứng dụng (App Password) được tạo từ tài khoản Google (sau khi bật xác thực 2 lớp), không phải mật khẩu đăng nhập tài khoản Gmail thông thường.

### 4. Khởi Chạy Ứng Dụng
Truy cập đường dẫn sau trên trình duyệt để sử dụng ứng dụng:
```text
http://localhost/QuanLyChiTieu/index.html
```
*Lưu ý*: Mọi cấu trúc bảng và cơ sở dữ liệu sẽ **tự động khởi tạo** khi frontend thực hiện lệnh gọi API đầu tiên vào `api.php`. Bạn không bắt buộc phải import file `database.sql` bằng tay.

### 5. Tự Động Đồng Bộ Lên VPS Khi Lưu File (Auto-Deploy Watcher)
Dự án được tích hợp sẵn một script watcher chạy ngầm gọn nhẹ ở local. Khi bạn tự chỉnh sửa code ở máy tính, để tự động đóng gói và deploy ngay lập tức lên VPS live mà không cần gõ lệnh thủ công:
1. Mở Terminal tại thư mục gốc của dự án.
2. Chạy lệnh:
   ```powershell
   python watch_deploy.py
   ```
Mỗi khi bạn bấm lưu file (`Ctrl + S`), tệp script sẽ tự động phát hiện, debouncing trì hoãn 0.5 giây để tránh xung đột ghi, rồi tự động gọi `deploy_vps.py` để đồng bộ lên live.

---

## Hướng Dẫn Triển Khai Lên VPS Ubuntu (Nginx)

Dự án cung cấp sẵn tệp kịch bản triển khai tự động trong thư mục `vps_deployment`.

1.  Đưa mã nguồn của dự án lên VPS (Thư mục `/var/www/QuanLyChiTieu`).
2.  Cấp quyền thực thi và chạy file cấu hình server tự động:
    ```bash
    chmod +x vps_deployment/deploy.sh
    sudo ./vps_deployment/deploy.sh
    ```
    *Kịch bản này sẽ tự động:*
    *   Cài đặt Apache/Nginx, PHP 8.2-FPM, MySQL Server.
    *   Tự động cấu hình Nginx block theo file `/vps_deployment/nginx.conf`.
    *   Tạo tài khoản database riêng biệt có mật khẩu ngẫu nhiên độ bảo mật cao.
    *   Tự động cài đặt chứng chỉ SSL Let's Encrypt miễn phí (`HTTPS`) cho tên miền của bạn.

---

## Bảo Mật & Lưu Ý Quan Trọng

*   **Không Commit Tệp `.env`**: Tệp `.env` chứa mật khẩu database, thông tin đăng nhập SMTP và khóa API Gemini của bạn. Hãy đảm bảo tệp này đã nằm trong danh sách `.gitignore` (mặc định đã được thiết lập).
*   **Tránh Hardcode Thông Tin Nhạy Cảm**: Mọi giá trị cấu hình nên được đọc thông qua `getenv()` từ `.env` để bảo mật tối đa mã nguồn.
*   **Vấn Đề Vùng Địa Lý API Gemini**: Bằng cách lưu API Key trên `.env` và trả về thông qua endpoint an toàn của hệ thống khi người dùng đã đăng nhập thành công, chatbot sẽ thực hiện truy vấn trực tiếp từ trình duyệt (Client IP). Điều này giúp ứng dụng không bị ảnh hưởng bởi lỗi chặn IP từ các trung tâm dữ liệu VPS nước ngoài (như Azure, AWS...).

---

## Bản Quyền

Dự án được xây dựng và phát triển bởi **Huỳnh Bá Thành**. Bản quyền thuộc về tác giả. Nghiêm cấm mọi hành vi sao chép không xin phép phục vụ mục đích thương mại.
