#!/bin/bash

# ==========================================================================
# BASH SCRIPT TỰ ĐỘNG TRIỂN KHAI LEMP STACK CHO DỰ ÁN QUẢN LÝ CHI TIÊU
# Áp dụng cho: Ubuntu 20.04 / 22.04 / 24.04 LTS
# ==========================================================================

# Cấu hình biến môi trường (Hãy thay đổi trước khi chạy)
DOMAIN="huynhbathanh.site"                     # Tên miền của bạn
DB_NAME="quan_ly_chi_tieu"                    # Tên database
DB_USER="chi_tieu_user"                        # Tên user database
DB_PASS=$(openssl rand -base64 12)            # Mật khẩu ngẫu nhiên cho DB
PHP_VERSION="8.2"                              # Phiên bản PHP khuyến nghị

# Định dạng màu sắc output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Bắt đầu cài đặt LEMP Stack & Triển khai ứng dụng ===${NC}"

# 1. Cập nhật hệ thống
echo -e "${YELLOW}1. Đang cập nhật gói hệ thống...${NC}"
sudo apt update && sudo apt upgrade -y

# 2. Cài đặt các công cụ cơ bản
echo -e "${YELLOW}2. Cài đặt git, curl, zip, unzip...${NC}"
sudo apt install -y git curl zip unzip ufw

# 3. Cài đặt Nginx
echo -e "${YELLOW}3. Cài đặt Nginx Web Server...${NC}"
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# 4. Cài đặt PHP & PHP-FPM
echo -e "${YELLOW}4. Cài đặt PHP ${PHP_VERSION} và các phần mở rộng...${NC}"
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update
sudo apt install -y php${PHP_VERSION}-fpm php${PHP_VERSION}-mysql php${PHP_VERSION}-curl php${PHP_VERSION}-xml php${PHP_VERSION}-mbstring php${PHP_VERSION}-gd
sudo systemctl enable php${PHP_VERSION}-fpm
sudo systemctl start php${PHP_VERSION}-fpm

# 5. Cài đặt MySQL Server
echo -e "${YELLOW}5. Cài đặt MySQL Database Server...${NC}"
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql

# 6. Cấu hình Database & Cấp quyền
echo -e "${YELLOW}6. Đang khởi tạo Database và User bảo mật...${NC}"
sudo mysql -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';"
sudo mysql -e "ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';"
sudo mysql -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';"
sudo mysql -e "FLUSH PRIVILEGES;"

# 7. Thiết lập thư mục Web và sao chép mã nguồn
echo -e "${YELLOW}7. Tạo thư mục chứa mã nguồn tại /var/www/QuanLyChiTieu...${NC}"
sudo mkdir -p /var/www/QuanLyChiTieu

# [Ghi chú] Hướng dẫn người dùng đẩy code lên VPS:
# Trong script này, tạo một file cấu hình tạm thời, sau đó người dùng có thể tải code lên thư mục này.
# Copy mã nguồn hiện tại (nếu chạy trực tiếp từ VPS) hoặc clone từ git.

# 8. Cấu hình Nginx Virtual Host
echo -e "${YELLOW}8. Cấu hình Nginx cho tên miền ${DOMAIN}...${NC}"
NGINX_CONF="/etc/nginx/sites-available/quanlychitieu"

sudo bash -c "cat > ${NGINX_CONF}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    root /var/www/QuanLyChiTieu;
    index index.html index.php;

    charset utf-8;

    # Bảo mật: Không cho phép truy cập file ẩn .env, .git...
    location ~ /\.(?!well-known).* {
        deny all;
    }

    # Định tuyến cho Frontend HTML/JS/CSS
    location / {
        try_files \$uri \$uri/ =404;
    }

    # Cấu hình xử lý tệp tin PHP
    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php${PHP_VERSION}-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        include fastcgi_params;
    }

    # Cấu hình cache cho hình ảnh và font (Tối ưu hiệu năng)
    location ~* \.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Không cache CSS và JS để luôn tải phiên bản mới nhất
    location ~* \.(js|css)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        expires 0;
    }

    # Không cache các file HTML để tránh hiển thị nội dung cũ
    location ~* \.html$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        expires 0;
    }
}
EOF

# Kích hoạt cấu hình Nginx
sudo ln -sf ${NGINX_CONF} /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

if [ $? -eq 0 ]; then
    sudo systemctl restart nginx
    echo -e "${GREEN}Cấu hình Nginx thành công và đã khởi động lại Server!${NC}"
else
    echo -e "${RED}Lỗi cấu hình Nginx, vui lòng kiểm tra lại.${NC}"
    exit 1
fi

# 9. Cấu hình Firewall (UFW)
echo -e "${YELLOW}9. Cấu hình Firewall (Mở cổng SSH, HTTP, HTTPS)...${NC}"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# 10. Tạo file mẫu kết nối DB vào api.php (Để người dùng chỉ cần upload code là chạy được)
echo -e "${YELLOW}10. Tạo chỉ dẫn cấu hình DB...${NC}"
echo -e "${GREEN}Database đã được tạo thành công!${NC}"
echo -e "Thông tin kết nối của bạn:"
echo -e "  - Host: ${YELLOW}127.0.0.1${NC}"
echo -e "  - Database Name: ${YELLOW}${DB_NAME}${NC}"
echo -e "  - Database User: ${YELLOW}${DB_USER}${NC}"
echo -e "  - Database Password: ${YELLOW}${DB_PASS}${NC}"
echo -e ""
echo -e "${YELLOW}Mật khẩu này đã được lưu ngẫu nhiên để đảm bảo bảo mật.${NC}"

# Lưu cấu hình DB ra một file riêng để tiện quản lý sau này
sudo bash -c "cat > /var/www/QuanLyChiTieu/db_credentials.txt" <<EOF
==================================================
THÔNG TIN CẤU HÌNH DATABASE DỰ ÁN QUẢN LÝ CHI TIÊU
==================================================
Host: 127.0.0.1
Database Name: ${DB_NAME}
Database User: ${DB_USER}
Database Password: ${DB_PASS}
==================================================
EOF

# 11. Đề xuất cài đặt SSL (HTTPS) bằng Let's Encrypt
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}CÀI ĐẶT THÀNH CÔNG LEMP STACK!${NC}"
echo -e "Bây giờ bạn hãy làm theo các bước sau:"
echo -e "1. Tải toàn bộ mã nguồn của dự án vào thư mục: ${YELLOW}/var/www/QuanLyChiTieu/${NC}"
echo -e "2. Sửa thông số kết nối Database trong file ${YELLOW}api.php${NC} khớp với mật khẩu trên."
echo -e "3. Cấp quyền truy cập cho Nginx: ${YELLOW}sudo chown -R www-data:www-data /var/www/QuanLyChiTieu/${NC}"
echo -e "4. Để cài đặt SSL miễn phí (HTTPS), hãy chạy lệnh:"
echo -e "   ${YELLOW}sudo apt install certbot python3-certbot-nginx -y${NC}"
echo -e "   ${YELLOW}sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}${NC}"
echo -e "${GREEN}==================================================${NC}"
