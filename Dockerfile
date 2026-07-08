# Sử dụng PHP 8.2 kết hợp Apache Web Server làm Base Image
FROM php:8.2-apache

# Cài đặt extension pdo_mysql cho kết nối database MySQL/MariaDB
RUN docker-php-ext-install pdo_mysql

# Kích hoạt module rewrite của Apache (Hữu ích khi cần cấu hình SEO/URL đẹp sau này)
RUN a2enmod rewrite

# Copy mã nguồn vào thư mục root của Apache
COPY . /var/www/html/

# Phân quyền cho thư mục chứa code
RUN chown -R www-data:www-data /var/www/html
