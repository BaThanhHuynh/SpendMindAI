<?php
/* ==========================================================================
   PRODUCTION MAIL UTILITIES (SMTP TCP Socket & Mock Logger)
   ========================================================================== */

// Helper to read multiline SMTP socket responses
function readSmtpResponse($socket) {
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
 * Gửi email hệ thống thông qua kết nối SMTP Sockets hoặc ghi log giả lập.
 *
 * @param string $to Địa chỉ nhận mail
 * @param string $subject Tiêu đề thư
 * @param string $body Nội dung thư (định dạng HTML)
 * @return array Trạng thái kết quả gửi thư
 */
function sendSystemEmail($to, $subject, $body)
{
    $smtpEnabled = filter_var(getenv('SMTP_ENABLED') ?: false, FILTER_VALIDATE_BOOLEAN);

    if (!$smtpEnabled) {
        // Fallback: Write email details locally to log file (for offline/dev environments)
        $logFile = __DIR__ . '/email_outbox.log';
        $timeStr = date('Y-m-d H:i:s');
        $logContent = "==================================================\n";
        $logContent .= "Thư được gửi lúc: $timeStr\n";
        $logContent .= "Đến: $to\n";
        $logContent .= "Chủ đề: $subject\n";
        $logContent .= "Nội dung:\n$body\n";
        $logContent .= "==================================================\n\n";
        
        file_put_contents($logFile, $logContent, FILE_APPEND);
        
        return [
            "success" => true,
            "simulated" => true,
            "message" => "Ghi nhận gửi mail giả lập thành công đến $to. Chi tiết tại email_outbox.log"
        ];
    }

    $host = getenv('SMTP_HOST') ?: 'smtp.gmail.com';
    $port = intval(getenv('SMTP_PORT') ?: 465);
    $user = getenv('SMTP_USER');
    $pass = getenv('SMTP_PASS');
    $from = getenv('SMTP_FROM') ?: $user;
    $fromName = getenv('SMTP_FROM_NAME') ?: 'SpendMindAI';

    if (empty($user) || empty($pass)) {
        return [
            "success" => false,
            "message" => "Thiếu thông tin xác thực tài khoản SMTP trong file .env."
        ];
    }

    try {
        $socketHost = ($port == 465) ? 'ssl://' . $host : $host;
        
        // Timeout 15 seconds to connect to SMTP server
        $socket = fsockopen($socketHost, $port, $errno, $errstr, 15);
        if (!$socket) {
            throw new Exception("Không thể kết nối máy chủ SMTP: $errstr ($errno)");
        }

        readSmtpResponse($socket);

        fwrite($socket, "EHLO localhost\r\n");
        readSmtpResponse($socket);

        if ($port == 587) {
            fwrite($socket, "STARTTLS\r\n");
            readSmtpResponse($socket);
            
            // Enable multi-protocol TLS client options for maximum compatibility
            $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT;
            if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                $cryptoMethod = STREAM_CRYPTO_METHOD_TLS_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
                    $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
                }
            }
            
            if (!stream_socket_enable_crypto($socket, true, $cryptoMethod)) {
                throw new Exception("Không thể nâng cấp lên mã hóa TLS");
            }
            fwrite($socket, "EHLO localhost\r\n");
            readSmtpResponse($socket);
        }

        fwrite($socket, "AUTH LOGIN\r\n");
        readSmtpResponse($socket);

        fwrite($socket, base64_encode($user) . "\r\n");
        readSmtpResponse($socket);

        fwrite($socket, base64_encode($pass) . "\r\n");
        $authResponse = readSmtpResponse($socket);
        if (strpos($authResponse, '235') === false) {
            throw new Exception("Đăng nhập SMTP thất bại: " . $authResponse);
        }

        fwrite($socket, "MAIL FROM: <$from>\r\n");
        readSmtpResponse($socket);

        fwrite($socket, "RCPT TO: <$to>\r\n");
        readSmtpResponse($socket);

        fwrite($socket, "DATA\r\n");
        readSmtpResponse($socket);

        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$from>\r\n";
        $headers .= "To: <$to>\r\n";
        $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";

        fwrite($socket, $headers . "\r\n" . $body . "\r\n.\r\n");
        $dataResponse = readSmtpResponse($socket);

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

    } catch (Exception $e) {
        error_log("SMTP Mailer Exception: " . $e->getMessage());
        return [
            "success" => false,
            "message" => "Lỗi gửi email: " . $e->getMessage()
        ];
    }
}
