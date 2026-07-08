# BÁO CÁO ĐỒ ÁN MÔN HỌC
## Triển khai Hệ thống Website trên Nền tảng Điện toán Đám mây (Cloud Computing https://huynhbathanh.site/ )

**Sinh viên thực hiện:** Huỳnh Bá Thành  
**Ngày 05 tháng 07 năm 2026**

### Tóm tắt nội dung
Báo cáo này trình bày chi tiết quá trình thiết kế, cấu hình và triển khai một ứng dụng web quản lý tài chính cá nhân hoàn chỉnh (**SpendMindAI**) lên hạ tầng điện toán đám mây Microsoft Azure và môi trường ảo hóa container Docker. Dự án sử dụng mô hình kiến trúc chuẩn doanh nghiệp bao gồm việc khởi tạo máy ảo Azure Virtual Machine, cài đặt Web Server Nginx làm Reverse Proxy, cấu hình hệ quản trị cơ sở dữ liệu MySQL Server trực tiếp trên VPS. Đồng thời, dự án áp dụng mô hình **DevOps và Container hóa (Docker & Docker Compose)** để chuẩn hóa môi trường phát triển cục bộ, tích hợp Cloudflare Tunnel để chia sẻ bản demo nhanh không cần mở cổng tường lửa. Hệ thống tích hợp chứng chỉ bảo mật mã hóa SSL/HTTPS tự động thông qua Let’s Encrypt (Certbot) và thiết lập cơ chế kiểm soát chi phí (Azure Billing Alert) an toàn tuyệt đối trong ngưỡng Free Tier.

---

## Mục lục

1. [Tổng Quan Đề Tài và Mục Tiêu Đặt Ra](#1-tổng-quan-đề-tài-và-mục-tiêu-đặt-ra)
   - 1.1 [Đặt Vấn Đề](#11-đặt-vấn-đề)
   - 1.2 [Mục Tiêu Dự Án](#12-mục-tiêu-dự-án)
   - 1.3 [Tiêu Chí Lựa Chọn Công Nghệ và Định Hướng Đề Tài](#13-tiêu-chí-lựa-chọn-công-nghệ-và-định-hướng-đề-tài)
2. [Kiến Trúc Hệ Thống Đề Xuất](#2-kiến-trúc-hệ-thống-đề-xuất)
   - 2.1 [Thiết Kế Đa Container Với Docker Compose (Local Dev)](#21-thiết-kế-đa-container-với-docker-compose-local-dev)
   - 2.2 [Định Hướng Phát Triển Ứng Dụng](#22-định-hướng-phát-triển-ứng-dụng)
3. [Hướng Dẫn Khởi Tạo Hạ Tầng Trên Azure Cloud](#3-hướng-dẫn-khởi-tạo-hạ-tầng-trên-azure-cloud)
   - 3.1 [Quy trình khởi tạo Máy ảo (Azure Virtual Machine)](#31-quy-trình-khởi-tạo-máy-ảo-azure-virtual-machine)
   - 3.2 [Cấu hình Tường lửa Hệ thống (Network Settings & Security Group)](#32-cấu-hình-tường-lửa-hệ-thống-network-settings--security-group)
   - 3.3 [Cấu hình Bộ nhớ Lưu trữ (Configure Storage)](#33-cấu-hình-bộ-nhớ-lưu-trữ-configure-storage)
4. [Quy Trình Cài Đặt Môi Trường Máy Chủ (Server Setup)](#4-quy-trình-cài-đặt-môi-trường-máy-chủ-server-setup)
   - 4.1 [Cập Nhật Hệ Thống và Cài Đặt Máy Chủ Web Nginx](#41-cập-nhật-hệ-thống-và-cài-đặt-máy-chủ-web-nginx)
   - 4.2 [Cài Đặt Hệ Quản Trị Cơ Sở Dữ Liệu MySQL Server](#42-cài-đặt-hệ-quản-trị-cơ-sở-dữ-liệu-mysql-server)
   - 4.3 [Cài Đặt Môi Trường Thực Thi Ứng Dụng (Runtime Engine Environments)](#43-cài-đặt-môi-trường-thực-thi-ứng-dụng-runtime-engine-environments)
   - 4.4 [Thiết Lập Cơ Sở Dữ Liệu Ban Đầu (Database Initialization)](#44-thiết-lập-cơ-sở-dữ-liệu-ban-đầu-database-initialization)
5. [Quy Trình DevOps và Triển Khai Mã Nguồn (DevOps & Deploy Source Code)](#5-quy-trình-devops-và-triển-khai-mã-nguồn-devops--deploy-source-code)
   - 5.1 [DevOps Cục Bộ: Khởi Chạy Container và Cloudflare Tunnel Tự Động](#51-devops-cục-bộ-khởi-chạy-container-và-cloudflare-tunnel-tự-động)
   - 5.2 [DevOps Đám Mây: Triển Khai Tự Động Lên Azure VM Qua Python Deploy Engine](#52-devops-đám-mây-triển-khai-tự-động-lên-azure-vm-qua-python-deploy-engine)
   - 5.3 [Cấu Hình Khóa và Khởi Tạo Biến Môi Trường (.env)](#53-cấu-hình-khóa-và-khởi-tạo-biến-môi-trường-env)
   - 5.4 [Di Cư Dữ Liệu và Phân Quyền Cho Web Server](#54-di-cư-dữ-liệu-và-phân-quyền-cho-web-server)
6. [Cấu Hinh Khối Điều Phối Nginx (Virtual Host)](#6-cấu-hinh-khối-điều-phối-nginx-virtual-host)
7. [Cấu Hinh Chứng Chỉ Bảo Mật HTTPS Với Let’s Encrypt](#7-cấu-hinh-chứng-chỉ-bảo-mật-https-với-lets-encrypt)
   - 7.1 [Cấu hình Tên miền trên Nginx](#71-cấu-hình-tên-miền-trên-nginx)
   - 7.2 [Cài Đặt Công Cụ Certbot và Xin Cấp Phát Chứng Chỉ SSL](#72-cài-đặt-công-cụ-certbot-và-xin-cấp-phát-chứng-chỉ-ssl)
   - 7.3 [Cập Nhật Biến Môi Trường Ứng Dụng](#73-cập-nhật-biến-môi-trường-ứng-dụng)
   - 7.4 [Kiểm tra tính năng tự động gia hạn (Automated Renewal Check)](#74-kiểm-tra-tính-năng-tự-động-gia-hạn-automated-renewal-check)
8. [Cấu Hinh Quản Lý Chi Phí Hạ Tầng (Azure Billing Alert)](#8-cấu-hinh-quản-lý-chi-phí-hạ-tầng-azure-billing-alert)
   - 8.1 [Quy trình thiết lập hệ thống cảnh báo tự động gửi về Email](#81-quy-trình-thiết-lập-hệ-thống-cảnh-báo-tự-động-gửi-về-email)
9. [Kết Luận và Hướng Phát Triển Đề Tài](#9-kết-luận-và-hướng-phát-triển-đề-tài)
   - 9.1 [Kết Quả Đạt Được](#91-kết-quả-đạt-được)
   - 9.2 [Hướng Phát Triển Tiếp Theo](#92-hướng-phát-triển-tiếp-theo)

---

## 1 Tổng Quan Đề Tài và Mục Tiêu Đặt Ra

### 1.1 Đặt Vấn Đề
Trong kỷ nguyên số, việc chuyển dịch hệ thống công nghệ thông tin từ hạ tầng vật lý truyền thống (On-premise) sang nền tảng Điện toán đám mây (Cloud Computing) đã trở thành một xu hướng tất yếu. Đối với sinh viên công nghệ thông tin, việc nắm vững quy trình deploy và cấu hình hệ thống ứng dụng thực tế trên Cloud là kỹ năng cốt lõi. Đề tài **"Triển khai Website trên Cloud Computing"** được lựa chọn nhằm hiện thực hóa các lý thuyết về quản trị mạng, hạ tầng ứng dụng và an toàn thông tin hệ thống, áp dụng trực tiếp cho dự án quản lý tài chính cá nhân **SpendMindAI** tại tên miền **huynhbathanh.site**.

### 1.2 Mục Tiêu Dự Án
Dự án hướng tới việc hoàn thành các mục tiêu công nghệ cụ thể sau:
*   **Xây dựng website hoàn chỉnh**: Triển khai ứng dụng quản lý chi tiêu cá nhân trực quan và hỗ trợ AI, hoạt động ổn định và tin cậy.
*   **Áp dụng ảo hóa Container**: Chuẩn hóa môi trường phát triển bằng Docker để loại bỏ lỗi bất đồng nhất giữa môi trường cục bộ (local) và máy chủ đám mây.
*   **Tự động hóa vận hành (DevOps)**: Xây dựng các script tự động hóa khởi chạy ứng dụng cục bộ, chia sẻ liên kết demo thời gian thực và đẩy mã nguồn tự động lên đám mây VPS.
*   **Deploy lên hạ tầng Cloud Computing**: Sử dụng dịch vụ máy ảo của nhà cung cấp Microsoft Azure nằm trong gói tài nguyên hỗ trợ học tập và phát triển.
*   **Định danh tên miền riêng (Domain)**: Liên kết địa chỉ IP tĩnh của máy ảo Azure (`52.184.77.236`) với tên miền định danh duy nhất `huynhbathanh.site`.
*   **Bảo mật lớp truyền tải (HTTPS)**: Cấu hình giao thức mã hóa dữ liệu truyền thông SSL/TLS giữa client và server thông qua Let's Encrypt.
*   **Cảnh báo quản lý chi phí**: Đảm bảo toàn bộ tài nguyên ảo hóa hoạt động an toàn tuyệt đối trong ngưỡng Free Tier và cảnh báo ngay lập tức qua email nếu phát sinh chi phí ngoài ý muốn.

### 1.3 Tiêu Chí Lựa Chọn Công Nghệ và Định Hướng Đề Tài
Dự án được định hướng cấu trúc để đảm bảo các tiêu chí thực tế cho một đồ án mẫu mực:
*   **Dễ dàng chạy Demo**: Giao diện dashboard trực quan, cập nhật biểu đồ và tương tác phản hồi thời gian thực.
*   **Dễ dàng viết báo cáo học thuật**: Cấu trúc phân tầng rõ rệt từ lớp Hạ tầng (IaaS - Azure Virtual Machine) đến lớp ảo hóa container (Docker) và lớp ứng dụng phần mềm (SaaS).
*   **Đúng tính chất Cloud Computing**: Khai thác tài nguyên ảo hóa, hệ thống lưu trữ đàn hồi (Elastic) và kiểm soát phân quyền lưu lượng tường lửa (Security Group).
*   **Độ khó phù hợp**: Tập trung hoàn thiện quy trình DevOps thực tế (đóng gói, truyền tải mã nguồn, tự động hóa cập nhật, cấu hình Reverse Proxy, bảo mật máy chủ).

---

## 2 Kiến Trúc Hệ Thống Đề Xuất

Hệ thống được thiết kế theo mô hình phân tầng tiêu chuẩn để bảo đảm tính mở rộng và khả năng an toàn thông tin lớp mạng. Luồng tương tác của dữ liệu được mô tả chi tiết qua sơ đồ sau:

```
[ User / Client ]
       │
       ▼ (Yêu cầu qua Web Browser)
[ Internet ]
       │
       ▼ (Phân giải tên miền DNS)
[ Domain (huynhbathanh.site) ]
       │
       ▼ (Cổng 80 / 443)
[ Cloud VM (Azure Virtual Machine) ] <───> [ Security Group Rule / Tường lửa NSG ]
       │
       ▼ (Reverse Proxy)
[ Nginx Web Server ]
       │
       ▼ (FastCGI Processing Engine)
[ Web Application (PHP-FPM) ]
       │
  ┌────┴────────────────────────┐
  ▼                             ▼
[ MySQL Database ]        [ API Services (Gemini AI, Gmail SMTP) ]
```

### 2.1 Thiết Kế Đa Container Với Docker Compose (Local Dev)
Để chuẩn hóa quy trình phát triển và demo bất đồng bộ trên máy cá nhân, hệ thống đề xuất kiến trúc Docker đa container (Multi-Container Architecture) như sau:

```
                  ┌──────────────────────┐
                  │  Cloudflare Tunnel   │
                  │ (cloudflared:latest) │
                  └──────────▲───────────┘
                             │ (HTTPS share link)
  ┌──────────────────────────┼──────────────────────────┐
  │ Localhost (Docker host)  │                          │
  │                          ▼                          │
  │  ┌────────────────────────┐  ┌────────────────────┐ │
  │  │     Web Container      │  │ Database Container │ │
  │  │     (php:8.2-apache)   ├──►  (mariadb:10.6)   │ │
  │  └────────────────────────┘  └─────────▲──────────┘ │
  │                                        │            │
  │                              ┌─────────┴──────────┐ │
  │                              │ phpMyAdmin Container│ │
  │                              │ (phpmyadmin:latest)│ │
  │                              └────────────────────┘ │
  └─────────────────────────────────────────────────────┘
```

*   **Database Container (`db`)**: Chạy hệ quản trị cơ sở dữ liệu `mariadb:10.6` cô lập, dữ liệu được ghi đè và lưu vết trực tiếp (Volume mount) trên máy chủ vật lý nhằm tránh mất mát thông tin khi khởi động lại container. Tự động nhập cấu trúc bảng từ file `database.sql` khi container được sinh ra lần đầu.
*   **Web Container (`web`)**: Xây dựng từ `Dockerfile` tùy chỉnh trên nền `php:8.2-apache`, tự động kích hoạt thư viện `pdo_mysql` cho kết nối cơ sở dữ liệu, nạp mã nguồn dự án qua cơ chế gắn kết động (Volume binding) để hỗ trợ tính năng thay đổi code hiển thị tức thời (Live-reload).
*   **Tunnel Container (`tunnel`)**: Sử dụng image chính thức từ Cloudflare (`cloudflare/cloudflared`), thiết lập một kênh kết nối VPN ngược từ container web đến máy chủ Cloudflare giúp tạo ra một tên miền ngẫu nhiên công khai có HTTPS (`*.trycloudflare.com`). Điều này cho phép người dùng bên ngoài Internet truy cập trực tiếp vào bản chạy thử trên máy tính cá nhân của nhà phát triển mà không cần cấu hình DNS phức tạp hay NAT/Port Forwarding trên modem.
*   **phpMyAdmin Container (`phpmyadmin`)**: Công cụ quản trị giao diện web giúp nhà phát triển dễ dàng thao tác xem, sửa, và truy vấn trực quan CSDL nội bộ.

### 2.2 Định Hướng Phát Triển Ứng Dụng
Sau khi thiết lập thành công nền tảng hạ tầng đám mây và Docker, hệ thống vận hành ứng dụng quản lý tài chính cá nhân **SpendMindAI** bao gồm các trang chức năng cốt lõi:
*   **Đăng nhập / Đăng ký (Login / Register)**: Trang đăng ký thành viên bảo mật, mã hóa mật khẩu một chiều bằng thuật toán bão hòa bcrypt và tích hợp đăng nhập an toàn bằng tài khoản Google.
*   **Lịch ghi chép giao dịch (Transaction Calendar)**: Giao diện lịch tương tác trực quan cho phép người dùng thêm, sửa, xóa các giao dịch thu nhập/chi tiêu hàng ngày ngay trên từng ô lịch, đồng thời hỗ trợ tô màu highlight và viết ghi chú nhanh.
*   **Hạn mức chi tiêu (Monthly Budget)**: Thiết lập ngân sách tối đa hàng tháng cho từng danh mục riêng biệt (Ăn uống, Di chuyển, Giải trí, Nhà cửa, Mua sắm...). Hệ thống hiển thị thanh tiến độ cảnh báo màu sắc tương ứng với tỉ lệ sử dụng ngân sách thực tế.
*   **Biểu đồ phân tích tài chính (Charts)**: Tích hợp thư viện Chart.js hiển thị cấu trúc chi tiêu (Pie Chart) và biểu đồ cột so sánh xu hướng thu chi trong tuần/tháng (Bar Chart).
*   **Trợ lý ảo tài chính (AI Chatbot)**: Chatbot thông minh tích hợp API Google Gemini, tự động đọc hiểu dữ liệu giao dịch của người dùng để tư vấn thói quen chi tiêu và giải đáp thắc mắc tài chính.
*   **Nhắc nhở tự động qua Email**: Thiết lập Cron Job hàng ngày tự động gửi email nhắc nhở người dùng ghi chép chi tiêu dựa trên giờ hẹn đặt trước trong cài đặt.

---

## 3 Hướng Dẫn Khởi Tạo Hạ Tầng Trên Azure Cloud

Hạ tầng đám mây Microsoft Azure được lựa chọn để triển khai hệ thống nhờ tính ổn định vượt trội, chính sách Free Tier hấp dẫn dành cho sinh viên và hệ sinh thái quản lý tài nguyên linh hoạt.

### 3.1 Quy trình khởi tạo Máy ảo (Azure Virtual Machine)
Các bước thiết lập máy ảo Ubuntu chạy trên Azure:
1.  Truy cập vào trang chủ quản lý dịch vụ **Azure Portal** tại địa chỉ [https://portal.azure.com](https://portal.azure.com) và chọn dịch vụ **Virtual Machines**.
2.  Nhấn nút **Create** -> Chọn **Azure virtual machine** để mở giao diện khởi tạo.
3.  Cấu hình các thông số cơ bản:
    *   **Resource Group**: Tạo mới một nhóm tài nguyên (Ví dụ: `QuanLyChiTieu_Group`).
    *   **Virtual machine name**: Đặt tên máy ảo `QuanLyChiTieu-VM`.
    *   **Region**: Lựa chọn khu vực `Southeast Asia` (Singapore) để đảm bảo kết nối mạng có độ trễ thấp nhất về Việt Nam.
    *   **Image**: Chọn hệ điều hành **Ubuntu Server 22.04 LTS - x64 Gen2**.
    *   **Size**: Lựa chọn mã cấu hình **Standard_B1s** (1 vCPU, 1 GiB RAM - nằm trong diện Free Tier miễn phí hoàn toàn 750 giờ/tháng) hoặc nâng cấp lên **Standard_B1ms** (1 vCPU, 2 GiB RAM) để hệ thống cơ sở dữ liệu hoạt động ổn định và mượt mà hơn khi xử lý nhiều truy vấn AI đồng thời.
    *   **Authentication type**: Chọn **SSH public key** để tăng cường tính bảo mật cho tài khoản quản trị. Hệ thống tự động tạo và cho phép tải xuống file khóa riêng tư `.pem` (`quanlychitieu-key.pem`).
    *   **Username**: `HuynhBaThanh`

### 3.2 Cấu hình Tường lửa Hệ thống (Network Settings & Security Group)
Tường lửa lớp mạng của Azure (Network Security Group - NSG) được thiết lập chặt chẽ để kiểm soát luồng giao thông mạng đi vào máy chủ đám mây. Đánh dấu kích hoạt các quy tắc chấp nhận kết nối cốt lõi sau:
*   **Cổng 22 (SSH)**: Chấp nhận traffic TCP cổng 22 từ xa để quản trị hệ thống qua dòng lệnh.
*   **Cổng 80 (HTTP) và Cổng 443 (HTTPS)**: Chấp nhận traffic TCP cổng 80 và 443 để phục vụ hiển thị website SpendMindAI ra môi trường internet cộng đồng.
*   **Cổng 3306 (MySQL)**: Cấm tuyệt đối (Deny) truy cập trực tiếp từ các dải IP internet ngoài. Cơ sở dữ liệu chỉ được kết nối cục bộ nội bộ (localhost) từ bên trong máy chủ để phòng tránh tấn công brute-force.

### 3.3 Cấu hình Bộ nhớ Lưu trữ (Configure Storage)
*   **Root Volume**: Thiết lập dung lượng đĩa cứng OS disk tối đa là **30 GB** sử dụng công nghệ **Premium SSD** hoặc **Standard SSD** (nằm trong hạn mức đĩa lưu trữ miễn phí của gói Azure Free Tier).
*   **Backup**: Lên lịch sao lưu snapshot ổ đĩa định kỳ nhằm mục đích dự phòng và khôi phục hệ thống nhanh chóng khi có sự cố mất mát dữ liệu hoặc cấu hình sai nhân hệ điều hành.

---

## 4 Quy Trình Cài Đặt Môi Trường Máy Chủ (Server Setup)

Sau khi tạo máy ảo thành công, quản trị viên kết nối dòng lệnh thông qua giao thức SSH bằng tài khoản `HuynhBaThanh` và tệp khóa `.pem`:
```bash
ssh -i quanlychitieu-key.pem HuynhBaThanh@52.184.77.236
```

### 4.1 Cập Nhật Hệ Thống và Cài Đặt Máy Chủ Web Nginx
Đồng bộ các gói cập nhật hệ điều hành mới nhất và cài đặt Nginx:
```bash
# Cap nhat toan bo danh muc tai nguyen he thong
sudo apt update && sudo apt upgrade -y

# Cai dat may chu web Nginx
sudo apt install nginx -y
```

### 4.2 Cài Đặt Hệ Quản Trị Cơ Sở Dữ Liệu MySQL Server
Tiến hành cài đặt MySQL Server và cấu hình bảo mật:
```bash
# Cai dat He quan tri CSDL MySQL Server len VM
sudo apt install mysql-server -y

# Thiet lap bao mat an ninh he thong MySQL
sudo mysql_secure_installation
```
Trong quá trình cấu hình bảo mật, chọn kích hoạt mật khẩu mạnh, loại bỏ tài khoản người dùng ẩn danh, cấm đăng nhập root từ xa và xóa cơ sở dữ liệu dùng thử.

### 4.3 Cài Đặt Môi Trường Thực Thi Ứng Dụng (Runtime Engine Environments)
Ứng dụng sử dụng ngôn ngữ PHP thuần (Raw PHP) cho phần xử lý Backend API và tích hợp SMTP để gửi thư nhắc nhở. Tiến hành cài đặt PHP-FPM cùng các module cần thiết:
```bash
# Cai dat PHP (FPM) va cac extension bat buoc de thuc thi ma nguon PHP
sudo apt install php-fpm php-mysql php-curl php-json php-mbstring php-xml php-zip unzip curl -y
```

### 4.4 Thiết Lập Cơ Sở Dữ Liệu Ban Đầu (Database Initialization)
Truy cập vào shell quản trị của MySQL để thiết lập định danh cơ sở dữ liệu và người dùng cô lập bảo mật:
```bash
sudo mysql
```
Thực thi các lệnh SQL sau trong bảng điều khiển:
```sql
-- Khoi tao Database cho ung dung SpendMindAI
CREATE DATABASE quan_ly_chi_tieu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tao User cuc bo va dat mat khau bao mat phuc tap
CREATE USER 'chi_tieu_user'@'localhost' IDENTIFIED BY 'WZ+YourStrongGeneratedDbPassword2026';

-- Cap toan bo quyen han thao tac tren Database ung dung cho User vua tao
GRANT ALL PRIVILEGES ON quan_ly_chi_tieu.* TO 'chi_tieu_user'@'localhost';

-- Lam moi bang phan quyen va thoat khoi trinh quan ly
FLUSH PRIVILEGES;
EXIT;
```
Tiến hành nhập (import) cấu trúc cơ sở dữ liệu mẫu từ tệp `database.sql` vào database vừa tạo:
```bash
mysql -u chi_tieu_user -p quan_ly_chi_tieu < /var/www/QuanLyChiTieu/database.sql
```

---

## 5 Quy Trình DevOps và Triển Khai Mã Nguồn (DevOps & Deploy Source Code)

Dự án áp dụng triết lý DevOps thông qua hai luồng vận hành độc lập: Môi trường phát triển cục bộ ảo hóa container và Môi trường chạy thực tế tự động hóa triển khai trực tiếp.

### 5.1 DevOps Cục Bộ: Khởi Chạy Container và Cloudflare Tunnel Tự Động
Để đơn giản hóa việc chạy thử nghiệm và chia sẻ bản demo cho thầy cô/đối tác mà không cần cấu hình mạng vật lý, dự án cung cấp script khởi động tự động hóa qua PowerShell `start.ps1`:

```powershell
# 1. Khởi chạy Docker Compose xây dựng cụm Container
Write-Host "[1/3] Dang khoi dong cac dich vu (Database, Web Server, Cloudflare Tunnel)..."
docker compose up -d --build

# 2. Quét log của container tunnel để tự động trích xuất liên kết public ngẫu nhiên
$tunnelUrl = $null
while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 2
    $logs = docker compose logs --tail 100 tunnel 2>&1
    foreach ($line in $logs) {
        if ($line -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]
            break
        }
    }
    if ($tunnelUrl) { break }
}

# 3. Lưu liên kết public và sao chép tự động vào Clipboard máy tính
$tunnelUrl | Out-File -FilePath "$PSScriptRoot\cloudflare_link.txt" -Encoding utf8
Set-Clipboard -Value $tunnelUrl
Write-Host "[OK] Da copy link vao Clipboard. Hay paste (Ctrl+V) de chia se!"
Start-Process $tunnelUrl
```

Nhờ quy trình tự động hóa này, nhà phát triển chỉ cần click chạy tệp tin `start.bat` / `start.ps1`. Hệ thống sẽ tự động cấu hình ứng dụng, khởi động MariaDB, thiết lập web Apache, mở VPN Cloudflare Tunnel, copy link HTTPS công khai vào bộ nhớ tạm của máy tính, và tự động mở tab trình duyệt để sẵn sàng demo. Tiến trình dọn dẹp và ngắt tài nguyên local được cấu hình tương tự thông qua script `stop.ps1` thực thi lệnh `docker compose down`.

### 5.2 DevOps Đám Mây: Triển Khai Tự Động Lên Azure VM Qua Python Deploy Engine
Quy trình đưa mã nguồn lên VPS Azure chạy trực tiếp (bare-metal LEMP stack để tối ưu hóa hiệu năng máy ảo cấu hình thấp) được tự động hóa hoàn toàn bằng script Python `deploy_vps.py`:
1.  **Đóng gói tự động**: Script nén thư mục dự án thành file `QuanLyChiTieu.zip` (loại bỏ các file cấu hình nhạy cảm local và log rác để giảm dung lượng tải). Nếu có file đang bị khóa (ví dụ: file báo cáo Word đang mở), script tự động in cảnh báo và bỏ qua thay vì làm dừng tiến trình deploy.
2.  **Truyền tải bảo mật (SFTP)**: Sử dụng thư viện `paramiko` và lớp `SCPClient` để đẩy tệp nén lên máy chủ ảo Azure cổng 22.
3.  **Thực thi từ xa (SSH Client)**: Script kết nối dòng lệnh, phân quyền và chạy script Bash `/var/www/QuanLyChiTieu/vps_deployment/deploy.sh` để:
    *   Tự động cài đặt/nâng cấp hệ thống LEMP Stack trên VM.
    *   Tự động tạo mật khẩu cơ sở dữ liệu ngẫu nhiên độ an toàn cao lưu vào tệp `db_credentials.txt` và nạp database.
    *   Giải nén mã nguồn vào thư mục `/var/www/QuanLyChiTieu`.
    *   Cấu hình Nginx Virtual Host và kích hoạt dịch vụ SSL Certbot bảo mật HTTPS tự động.
4.  **Dọn dẹp hệ thống**: Sau khi triển khai xong, script tự động xóa file ZIP lưu tạm trên máy chủ và máy trạm local để giữ sạch bộ nhớ.

### 5.3 Cấu Hình Khóa và Khởi Tạo Biến Môi Trường (.env)
Tất cả các thông số kết nối cơ sở dữ liệu và mã API nhạy cảm được cấu hình tập trung trong tệp tin `/var/www/QuanLyChiTieu/.env`. Cần khởi tạo file cấu hình này trực tiếp trên máy chủ bằng lệnh soạn thảo:
```bash
sudo cp /var/www/QuanLyChiTieu/.env.example /var/www/QuanLyChiTieu/.env
sudo nano /var/www/QuanLyChiTieu/.env
```
Thiết lập chính xác các thông số kết nối cơ sở dữ liệu, SMTP gửi thư và API AI Chatbot:
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=chi_tieu_user
DB_PASS=WZ+YourStrongGeneratedDbPassword2026
DB_NAME=quan_ly_chi_tieu

SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=huynhbathanh21102005@gmail.com
SMTP_PASS=ewsh tytq ifvq rlun   # Mật khẩu ứng dụng (App Password) sinh từ Gmail
SMTP_FROM=huynhbathanh21102005@gmail.com
SMTP_FROM_NAME=SpendMindAI

APP_ENV=production
APP_URL=https://huynhbathanh.site
ALLOWED_ORIGINS=https://huynhbathanh.site,https://www.huynhbathanh.site
GOOGLE_CLIENT_ID=323969067193-8ph0nqo120aa1mm0iecjhhreu3u96k71.apps.googleusercontent.com
```

### 5.4 Di Cư Dữ Liệu và Phân Quyền Cho Web Server
Tiến hành phân quyền sở hữu tài nguyên cho người dùng chạy runtime của Nginx và PHP-FPM (`www-data`) để ứng dụng có quyền ghi nhật ký, gửi mail và hoạt động thông suốt:
```bash
# Cap quyen so huu cac thu muc ghi du lieu cho User run-time cua Nginx (www-data)
sudo chown -R www-data:www-data /var/www/QuanLyChiTieu
sudo find /var/www/QuanLyChiTieu -type d -exec chmod 755 {} \;
sudo find /var/www/QuanLyChiTieu -type f -exec chmod 644 {} \;
```

---

## 6 Cấu Hinh Khối Điều Phối Nginx (Virtual Host)

Nginx cần cấu hình Virtual Host riêng biệt để định tuyến các kết nối cổng HTTP/HTTPS trỏ về thư mục dự án `/var/www/QuanLyChiTieu`. Tạo tệp cấu hình mới:
```bash
sudo nano /etc/nginx/sites-available/quanlychitieu
```
Nội dung cấu hình chi tiết phân tuyến Reverse Proxy của Nginx:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name huynhbathanh.site www.huynhbathanh.site;

    root /var/www/QuanLyChiTieu;
    index index.html dashboard.html;

    # Chan cac quyen truy cap trai phep vao cac file cau hinh an nhu .env va .git
    location ~ /\.(?!well-known).* {
        deny all;
    }

    # Xu ly tai cac file tinh cho ung dung
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Xu ly cac file dinh dang kich ban dong PHP
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        
        # Dieu chinh chinh xac phien ban socket PHP dang chay tren OS
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
```
Kích hoạt tệp cấu hình ảo bằng cách liên kết nó vào danh mục hoạt động `sites-enabled`:
```bash
sudo ln -sf /etc/nginx/sites-available/quanlychitieu /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Kiem tra xem file cau hinh Nginx co bi loi cu phap hay khong
sudo nginx -t

# Khoi dong lai dich vu Nginx de ap dung thiet lap moi
sudo systemctl restart nginx
```

---

## 7 Cấu Hinh Chứng Chỉ Bảo Mật HTTPS Với Let’s Encrypt

Để bảo vệ an toàn thông tin dữ liệu truyền tải của người dùng khi sử dụng chức năng xác thực tài khoản và ghi chép tài chính cá nhân, việc cấu hình chứng chỉ mã hóa SSL/HTTPS là bắt buộc.

### 7.1 Cấu hình Tên miền trên Nginx
Mở tệp cấu hình Virtual Host đã tạo ở bước trước để đảm bảo chỉ thị `server_name` chứa đúng tên miền:
```nginx
server_name huynhbathanh.site www.huynhbathanh.site;
```
Lưu file và tiến hành nạp lại cấu hình máy chủ:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 7.2 Cài Đặt Công Cụ Certbot và Xin Cấp Phát Chứng Chỉ SSL
Sử dụng công cụ Certbot để tự động hóa quy trình xác thực tên miền và thiết lập HTTPS mã hóa trên Nginx:
```bash
# Cai dat trinh Certbot kem plugin ho tro rieng cho Nginx
sudo apt install certbot python3-certbot-nginx -y

# Chay Certbot xin chung chi va tu dong cau hinh HTTPS hoa toan bo he thong
sudo certbot --nginx -d huynhbathanh.site -d www.huynhbathanh.site
```
Trong quá trình cài đặt, chọn chuyển hướng toàn bộ traffic thô HTTP sang HTTPS mã hóa an toàn (chọn Redirect).

### 7.3 Cập Nhật Biến Môi Trường Ứng Dụng
Sửa đổi địa chỉ ứng dụng sang giao thức bảo mật mới HTTPS trong tệp tin ẩn `.env`:
```ini
APP_URL=https://huynhbathanh.site
```

### 7.4 Kiểm tra tính năng tự động gia hạn (Automated Renewal Check)
Chứng chỉ Let's Encrypt cấp phát miễn phí có hiệu lực định kỳ trong 90 ngày. Hệ thống Certbot đã tự động tích hợp sẵn systemd timer / cronjob kiểm tra tự động gia hạn ngầm khi thời hạn chứng chỉ còn dưới 30 ngày. Để kiểm tra tính năng chạy ổn định, thực thi lệnh mô phỏng gia hạn:
```bash
sudo certbot renew --dry-run
```
Hệ thống log hiển thị dòng thông báo thành công cho biết tính năng gia hạn tự động hoạt động hoàn hảo.

---

## 8 Cấu Hinh Quản Lý Chi Phí Hạ Tầng (Azure Billing Alert)

Một nội dung thực tiễn quan trọng khi triển khai hạ tầng công nghệ Điện toán đám mây là quản trị rủi ro chi phí tài nguyên. Để kiểm soát chặt chẽ hóa đơn, không để phát sinh chi phí ngoài ý muốn vượt ngưỡng Free Tier (do cấu hình sai kích thước tài nguyên hoặc bị tấn công DDoS tiêu hao dữ liệu lớn), một quy tắc giám sát tự động (Billing Budget & Alerts) đã được thiết lập trên Azure Portal.

### 8.1 Quy trình thiết lập hệ thống cảnh báo tự động gửi về Email
1.  Đăng nhập vào cổng quản trị **Azure Portal**, truy cập dịch vụ **Cost Management + Billing**.
2.  Tại menu điều hướng bên trái, chọn **Budgets** và nhấn **Add** để tạo ngân sách mới.
3.  Thiết lập thông số ngân sách:
    *   **Amount**: Đặt số tiền giới hạn tối đa hàng tháng là **$1.00 USD** hoặc **$5.00 USD** (Đây là mức nhỏ nhất giúp phát hiện sớm bất kỳ chi phí phát sinh nào ngoài phạm vi miễn phí).
    *   **Timeframe**: Monthly (Hàng tháng).
4.  Cấu hình điều kiện kích hoạt cảnh báo (Set Alert Conditions):
    *   Thiết lập ngưỡng cảnh báo **Actual** (Thực tế đạt được) và **Forecasted** (Dự kiến đạt được) khi đạt **50%**, **80%**, và **100%** giá trị ngân sách đặt ra.
5.  Thiết lập địa chỉ nhận email phản hồi:
    *   Nhập trực tiếp địa chỉ email quản trị viên: `huynhbathanh21102005@gmail.com`.
6.  Hệ thống Azure Cost Management sẽ tự động theo dõi thời gian thực. Khi có bất kỳ tài nguyên máy ảo hay ổ cứng lưu trữ nào phát sinh chi phí nhỏ nhất bắt đầu vượt ngưỡng quy định, Azure sẽ ngay lập tức gửi thư cảnh báo để quản trị viên kịp thời dừng/điều chỉnh tài nguyên phù hợp.

---

## 9 Kết Luận và Hướng Phát Triển Đề Tài

### 9.1 Kết Quả Đạt Được
Dự án "Triển khai Website quản lý chi tiêu SpendMindAI trên Cloud Computing" đã hoàn thành xuất sắc toàn bộ các mục tiêu cốt lõi đã đề ra ban đầu. Sản phẩm đồ án thực tế đạt được các kết quả nghiệm thu bao gồm:
*   **Triển khai ứng dụng vận hành ổn định**: Web hoạt động với hiệu năng cao trên máy ảo đám mây **Azure Virtual Machine** (`Standard_B1ms`). Giao diện lịch tương tác, hạn mức chi tiêu, biểu đồ trực quan hóa dữ liệu và AI Chatbot hoạt động hoàn hảo.
*   **Cấu hình máy chủ web Nginx tối ưu**: Hoạt động như một Reverse Proxy an toàn, lọc và phục vụ nhanh chóng các yêu cầu tải tệp tĩnh, chuyển tiếp chính xác các yêu cầu PHP động tới PHP-FPM.
*   **Bảo mật dữ liệu nghiêm ngặt**: Cô lập cơ sở dữ liệu MySQL ở mức nội bộ, bảo mật an toàn đường truyền mạng mã hóa HTTPS nhờ chứng chỉ Let's Encrypt được tự động gia hạn thông qua Certbot.
*   **Đã ảo hóa container bằng Docker**: Chuẩn hóa thành công môi trường local của lập trình viên qua cụm 4 container (MariaDB, Apache-PHP, PhpMyAdmin, Cloudflare Tunnel), loại bỏ hoàn toàn sự bất đồng nhất môi trường khi chạy demo thực tế.
*   **Đã tự động hóa quy trình vận hành DevOps**: Xây dựng thành công các kịch bản script tự động hóa: `start.ps1` giúp khởi chạy và sinh link public chỉ bằng một click chuột, `deploy_vps.py` giúp nén, truyền tải và triển khai mã nguồn lên đám mây Azure chỉ trong 10 giây.
*   **Quản lý chi phí tối ưu**: Triển khai cơ chế Azure Billing Alert thành công, đảm bảo hệ thống chạy mượt mà trong ngân sách $0 của tài khoản Free Tier.

### 9.2 Hướng Phát Triển Tiếp Theo
Dựa trên nền tảng hạ tầng hệ thống vững chắc đã được cấu hình thành công, đề tài đồ án có thể tiếp tục mở rộng chuyên sâu theo các hướng phát triển tiềm năng sau:
1.  **Tự động hóa đồng bộ tài khoản ngân hàng**: Tích hợp các cổng API thông tin ngân hàng mở (Open Banking API) hoặc quét OCR hóa đơn để tự động đồng bộ giao dịch của người dùng vào hệ thống.
2.  **Áp dụng mô hình DevOps CI/CD hoàn chỉnh**: Xây dựng chuỗi quy trình tích hợp và triển khai tự động hoàn toàn thông qua **GitHub Actions**. Khi có lập trình viên đẩy mã nguồn mới lên Github, hệ thống tự động kiểm thử (Unit Tests), đóng gói Docker Image đẩy lên Docker Hub và tự động trigger máy chủ ảo Azure kéo image mới về cập nhật mà không cần chạy script thủ công.
3.  **Hạ tầng Container hóa Kubernetes**: Triển khai quản lý cụm Docker container bằng công nghệ Kubernetes để dễ dàng co dãn (Auto-scaling) năng lực máy chủ và tăng độ chịu tải của website SpendMindAI khi lượng người dùng truy cập tăng cao.
