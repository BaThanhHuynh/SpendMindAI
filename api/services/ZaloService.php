<?php
/* ==========================================================================
   SPENDMINDAI - ZALO NOTIFICATION SERVICE
   High-performance Zalo API integration (Zalo OA OpenAPI v3 & ZNS Template)
   with resilient Mock Simulation for Development & Staging.
   ========================================================================== */

class ZaloService {

    /**
     * Normalize Vietnamese phone number to standard international format (84xxxxxxxxx).
     */
    public static function normalizePhoneNumber(string $phone): string {
        $clean = preg_replace('/[^\d+]/', '', trim($phone));
        if (str_starts_with($clean, '+84')) {
            $clean = substr($clean, 1);
        } elseif (str_starts_with($clean, '0')) {
            $clean = '84' . substr($clean, 1);
        }
        return $clean;
    }

    /**
     * Validate Vietnamese phone number format.
     */
    public static function isValidVietnamesePhone(string $phone): bool {
        $normalized = self::normalizePhoneNumber($phone);
        return (bool)preg_match('/^84(3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/', $normalized);
    }

    /**
     * Generate friendly, engaging reminder message copy based on the time of day.
     */
    public static function buildReminderMessage(string $customerName, string $reminderTime, string $appUrl): array {
        $reminderHour = intval(substr($reminderTime, 0, 2));
        $loginUrl = rtrim($appUrl, '/') . '/dashboard.html';
        
        if ($reminderHour >= 5 && $reminderHour < 12) {
            $meme = "Chào buổi sáng! Húp nhẹ bát phở, uống ly cà phê rồi nhớ nhập sổ nhé, kẻo cuối tháng lại tự hỏi tiền đi đâu như một cơn gió.";
        } elseif ($reminderHour >= 12 && $reminderHour < 18) {
            $meme = "Đã nửa ngày trôi qua, cốc trà sữa bánh ngọt ban chiều có làm bạn ngọt ngào? Nhập sổ đi rồi xem ví bạn có đắng lòng không!";
        } elseif ($reminderHour >= 18 && $reminderHour < 22) {
            $meme = "Tối rồi bạn ơi! Ghi sổ chi tiêu hôm nay đi nào. Ghi sổ không làm bạn giàu lên ngay lập tức, nhưng giúp bạn biết vì sao mình nghèo.";
        } else {
            $meme = "Đêm muộn ví tiền thì lạnh, sổ chi tiêu thì trống. Vào nhập nốt khoản chi hôm nay rồi ngủ ngon nhé, đừng thức khuya nghĩ cách tiêu tiền nữa.";
        }

        $title = "🔔 NHẮC NHỞ GHI CHÉP THU CHI SPENDMINDAI";
        $text = "{$title}\n\nXin chào {$customerName},\nĐã đến giờ nhắc hẹn ghi nhận thu chi hôm nay (" . substr($reminderTime, 0, 5) . ").\n\n💡 Lời nhắc:\n\"{$meme}\"\n\n👉 Nhấn vào đây để vào sổ ngay: {$loginUrl}";

        return [
            "title" => $title,
            "meme" => $meme,
            "text" => $text,
            "url" => $loginUrl
        ];
    }

    /**
     * Send Zalo reminder message via Zalo OA OpenAPI, ZNS, or Mock Outbox Log.
     *
     * @param string $targetPhoneOrUserId Recipient phone number (e.g. 0912345678) or Zalo User ID
     * @param string $customerName Recipient customer name
     * @param string $reminderTime Reminder schedule (HH:MM)
     * @param string $appUrl Application URL for CTA link
     * @param bool $isTest Whether this is a manual test dispatch
     * @return array [success => bool, simulated => bool, message => string, detail => mixed]
     */
    public static function sendReminder(
        string $targetPhoneOrUserId,
        string $customerName,
        string $reminderTime,
        string $appUrl,
        bool $isTest = false
    ): array {
        $target = trim($targetPhoneOrUserId);
        if (empty($target)) {
            return [
                "success" => false,
                "simulated" => false,
                "message" => "Thiếu số điện thoại Zalo hoặc Zalo User ID của người nhận."
            ];
        }

        $messagePayload = self::buildReminderMessage($customerName, $reminderTime, $appUrl);
        if ($isTest) {
            $messagePayload['text'] = "🧪 [TIN NHẮN KIỂM THỬ ZALO]\n" . $messagePayload['text'] . "\n\n(Đây là tin nhắn thử nghiệm kiểm tra kết nối API Zalo từ SpendMindAI)";
        }

        $zaloEnabled = filter_var(
            function_exists('getEnvVar') ? getEnvVar('ZALO_NOTIFICATION_ENABLED', false) : (getenv('ZALO_NOTIFICATION_ENABLED') ?: false),
            FILTER_VALIDATE_BOOLEAN
        );

        $accessToken = function_exists('getEnvVar') ? getEnvVar('ZALO_ACCESS_TOKEN', '') : (getenv('ZALO_ACCESS_TOKEN') ?: '');
        $apiType = strtolower(function_exists('getEnvVar') ? getEnvVar('ZALO_API_TYPE', 'oa') : (getenv('ZALO_API_TYPE') ?: 'oa'));
        $templateId = function_exists('getEnvVar') ? getEnvVar('ZALO_TEMPLATE_ID', '') : (getenv('ZALO_TEMPLATE_ID') ?: '');

        // --- MOCK SIMULATION MODE ---
        // If not enabled or no access token is configured, safely simulate and write to outbox log.
        if (!$zaloEnabled || empty($accessToken)) {
            $logDir = sys_get_temp_dir();
            $logFile = $logDir . '/spendmind_zalo_outbox.log';
            $timeStr = date('Y-m-d H:i:s');
            
            $logContent = "==================================================\n";
            $logContent .= "TIN NHẮN ZALO GỬI LÚC: {$timeStr}\n";
            $logContent .= "ĐẾN: {$target} (" . ($isTest ? "Thử nghiệm" : "Tự động") . ")\n";
            $logContent .= "CHẾ ĐỘ: Giả lập (Mock Simulation - ZALO_NOTIFICATION_ENABLED=false)\n";
            $logContent .= "NỘI DUNG:\n{$messagePayload['text']}\n";
            $logContent .= "==================================================\n\n";

            @file_put_contents($logFile, $logContent, FILE_APPEND);

            $modeText = $isTest ? "thử nghiệm" : "nhắc nhở";
            return [
                "success" => true,
                "simulated" => true,
                "message" => "Đã ghi nhận gửi tin Zalo {$modeText} thành công đến {$target} (Chế độ mô phỏng an toàn)."
            ];
        }

        // --- REAL ZALO API DISPATCH ---
        try {
            if ($apiType === 'zns' && !empty($templateId)) {
                return self::sendZnsTemplate($target, $templateId, $customerName, $reminderTime, $accessToken);
            } else {
                return self::sendOaMessage($target, $messagePayload['text'], $accessToken);
            }
        } catch (Throwable $e) {
            error_log("ZaloService Exception: " . $e->getMessage());
            return [
                "success" => false,
                "simulated" => false,
                "message" => "Lỗi gửi tin nhắn Zalo: " . $e->getMessage()
            ];
        }
    }

    /**
     * Dispatch via Zalo Official Account OpenAPI v3 (CS message or direct message).
     */
    private static function sendOaMessage(string $recipientId, string $text, string $accessToken): array {
        $endpoint = 'https://openapi.zalo.me/v3.0/oa/message/cs';
        $postData = [
            "recipient" => [
                "user_id" => $recipientId
            ],
            "message" => [
                "text" => $text
            ]
        ];

        $response = self::executeHttpRequest($endpoint, $postData, [
            "access_token: {$accessToken}",
            "Content-Type: application/json"
        ]);

        $json = json_decode($response, true);
        if (isset($json['error']) && $json['error'] === 0) {
            return [
                "success" => true,
                "simulated" => false,
                "message" => "Đã gửi tin nhắn Zalo OA thành công tới user {$recipientId}!",
                "detail" => $json
            ];
        }

        $errorMsg = $json['message'] ?? "Lỗi không xác định từ Zalo API (Mã: " . ($json['error'] ?? 'N/A') . ")";
        return [
            "success" => false,
            "simulated" => false,
            "message" => "Zalo OA phản hồi lỗi: " . $errorMsg,
            "detail" => $json
        ];
    }

    /**
     * Dispatch via Zalo Notification Service (ZNS Template API).
     */
    private static function sendZnsTemplate(
        string $phone,
        string $templateId,
        string $customerName,
        string $reminderTime,
        string $accessToken
    ): array {
        $endpoint = 'https://business.openapi.zalo.me/message/template';
        $normalizedPhone = self::normalizePhoneNumber($phone);

        $postData = [
            "phone" => $normalizedPhone,
            "template_id" => $templateId,
            "template_data" => [
                "customer_name" => $customerName,
                "reminder_time" => substr($reminderTime, 0, 5),
                "date" => date('d/m/Y')
            ],
            "tracking_id" => "spendmind_" . time() . "_" . bin2hex(random_bytes(4))
        ];

        $response = self::executeHttpRequest($endpoint, $postData, [
            "access_token: {$accessToken}",
            "Content-Type: application/json"
        ]);

        $json = json_decode($response, true);
        if (isset($json['error']) && $json['error'] === 0) {
            return [
                "success" => true,
                "simulated" => false,
                "message" => "Đã gửi tin nhắn ZNS thành công tới SĐT {$normalizedPhone}!",
                "detail" => $json
            ];
        }

        $errorMsg = $json['message'] ?? "Lỗi ZNS (Mã: " . ($json['error'] ?? 'N/A') . ")";
        return [
            "success" => false,
            "simulated" => false,
            "message" => "ZNS phản hồi lỗi: " . $errorMsg,
            "detail" => $json
        ];
    }

    /**
     * Resilient HTTP POST executor with 5s timeout.
     */
    private static function executeHttpRequest(string $url, array $payload, array $headers): string {
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE);

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $jsonPayload,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_SSL_VERIFYPEER => true
            ]);
            $result = curl_exec($ch);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($result === false) {
                throw new Exception("cURL Error: " . $curlError);
            }
            return $result;
        }

        // Fallback using stream context if cURL is absent
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers) . "\r\nContent-Length: " . strlen($jsonPayload) . "\r\n",
                'content' => $jsonPayload,
                'timeout' => 5
            ]
        ]);

        $result = @file_get_contents($url, false, $context);
        if ($result === false) {
            $lastErr = error_get_last();
            throw new Exception("Stream Error: " . ($lastErr['message'] ?? 'Unable to connect to Zalo'));
        }
        return $result;
    }
}
