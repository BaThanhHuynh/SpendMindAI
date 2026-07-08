# HƯỚNG DẪN TRIỂN KHAI DỰ ÁN LÊN CLOUD VPS (UBUNTU LEMP STACK)

Thư mục này chứa các tệp tin cấu hình và kịch bản giúp bạn triển khai nhanh chóng dự án **Quản Lý Chi Tiêu** lên máy chủ ảo VPS chạy hệ điều hành Ubuntu (20.04 / 22.04 / 24.04 LTS).

---

## Các tệp tin trong thư mục:
1.  `deploy.sh`: Script tự động cài đặt hệ thống (Nginx, PHP 8.2-FPM, MySQL Server), tạo cơ sở dữ liệu và phân quyền.
2.  `nginx.conf`: Tệp cấu hình máy chủ ảo Nginx tối ưu hóa bảo mật và hiệu năng để chạy dự án.

---

## Các bước triển khai thực tế trên VPS:

### Bước 1: Kết nối vào VPS của bạn qua SSH
Mở Terminal (trên Mac/Linux) hoặc PowerShell/CMD (trên Windows) và gõ:
```bash
ssh root@<IP_VPS_CỦA_BẠN>
```

### Bước 2: Tải thư mục cấu hình này lên VPS
Bạn có thể copy file `deploy.sh` lên VPS, hoặc tạo tệp mới trực tiếp trên VPS và dán nội dung vào:
```bash
nano deploy.sh
```
*(Dán nội dung tệp `deploy.sh` vào và lưu lại bằng tổ hợp `Ctrl + O` -> `Enter` -> `Ctrl + X`)*

### Bước 3: Cấp quyền chạy và thực thi script
1.  Mở quyền thực thi cho script:
    ```bash
    chmod +x deploy.sh
    ```
2.  Mở tệp và kiểm tra biến `DOMAIN` ở dòng 9 (đã được cấu hình sẵn là `huynhbathanh.site`).
3.  Chạy script cài đặt:
    ```bash
    ./deploy.sh
    ```

**Lưu ý:** Script sẽ tự động sinh mật khẩu ngẫu nhiên cho Database để tăng tính bảo mật và in ra màn hình khi hoàn thành. Hãy lưu lại mật khẩu này!

### Bước 4: Tải mã nguồn dự án lên VPS
Nén mã nguồn local của bạn (loại trừ thư mục `vps_deployment` và file `.exe`) thành tệp `QuanLyChiTieu.zip`. Tải tệp này lên thư mục `/var/www/` trên VPS (sử dụng FileZilla, SCP hoặc cPanel File Manager).
Sau đó giải nén trên VPS:
```bash
cd /var/www/
unzip QuanLyChiTieu.zip -d QuanLyChiTieu
```

### Bước 5: Cập nhật thông tin Database trong code
Mở file `/var/www/QuanLyChiTieu/api.php` trên VPS và cấu hình các thông số kết nối Database:
```php
$host = "127.0.0.1";
$username = "chi_tieu_user";
$password = "MẬT_KHẨU_TỰ_ĐỘNG_SINH_Ở_BƯỚC_3";
$dbname = "quan_ly_chi_tieu";
```

### Bước 6: Phân quyền và Thiết lập SSL (HTTPS) bảo mật
1.  Cấp quyền cho Nginx đọc ghi file (rất quan trọng để chạy session và ghi file log email):
    ```bash
    sudo chown -R www-data:www-data /var/www/QuanLyChiTieu
    ```
2.  Cài đặt SSL miễn phí (HTTPS) bằng Certbot Let's Encrypt:
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    sudo certbot --nginx -d huynhbathanh.site -d www.huynhbathanh.site
    ```

Chúc mừng! Dự án của bạn bây giờ đã chạy trực tiếp trên Internet với giao diện bảo mật HTTPS!
