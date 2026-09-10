<?php
/* ==========================================================================
   SPENDMINDAI - MAILER SERVICE
   High-performance SMTP socket client & mock email logger for Serverless PHP
   ========================================================================== */

class MailerService {

    private static function readSmtpResponse($socket): string {
        $response = "";
        while ($line = fgets($socket, 512)) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        return $response;
    }

    /**
     * Send email via SMTP TCP Sockets or log to mock outbox if SMTP_ENABLED is false.
     *
     * @param string $to Recipient email address
     * @param string $subject Email subject line
     * @param string $body Email HTML content
     * @return array [success => bool, simulated => bool, message => string]
     */
    public static function send(string $to, string $subject, string $body): array {
        $smtpEnabled = filter_var(
            function_exists('getEnvVar') ? getEnvVar('SMTP_ENABLED', false) : (getenv('SMTP_ENABLED') ?: false),
            FILTER_VALIDATE_BOOLEAN
        );

        if (!$smtpEnabled) {
            // Mock simulation: write to temp directory outbox log
            $logDir = sys_get_temp_dir();
            $logFile = $logDir . '/spendmind_email_outbox.log';
            $timeStr = date('Y-m-d H:i:s');
            $logContent = "==================================================\n";
            $logContent .= "Thư được gửi lúc: $timeStr\n";
            $logContent .= "Đến: $to\n";
            $logContent .= "Chủ đề: $subject\n";
            $logContent .= "Nội dung:\n$body\n";
            $logContent .= "==================================================\n\n";

            @file_put_contents($logFile, $logContent, FILE_APPEND);

            return [
                "success" => true,
                "simulated" => true,
                "message" => "Ghi nhận gửi mail giả lập thành công đến $to. Chi tiết tại temporary log."
            ];
        }

        $host = function_exists('getEnvVar') ? getEnvVar('SMTP_HOST', 'smtp.gmail.com') : (getenv('SMTP_HOST') ?: 'smtp.gmail.com');
        $port = intval(function_exists('getEnvVar') ? getEnvVar('SMTP_PORT', 465) : (getenv('SMTP_PORT') ?: 465));
        $user = function_exists('getEnvVar') ? getEnvVar('SMTP_USER') : getenv('SMTP_USER');
        $pass = function_exists('getEnvVar') ? getEnvVar('SMTP_PASS') : getenv('SMTP_PASS');
        $from = (function_exists('getEnvVar') ? getEnvVar('SMTP_FROM') : getenv('SMTP_FROM')) ?: $user;
        $fromName = (function_exists('getEnvVar') ? getEnvVar('SMTP_FROM_NAME') : getenv('SMTP_FROM_NAME')) ?: 'SpendMindAI';

        if (empty($user) || empty($pass)) {
            return [
                "success" => false,
                "simulated" => false,
                "message" => "Thiếu thông tin xác thực tài khoản SMTP trong cấu hình môi trường."
            ];
        }

        try {
            $socketHost = ($port == 465) ? 'ssl://' . $host : $host;
            $socket = @fsockopen($socketHost, $port, $errno, $errstr, 15);
            if (!$socket) {
                throw new Exception("Không thể kết nối máy chủ SMTP: $errstr ($errno)");
            }

            self::readSmtpResponse($socket);

            fwrite($socket, "EHLO localhost\r\n");
            self::readSmtpResponse($socket);

            if ($port == 587) {
                fwrite($socket, "STARTTLS\r\n");
                self::readSmtpResponse($socket);

                $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT;
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                    $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
                    if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
                        $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
                    }
                }

                if (!stream_socket_enable_crypto($socket, true, $cryptoMethod)) {
                    throw new Exception("Không thể nâng cấp kết nối lên mã hóa TLS");
                }
                fwrite($socket, "EHLO localhost\r\n");
                self::readSmtpResponse($socket);
            }

            fwrite($socket, "AUTH LOGIN\r\n");
            self::readSmtpResponse($socket);

            fwrite($socket, base64_encode($user) . "\r\n");
            self::readSmtpResponse($socket);

            fwrite($socket, base64_encode($pass) . "\r\n");
            $authResponse = self::readSmtpResponse($socket);
            if (strpos($authResponse, '235') === false) {
                throw new Exception("Đăng nhập SMTP thất bại: " . $authResponse);
            }

            fwrite($socket, "MAIL FROM: <$from>\r\n");
            self::readSmtpResponse($socket);

            fwrite($socket, "RCPT TO: <$to>\r\n");
            self::readSmtpResponse($socket);

            fwrite($socket, "DATA\r\n");
            self::readSmtpResponse($socket);

            $smtpHostName = function_exists('getEnvVar') ? getEnvVar('SMTP_HOST', 'smtp.gmail.com') : (getenv('SMTP_HOST') ?: 'smtp.gmail.com');
            $messageId = "<" . bin2hex(random_bytes(16)) . "@" . $smtpHostName . ">";
            $headers = "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
            $headers .= "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$from>\r\n";
            $headers .= "To: <$to>\r\n";
            $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
            $headers .= "Date: " . date('r') . "\r\n";
            $headers .= "Message-ID: " . $messageId . "\r\n";
            $headers .= "X-Priority: 1\r\n";
            $headers .= "Priority: Urgent\r\n";
            $headers .= "Importance: High\r\n";
            $headers .= "Precedence: personal\r\n";

            fwrite($socket, $headers . "\r\n" . $body . "\r\n.\r\n");
            $dataResponse = self::readSmtpResponse($socket);

            fwrite($socket, "QUIT\r\n");
            fclose($socket);

            if (strpos($dataResponse, '250') === false) {
                throw new Exception("Lỗi truyền dữ liệu DATA: " . $dataResponse);
            }

            return [
                "success" => true,
                "simulated" => false,
                "message" => "Đã gửi email thật thành công đến $to!"
            ];

        } catch (Throwable $e) {
            error_log("MailerService Exception: " . $e->getMessage());
            return [
                "success" => false,
                "simulated" => false,
                "message" => "Lỗi gửi email: " . $e->getMessage()
            ];
        }
    }

    /**
     * Build rich HTML email template for daily reminders.
     */
    public static function buildDailyReminder(string $username, string $reminderTime, string $appUrl): array {
        $reminderHour = intval(substr($reminderTime, 0, 2));
        $memeTitle = "💡 Lời nhắc từ ví tiền của bạn:";

        if ($reminderHour >= 5 && $reminderHour < 12) {
            $memes = [
                "Chào buổi sáng! Húp nhẹ bát phở 50k xong thì nhớ ghi vào sổ nhé, kẻo cuối tháng lại thắc mắc tiền đi đâu như một cơn gió.",
                "Sáng ra làm ly cà phê 35k tỉnh táo rồi thì nhập sổ đi bạn. Cà phê giúp tỉnh táo, còn nhập sổ giúp tỉnh ngộ!",
                "Bình minh ơi dậy chưa? Dậy rồi thì nhớ ghi chi tiêu bữa sáng đi nhé. Đừng để ví tiền của bạn cũng trôi về nơi xa."
            ];
        } elseif ($reminderHour >= 12 && $reminderHour < 18) {
            $memes = [
                "Đã nửa ngày trôi qua, cốc trà sữa 60k ban chiều có làm bạn ngọt ngào? Ghi vào sổ đi rồi xem ví bạn có đắng lòng không.",
                "Bữa trưa ăn gì hết bao nhiêu nhớ nhập sổ nha. Ăn thì nhanh chứ ví xẹp thì lâu mới phồng lại đấy!",
                "Alo alo! Trà chiều, bánh ngọt, ăn vặt... ghi hết vào sổ chưa bạn ơi? Đừng giả vờ quên để trốn tránh sự thật."
            ];
        } elseif ($reminderHour >= 18 && $reminderHour < 22) {
            $memes = [
                "Hôm nay tiêu gì ghi chưa bạn? Đừng để lúc đi ngủ nhắm mắt lại mới chợt nhớ ra ví mình đã mất tích một khoản không rõ nguyên nhân.",
                "Ghi sổ chi tiêu đi nào! Ghi sổ không làm bạn giàu lên ngay lập tức, nhưng ít nhất giúp bạn biết tại sao mình nghèo.",
                "Nhập thu chi đi bạn ơi! Để lúc thanh toán quét mã QR, tài khoản báo 'Số dư không đủ' lại tự hỏi mình đã làm gì sai với cuộc đời."
            ];
        } else {
            $memes = [
                "Nửa đêm rồi, đừng lướt Shopee/Tiktok nữa bạn ơi! Hãy vào ghi sổ chi tiêu đi để thấy giỏ hàng kia xa xỉ thế nào.",
                "Đêm muộn ví tiền thì lạnh, sổ chi tiêu thì trống. Vào nhập nốt khoản chi hôm nay rồi ngủ ngon nhé, đừng thức khuya nghĩ cách tiêu tiền nữa.",
                "Người ta thức khuya nhớ người yêu, còn bạn thức khuya chắc là đang suy nghĩ vì sao tiền trong thẻ bốc hơi đúng không? Ghi sổ ngay!"
            ];
        }

        $selectedMeme = $memes[array_rand($memes)];
        $subject = "Nhắc nhở hàng ngày: Nhập dữ liệu thu chi SpendMindAI";
        $loginUrl = rtrim($appUrl, '/') . '/login.html';

        $body = "
        <div style='font-family: \"SF Pro Display\", -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;'>
            <div style='text-align: center; margin-bottom: 24px;'>
                <div style='display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #34d399, #059669); color: white; text-align: center; line-height: 48px; font-size: 24px;'>
                    💰
                </div>
                <h2 style='color: #0c1c13; margin-top: 12px; font-weight: 700;'>SpendMindAI</h2>
            </div>
            <p style='color: #4a5c52; font-size: 16px; line-height: 1.6;'>
                Xin chào <strong>" . htmlspecialchars($username) . "</strong>,
            </p>
            <p style='color: #4a5c52; font-size: 16px; line-height: 1.6;'>
                Đây là thông báo tự động từ hệ thống tài chính cá nhân SpendMindAI. Đã đến giờ ghi nhận thu chi trong ngày hôm nay!
            </p>
            <div style='background-color: #f4f8f6; border: 1px solid #e1e8e4; border-radius: 12px; padding: 18px; margin: 20px 0;'>
                <h4 style='color: #059669; margin: 0 0 8px 0; font-weight: 600;'>" . htmlspecialchars($memeTitle) . "</h4>
                <p style='color: #4a5c52; font-size: 14px; margin: 0; line-height: 1.5; font-style: italic;'>
                    \"" . htmlspecialchars($selectedMeme) . "\"
                </p>
            </div>
            <div style='text-align: center; margin: 30px 0 10px 0;'>
                <a href='" . htmlspecialchars($loginUrl) . "' style='background-color: #059669; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; display: inline-block;'>
                    Nhập thu chi ngay
                </a>
            </div>
            <hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 20px 0;'>
            <p style='color: #7d9085; font-size: 12px; text-align: center; margin: 0;'>
                Bạn nhận được email này vì đã bật tùy chọn nhắc nhở lúc " . substr($reminderTime, 0, 5) . " hàng ngày.<br>
                Để đổi giờ hoặc tắt nhắc nhở, vui lòng truy cập Bảng điều khiển -> Cài đặt nhắc nhở.
            </p>
        </div>";

        return [
            "subject" => $subject,
            "body" => $body
        ];
    }
}
