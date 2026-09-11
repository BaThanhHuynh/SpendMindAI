<?php
/* ==========================================================================
   SPENDMINDAI - CHATBOT CONTROLLER
   Secure Server-side Google Gemini AI Integration for Financial Advisory
   ========================================================================== */

class ChatbotController {

    private const CATEGORY_LABELS = [
        "food" => "Ăn uống",
        "transport" => "Di chuyển",
        "shopping" => "Mua sắm",
        "entertainment" => "Giải trí",
        "home" => "Nhà cửa",
        "other_expense" => "Khác (Chi)",
        "salary" => "Lương",
        "freelance" => "Freelance",
        "investment" => "Đầu tư",
        "gift" => "Được tặng / Khác"
    ];

    /**
     * Handle incoming user message and proxy to Gemini API server-to-server.
     */
    public function handleChat(int $userId, array $input, ?PDO $pdo): void {
        $message = trim((string)($input['message'] ?? ''));
        if ($message === '') {
            sendError("Nội dung câu hỏi không được để trống", 400);
            return;
        }

        if (mb_strlen($message) > 2000) {
            sendError("Câu hỏi quá dài. Vui lòng tóm tắt dưới 2000 ký tự.", 400);
            return;
        }

        $geminiApiKey = function_exists('getEnvVar') ? getEnvVar('GEMINI_API_KEY') : getenv('GEMINI_API_KEY');
        if (empty($geminiApiKey)) {
            sendError("Trợ lý AI chưa được cấu hình GEMINI_API_KEY trong biến môi trường hệ thống.", 503);
            return;
        }

        $model = function_exists('getEnvVar') 
            ? getEnvVar('GEMINI_MODEL', 'gemini-3.1-flash-lite') 
            : (getenv('GEMINI_MODEL') ?: 'gemini-3.1-flash-lite');

        // Fetch user financial context from database
        $budgetsText = "- Chưa thiết lập hạn mức ngân sách nào.\n";
        $transactionsText = "- Chưa ghi nhận giao dịch nào.\n";
        $displayName = "bạn";

        if ($pdo) {
            try {
                // 1. Get username
                $userStmt = $pdo->prepare("SELECT username FROM users WHERE id = :uid LIMIT 1");
                $userStmt->execute([':uid' => $userId]);
                $uRow = $userStmt->fetch(PDO::FETCH_ASSOC);
                if ($uRow && !empty($uRow['username'])) {
                    $displayName = $this->sanitizeDisplayName($uRow['username']);
                }

                // 2. Get budgets
                $bStmt = $pdo->prepare("SELECT category, limit_amount FROM budgets WHERE user_id = :uid");
                $bStmt->execute([':uid' => $userId]);
                $bList = $bStmt->fetchAll(PDO::FETCH_ASSOC);
                if (!empty($bList)) {
                    $bLines = [];
                    foreach ($bList as $b) {
                        $limit = (float)$b['limit_amount'];
                        if ($limit > 0) {
                            $catLabel = self::CATEGORY_LABELS[$b['category']] ?? $b['category'];
                            $bLines[] = "- Hạng mục $catLabel: " . number_format($limit, 0, ',', '.') . "đ";
                        }
                    }
                    if (!empty($bLines)) {
                        $budgetsText = implode("\n", $bLines) . "\n";
                    }
                }

                // 3. Get recent 60 transactions
                $tStmt = $pdo->prepare("
                    SELECT type, amount, category, date, description 
                    FROM transactions 
                    WHERE user_id = :uid 
                    ORDER BY date DESC, id DESC 
                    LIMIT 60
                ");
                $tStmt->execute([':uid' => $userId]);
                $tList = $tStmt->fetchAll(PDO::FETCH_ASSOC);
                if (!empty($tList)) {
                    $tLines = [];
                    foreach ($tList as $t) {
                        $typeLabel = ($t['type'] === 'income') ? 'Thu nhập (+)' : 'Chi tiêu (-)';
                        $catLabel = self::CATEGORY_LABELS[$t['category']] ?? $t['category'];
                        $desc = !empty($t['description']) ? " - Ghi chú: " . trim($t['description']) : "";
                        $amountFormatted = number_format((float)$t['amount'], 0, ',', '.');
                        $tLines[] = "- Ngày {$t['date']}: $typeLabel | {$amountFormatted}đ | Danh mục: $catLabel$desc";
                    }
                    if (!empty($tLines)) {
                        $transactionsText = implode("\n", $tLines) . "\n";
                    }
                }
            } catch (Throwable $e) {
                error_log("Chatbot financial context error: " . $e->getMessage());
            }
        }

        $nowStr = date('d/m/Y H:i:s');
        $systemPrompt = "Bạn là trợ lý tài chính ảo SpendMindAI thông thái, thân thiện và nhiệt tình của người dùng tên là '{$displayName}'.\n\n";
        $systemPrompt .= "Dưới đây là thông tin tài chính hiện tại của họ lấy từ cơ sở dữ liệu hệ thống:\n\n";
        $systemPrompt .= "### [DANH SÁCH NGÂN SÁCH/HẠN MỨC CHI TIÊU HÀNG THÁNG]\n" . $budgetsText . "\n";
        $systemPrompt .= "### [LỊCH SỬ 60 GIAO DỊCH GẦN NHẤT]\n" . $transactionsText . "\n";
        $systemPrompt .= "### [CẤU HÌNH THỜI GIAN]\n";
        $systemPrompt .= "- Thời gian hiện tại trên hệ thống: {$nowStr}\n\n";
        $systemPrompt .= "Nhiệm vụ của bạn:\n";
        $systemPrompt .= "1. Trả lời câu hỏi của người dùng thật ngắn gọn, súc tích, đi thẳng vào trọng tâm, hỏi gì đáp nấy (không trả lời lan man dài dòng, không giải thích vòng vo).\n";
        $systemPrompt .= "2. CHỈ trả lời và tư vấn các câu hỏi trong phạm vi thông tin tài chính cá nhân được cung cấp ở trên (thu nhập, chi tiêu, số dư, ngân sách, phân tích tài chính). Đối với các câu hỏi ngoài lề hoặc ngoài phạm vi hệ thống, bạn phải lịch sự từ chối trả lời và hướng người dùng hỏi về tài chính cá nhân.\n";
        $systemPrompt .= "3. Tuyệt đối không bịa đặt số liệu hay tự tạo ra thông tin không có trong danh sách giao dịch hay ngân sách được cung cấp. Luôn nói đúng sự thật khách quan của dữ liệu.\n";
        $systemPrompt .= "4. Sử dụng tiếng Việt chuẩn, định dạng markdown gọn đẹp (bảng, danh sách gạch đầu dòng, chữ in đậm) khi trình bày dữ liệu.\n\n";
        $systemPrompt .= "Câu hỏi của người dùng: \"" . addcslashes($message, "\"\\") . "\"\n\n";
        $systemPrompt .= "Trả lời:";

        $apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" . urlencode($model) . ":generateContent?key=" . urlencode($geminiApiKey);

        $payload = json_encode([
            "contents" => [
                [
                    "parts" => [
                        ["text" => $systemPrompt]
                    ]
                ]
            ]
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            error_log("Gemini cURL error: " . $curlErr);
            sendError("Không thể kết nối đến máy chủ AI (Timeout). Vui lòng thử lại sau.", 504);
            return;
        }

        $resData = json_decode($response, true);
        if ($httpCode !== 200 || empty($resData)) {
            $errMsg = $resData['error']['message'] ?? "Lỗi gọi API Google AI ($httpCode)";
            error_log("Gemini API error ($httpCode): " . $errMsg);
            if ($httpCode === 429) {
                sendError("Hệ thống AI đang quá tải lượt gọi (Rate Limit). Vui lòng đợi trong giây lát và thử lại.", 429);
            } else {
                sendError("Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại sau.", 502);
            }
            return;
        }

        $reply = $resData['candidates'][0]['content']['parts'][0]['text'] ?? '';
        if ($reply === '') {
            sendError("Không nhận được nội dung phản hồi từ AI.", 502);
            return;
        }

        sendJson([
            "success" => true,
            "reply" => $reply
        ]);
    }

    /**
     * Backward-compatibility stub: deprecate exposing raw key.
     */
    public function getGeminiKey(): void {
        sendError("Tính năng get_gemini_key đã bị loại bỏ vì lý do bảo mật. Vui lòng sử dụng action 'chat'.", 403);
    }

    private function sanitizeDisplayName(string $raw): string {
        $name = trim($raw);
        if (strpos($name, '@') !== false) {
            $name = explode('@', $name)[0];
        }
        if (preg_match('/^[a-z0-9._-]+$/i', $name)) {
            $name = preg_replace('/\d+$/', '', $name);
            $name = str_replace(['.', '_', '-'], ' ', $name);
            $name = ucwords(trim($name));
        }
        if (mb_strtolower($name) === 'huynhbathanh' || mb_strtolower($name) === 'huynh bathanh') {
            return 'Bá Thành';
        }
        return $name ?: 'bạn';
    }
}
