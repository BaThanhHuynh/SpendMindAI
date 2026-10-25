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

    private const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
    private const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

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

        $history = $this->sanitizeHistory($input['history'] ?? null);

        // Bước 2: bật dịch vụ RAG bằng biến môi trường RAG_URL (+ RAG_INTERNAL_SECRET); chưa đặt thì dùng đường Gemini dưới đây
        $ragUrl = function_exists('getEnvVar') ? getEnvVar('RAG_URL') : getenv('RAG_URL');
        if (!empty($ragUrl)) {
            $this->forwardToRag($ragUrl, $userId, $message, $history, $input['state'] ?? null);
            return;
        }

        $geminiApiKey = function_exists('getEnvVar') ? getEnvVar('GEMINI_API_KEY') : getenv('GEMINI_API_KEY');
        if (empty($geminiApiKey)) {
            sendError("Trợ lý AI chưa được cấu hình GEMINI_API_KEY trong biến môi trường hệ thống.", 503);
            return;
        }

        // Model chính nhanh, rẻ. Biến GEMINI_MODEL (nếu đặt trên Vercel) sẽ ghi đè
        $primaryModel = function_exists('getEnvVar') 
            ? getEnvVar('GEMINI_MODEL', self::PRIMARY_MODEL) 
            : (getenv('GEMINI_MODEL') ?: self::PRIMARY_MODEL);

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
        $prevMonthStart = date('Y-m-01', strtotime('first day of last month'));
        $prevMonthStr = date('m/Y', strtotime('first day of last month'));

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

                // 6. Mọi giao dịch tháng này + tháng trước, nhóm theo tháng → loại → danh mục; số đếm và tổng do code tính
                // ponytail: tối đa 400 dòng gần nhất cho vừa ngữ cảnh — Bước 4 (truy vấn có cấu trúc) thay hẳn phần này
                $tStmt = $pdo->prepare("
                    SELECT type, amount, category, date, description
                    FROM transactions
                    WHERE user_id = :uid AND date >= :p_start AND date <= :m_end
                    ORDER BY date DESC, id DESC
                    LIMIT 400
                ");
                $tStmt->execute([':uid' => $userId, ':p_start' => $prevMonthStart, ':m_end' => $monthEnd]);
                $groups = [];
                foreach ($tStmt->fetchAll(PDO::FETCH_ASSOC) as $t) {
                    $groups[substr($t['date'], 0, 7) . '|' . $t['type'] . '|' . $t['category']][] = $t;
                }
                if (!empty($groups)) {
                    $tLines = [];
                    foreach ($groups as $key => $rows) {
                        [$ym, $type, $cat] = explode('|', $key, 3);
                        $sum = array_sum(array_map(fn($r) => (float)$r['amount'], $rows));
                        $tLines[] = "  [" . substr($ym, 5, 2) . "/" . substr($ym, 0, 4) . "] " . ($type === 'income' ? 'Thu' : 'Chi')
                            . " · " . (self::CATEGORY_LABELS[$cat] ?? $cat) . ": " . count($rows) . " giao dịch, tổng "
                            . number_format($sum, 0, ',', '.') . "đ";
                        foreach ($rows as $r) {
                            $desc = trim((string)$r['description']);
                            $tLines[] = "    - " . date('d/m', strtotime($r['date'])) . " · "
                                . number_format((float)$r['amount'], 0, ',', '.') . "đ" . ($desc !== '' ? " · {$desc}" : "");
                        }
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
            . "5. Giao dịch tháng {$prevMonthStr} và {$monthStr}, nhóm theo danh mục (số giao dịch và tổng đã tính sẵn):\n{$transactionsText}\n\n"
            . "=== QUY TẮC PHẢN HỒI (BẮT BUỘC) ===\n"
            . "1. NGẮN GỌN: trả lời thẳng trong 1-3 câu, không chào hỏi lặp lại, không mở bài hay kết bài sáo rỗng.\n"
            . "2. LIỆT KÊ ĐỦ: khi được hỏi 'chi tiết', 'liệt kê', 'cụ thể', 'gồm những gì', liệt kê ĐỦ mọi giao dịch của đúng nhóm được hỏi ở mục 5, mỗi giao dịch một dòng 'dd/mm · số tiền · ghi chú'. Không bỏ sót, không thêm giao dịch của danh mục khác.\n"
            . "3. CHÍNH XÁC: chỉ dùng số liệu ở trên. Số giao dịch và tổng lấy từ dòng tiêu đề nhóm, không tự đếm hay tự cộng. Dữ liệu không có (ví dụ tháng cũ hơn) thì nói thẳng 'Mình chưa có dữ liệu về ...'.\n"
            . "4. NỐI TIẾP HỘI THOẠI: câu ngắn như 'chi tiết', 'làm lại', 'còn nữa không', 'nó' được hiểu theo các lượt trước.\n"
            . "5. CHỈ ĐỌC DỮ LIỆU: bạn không thể thêm, sửa hay xoá giao dịch. Không bao giờ nói đã cập nhật, đã sửa, đã xoá hay đã chuyển giao dịch. Người dùng muốn sửa thì hướng dẫn họ sửa giao dịch trên dashboard.\n"
            . "6. ĐỊNH DẠNG: in đậm số tiền tổng (ví dụ: **150.000đ**); các dòng liệt kê không cần in đậm.\n"
            . "7. CHỈ TRẢ LỜI TÀI CHÍNH: câu hỏi ngoài lề tài chính cá nhân thì từ chối đúng 1 câu ngắn gọn.";

        $reply = $this->callGeminiApi($primaryModel, $geminiApiKey, $systemInstruction, $history, $message, 9);

        // Model dự phòng có hạn mức riêng (khi model chính bị 429); chờ tối đa 9s + 5s < maxDuration 15s trong vercel.json
        if ($reply === null && $primaryModel !== self::FALLBACK_MODEL) {
            $reply = $this->callGeminiApi(self::FALLBACK_MODEL, $geminiApiKey, $systemInstruction, $history, $message, 5);
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
     * Call Gemini GenerateContent API. $history = các lượt trước, đã lọc bởi sanitizeHistory().
     */
    private function callGeminiApi(string $model, string $apiKey, string $systemInstruction, array $history, string $userMessage, int $timeout): ?string {
        $apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" . urlencode($model) . ":generateContent?key=" . urlencode($apiKey);

        $contents = [];
        foreach ($history as $h) {
            $contents[] = ["role" => $h['role'] === 'bot' ? 'model' : 'user', "parts" => [["text" => $h['text']]]];
        }
        $contents[] = ["role" => "user", "parts" => [["text" => $userMessage]]];

        $generationConfig = [
            "temperature" => 0.2,
            "topP" => 0.8,
            // Đủ cho danh sách vài chục giao dịch; token "suy nghĩ" cũng bị tính vào hạn mức này
            "maxOutputTokens" => 2048
        ];
        if (strpos($model, 'gemini-3') === 0) {
            $generationConfig["thinkingConfig"] = ["thinkingLevel" => "minimal"];
        }

        $payload = json_encode([
            "system_instruction" => [
                "parts" => [
                    ["text" => $systemInstruction]
                ]
            ],
            "contents" => $contents,
            "generationConfig" => $generationConfig
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Content-Type: application/json; charset=UTF-8"
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
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
        $candidate = $resData['candidates'][0] ?? [];
        $text = '';
        foreach ($candidate['content']['parts'] ?? [] as $part) {
            if (empty($part['thought'])) {
                $text .= $part['text'] ?? '';
            }
        }
        $text = trim($text);
        if ($text === '') {
            return null;
        }
        if (($candidate['finishReason'] ?? '') === 'MAX_TOKENS') {
            error_log("Gemini ($model) reply truncated at maxOutputTokens");
            $text .= "\n\n_(Câu trả lời quá dài nên bị cắt. Bạn hỏi hẹp hơn nhé, ví dụ theo một danh mục hoặc một tháng.)_";
        }
        return $text;
    }

    /**
     * Lịch sử từ trình duyệt: tối đa 6 tin gần nhất, xen kẽ user/bot, bắt đầu bằng user và kết thúc bằng bot.
     */
    private function sanitizeHistory($raw): array {
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach (array_slice($raw, -6) as $m) {
            $role = is_array($m) ? ($m['role'] ?? '') : '';
            $text = is_array($m) && is_string($m['text'] ?? null) ? mb_substr(trim($m['text']), 0, 2000) : '';
            $prev = empty($out) ? 'bot' : $out[count($out) - 1]['role'];
            if (!in_array($role, ['user', 'bot'], true) || $text === '' || $role === $prev) {
                continue;
            }
            $out[] = ["role" => $role, "text" => $text];
        }
        if (!empty($out) && $out[count($out) - 1]['role'] === 'user') {
            array_pop($out);
        }
        return $out;
    }

    /**
     * Bước 2: chuyển câu hỏi sang dịch vụ RAG (api/rag/index.py), ký HMAC-SHA256 trên "<timestamp>.<body>".
     * Lỗi thì báo lỗi rõ ràng; tắt RAG bằng cách xoá biến môi trường RAG_URL.
     */
    private function forwardToRag(string $url, int $userId, string $message, array $history, $state): void {
        $secret = function_exists('getEnvVar') ? getEnvVar('RAG_INTERNAL_SECRET') : getenv('RAG_INTERNAL_SECRET');
        if (empty($secret)) {
            sendError("Dịch vụ RAG chưa được cấu hình RAG_INTERNAL_SECRET.", 503);
            return;
        }
        $body = json_encode([
            "user_id" => $userId,
            "message" => $message,
            "history" => $history,
            "state" => $state,
            "today" => date('Y-m-d')
        ], JSON_UNESCAPED_UNICODE);
        $ts = (string)time();

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => [
                "Content-Type: application/json; charset=UTF-8",
                "X-RAG-Timestamp: $ts",
                "X-RAG-Signature: " . hash_hmac('sha256', "$ts.$body", $secret)
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 13,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_SSL_VERIFYPEER => true
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);

        $data = is_string($response) ? json_decode($response, true) : null;
        if ($curlErr || $httpCode !== 200 || !is_string($data['reply'] ?? null)) {
            error_log("RAG forward error ($httpCode): " . ($curlErr ?: substr((string)$response, 0, 300)));
            sendError("Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại sau.", 502);
            return;
        }
        sendJson([
            "success" => true,
            "reply" => $data['reply'],
            "state" => $data['state'] ?? null,
            "proposal" => $data['proposal'] ?? null,
            "meta" => $data['meta'] ?? null
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

