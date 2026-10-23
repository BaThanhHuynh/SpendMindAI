<?php
/* ==========================================================================
   SPENDMINDAI - CHATBOT CONTROLLER (OPTIMIZED FOR HIGH SPEED & ACCURACY)
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

        if (mb_strlen($message) > 1000) {
            sendError("Câu hỏi quá dài. Vui lòng tóm tắt dưới 1000 ký tự để tối ưu tốc độ xử lý.", 400);
            return;
        }

        $geminiApiKey = function_exists('getEnvVar') ? getEnvVar('GEMINI_API_KEY') : getenv('GEMINI_API_KEY');
        if (empty($geminiApiKey)) {
            sendError("Trợ lý AI chưa được cấu hình GEMINI_API_KEY trong biến môi trường hệ thống.", 503);
            return;
        }

        // Fast low-latency model (gemini-2.5-flash-lite averages ~1.2s vs 50s+ on heavy models)
        $primaryModel = function_exists('getEnvVar') 
            ? getEnvVar('GEMINI_MODEL', 'gemini-2.5-flash-lite') 
            : (getenv('GEMINI_MODEL') ?: 'gemini-2.5-flash-lite');

        // Pre-compute user financial statistics with high-performance SQL
        $displayName = "bạn";
        $currentBalance = 0.0;
        $allTimeIncome = 0.0;
        $allTimeExpense = 0.0;
        $monthIncome = 0.0;
        $monthExpense = 0.0;
        $monthNet = 0.0;
        $catSummaryText = "  • Chưa phát sinh chi tiêu tháng này.";
        $budgetSummaryText = "  • Chưa thiết lập ngân sách.";
        $transactionsText = "  • Chưa ghi nhận giao dịch nào.";

        $todayStr = date('d/m/Y');
        $monthStr = date('m/Y');
        $monthStart = date('Y-m-01');
        $monthEnd = date('Y-m-t');

        if ($pdo) {
            try {
                // 1. Get username
                $userStmt = $pdo->prepare("SELECT username FROM users WHERE id = :uid LIMIT 1");
                $userStmt->execute([':uid' => $userId]);
                $uRow = $userStmt->fetch(PDO::FETCH_ASSOC);
                if ($uRow && !empty($uRow['username'])) {
                    $displayName = $this->sanitizeDisplayName($uRow['username']);
                }

                // 2. Exact All-time Net Balance (Sum of Income - Sum of Expense)
                $totStmt = $pdo->prepare("
                    SELECT 
                        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
                        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
                    FROM transactions 
                    WHERE user_id = :uid
                ");
                $totStmt->execute([':uid' => $userId]);
                $totRow = $totStmt->fetch(PDO::FETCH_ASSOC);
                $allTimeIncome = (float)($totRow['total_income'] ?? 0);
                $allTimeExpense = (float)($totRow['total_expense'] ?? 0);
                $currentBalance = $allTimeIncome - $allTimeExpense;

                // 3. Current Month Income vs Expense
                $mStmt = $pdo->prepare("
                    SELECT 
                        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS m_income,
                        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS m_expense
                    FROM transactions 
                    WHERE user_id = :uid AND date >= :m_start AND date <= :m_end
                ");
                $mStmt->execute([':uid' => $userId, ':m_start' => $monthStart, ':m_end' => $monthEnd]);
                $mRow = $mStmt->fetch(PDO::FETCH_ASSOC);
                $monthIncome = (float)($mRow['m_income'] ?? 0);
                $monthExpense = (float)($mRow['m_expense'] ?? 0);
                $monthNet = $monthIncome - $monthExpense;

                // 4. Current Month Spending by Category
                $catStmt = $pdo->prepare("
                    SELECT category, SUM(amount) AS cat_spent, COUNT(*) AS cat_count
                    FROM transactions 
                    WHERE user_id = :uid AND type = 'expense' AND date >= :m_start AND date <= :m_end
                    GROUP BY category
                    ORDER BY cat_spent DESC
                ");
                $catStmt->execute([':uid' => $userId, ':m_start' => $monthStart, ':m_end' => $monthEnd]);
                $catList = $catStmt->fetchAll(PDO::FETCH_ASSOC);
                $catSpentMap = [];
                if (!empty($catList)) {
                    $catLines = [];
                    foreach ($catList as $c) {
                        $cName = self::CATEGORY_LABELS[$c['category']] ?? $c['category'];
                        $sAmount = (float)$c['cat_spent'];
                        $catSpentMap[$c['category']] = $sAmount;
                        $catLines[] = "  • {$cName}: " . number_format($sAmount, 0, ',', '.') . "đ ({$c['cat_count']} giao dịch)";
                    }
                    $catSummaryText = implode("\n", $catLines);
                }

                // 5. Budgets & Real-time Progress this month
                $bStmt = $pdo->prepare("SELECT category, limit_amount FROM budgets WHERE user_id = :uid");
                $bStmt->execute([':uid' => $userId]);
                $bList = $bStmt->fetchAll(PDO::FETCH_ASSOC);
                if (!empty($bList)) {
                    $bLines = [];
                    foreach ($bList as $b) {
                        $limit = (float)$b['limit_amount'];
                        if ($limit > 0) {
                            $catLabel = self::CATEGORY_LABELS[$b['category']] ?? $b['category'];
                            $spent = $catSpentMap[$b['category']] ?? 0.0;
                            $pct = round(($spent / $limit) * 100, 1);
                            if ($spent > $limit) {
                                $over = $spent - $limit;
                                $bLines[] = "  • $catLabel: Đã chi " . number_format($spent, 0, ',', '.') . "đ / Hạn mức " . number_format($limit, 0, ',', '.') . "đ [ĐÃ VƯỢT " . number_format($over, 0, ',', '.') . "đ ({$pct}%)]";
                            } else {
                                $remain = $limit - $spent;
                                $bLines[] = "  • $catLabel: Đã chi " . number_format($spent, 0, ',', '.') . "đ / Hạn mức " . number_format($limit, 0, ',', '.') . "đ [Còn lại: " . number_format($remain, 0, ',', '.') . "đ ({$pct}%)]";
                            }
                        }
                    }
                    if (!empty($bLines)) {
                        $budgetSummaryText = implode("\n", $bLines);
                    }
                }

                // 6. 15 Most Recent Transactions (drastically reduces tokens & eliminates noise)
                $tStmt = $pdo->prepare("
                    SELECT type, amount, category, date, description 
                    FROM transactions 
                    WHERE user_id = :uid 
                    ORDER BY date DESC, id DESC 
                    LIMIT 15
                ");
                $tStmt->execute([':uid' => $userId]);
                $tList = $tStmt->fetchAll(PDO::FETCH_ASSOC);
                if (!empty($tList)) {
                    $tLines = [];
                    foreach ($tList as $t) {
                        $sign = ($t['type'] === 'income') ? '(+Thu)' : '(-Chi)';
                        $catLabel = self::CATEGORY_LABELS[$t['category']] ?? $t['category'];
                        $desc = !empty($t['description']) ? " - Ghi chú: " . trim($t['description']) : "";
                        $amountFormatted = number_format((float)$t['amount'], 0, ',', '.');
                        $tLines[] = "  • Ngày {$t['date']}: $sign {$amountFormatted}đ | $catLabel$desc";
                    }
                    $transactionsText = implode("\n", $tLines);
                }
            } catch (Throwable $e) {
                error_log("Chatbot financial context error: " . $e->getMessage());
            }
        }

        // Format concise, high-density system instruction
        $formattedBalance = number_format($currentBalance, 0, ',', '.') . 'đ';
        $formattedIncomeAll = number_format($allTimeIncome, 0, ',', '.') . 'đ';
        $formattedExpenseAll = number_format($allTimeExpense, 0, ',', '.') . 'đ';
        $formattedMIncome = number_format($monthIncome, 0, ',', '.') . 'đ';
        $formattedMExpense = number_format($monthExpense, 0, ',', '.') . 'đ';
        $formattedMNet = ($monthNet >= 0 ? '+' : '') . number_format($monthNet, 0, ',', '.') . 'đ';

        $systemInstruction = "Bạn là trợ lý tài chính thông minh SpendMindAI của '{$displayName}'. Hôm nay là {$todayStr}.\n\n"
            . "=== DỮ LIỆU TÀI CHÍNH THỰC TẾ (TÍNH TỪ CƠ SỞ DỮ LIỆU) ===\n"
            . "1. Số dư ròng tích lũy hiện tại: {$formattedBalance} (Tổng thu: {$formattedIncomeAll} | Tổng chi: {$formattedExpenseAll})\n"
            . "2. Tháng này ({$monthStr}):\n"
            . "   - Tổng thu nhập: {$formattedMIncome}\n"
            . "   - Tổng chi tiêu: {$formattedMExpense}\n"
            . "   - Dòng tiền ròng: {$formattedMNet}\n"
            . "3. Chi tiêu từng danh mục tháng {$monthStr}:\n{$catSummaryText}\n"
            . "4. Tình hình ngân sách tháng {$monthStr}:\n{$budgetSummaryText}\n"
            . "5. 15 giao dịch gần đây nhất:\n{$transactionsText}\n\n"
            . "=== QUY TẮC PHẢN HỒI (BẮT BUỘC) ===\n"
            . "1. CỰC KỲ NGẮN GỌN & ĐÚNG TRỌNG TÂM: Hỏi gì đáp nấy trong 1-3 câu hoặc bảng/danh sách ngắn. Tuyệt đối KHÔNG chào hỏi lặp lại ('Xin chào...', 'Chào bạn...'), KHÔNG mở bài dài dòng ('Theo dữ liệu...'), KHÔNG kết bài sáo rỗng ('Chúc bạn...').\n"
            . "2. CHÍNH XÁC TUYỆT ĐỐI: Dùng đúng các con số đã được tính sẵn ở trên, không tự tính nhẩm sai lệch, không bịa số liệu.\n"
            . "3. ĐỊNH DẠNG RÕ RÀNG: In đậm các con số tiền (ví dụ: **150.000đ**).\n"
            . "4. CHỈ TRẢ LỜI TÀI CHÍNH: Nếu câu hỏi ngoài lề không liên quan tài chính cá nhân, từ chối đúng 1 câu ngắn gọn.";

        $reply = $this->callGeminiApi($primaryModel, $geminiApiKey, $systemInstruction, $message);

        // Fallback to gemini-2.5-flash if primary model encountered an issue
        if ($reply === null && $primaryModel !== 'gemini-2.5-flash') {
            $reply = $this->callGeminiApi('gemini-2.5-flash', $geminiApiKey, $systemInstruction, $message);
        }

        if ($reply === null || $reply === '') {
            sendError("Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại sau.", 502);
            return;
        }

        sendJson([
            "success" => true,
            "reply" => $reply
        ]);
    }

    /**
     * Call Gemini GenerateContent API with low latency & strict token limits.
     */
    private function callGeminiApi(string $model, string $apiKey, string $systemInstruction, string $userMessage): ?string {
        $apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" . urlencode($model) . ":generateContent?key=" . urlencode($apiKey);

        $payload = json_encode([
            "system_instruction" => [
                "parts" => [
                    ["text" => $systemInstruction]
                ]
            ],
            "contents" => [
                [
                    "parts" => [
                        ["text" => $userMessage]
                    ]
                ]
            ],
            "generationConfig" => [
                "temperature" => 0.2,
                "topP" => 0.8,
                "maxOutputTokens" => 350
            ]
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Content-Type: application/json; charset=UTF-8"
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            error_log("Gemini cURL ($model) error: " . $curlErr);
            return null;
        }

        if ($httpCode !== 200 || empty($response)) {
            error_log("Gemini API ($model) HTTP error ($httpCode): " . substr((string)$response, 0, 300));
            return null;
        }

        $resData = json_decode($response, true);
        $text = $resData['candidates'][0]['content']['parts'][0]['text'] ?? '';
        return trim($text) !== '' ? trim($text) : null;
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

