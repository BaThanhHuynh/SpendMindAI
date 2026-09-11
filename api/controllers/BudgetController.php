<?php
/* ==========================================================================
   SPENDMINDAI - BUDGET CONTROLLER
   Category budget limits management
   ========================================================================== */

class BudgetController {
    private ?PDO $pdo;

    public function __construct(?PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Save category budget limits for a user.
     */
    public function save(int $userId, array $input): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        if (!is_array($input)) {
            sendError("Dữ liệu hạn mức ngân sách không hợp lệ", 400);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                INSERT INTO `budgets` (`user_id`, `category`, `limit_amount`) 
                VALUES (:uid, :category, :limit_amount)
                ON DUPLICATE KEY UPDATE `limit_amount` = :limit_amount_up
            ");

            foreach ($input as $category => $limitAmount) {
                $categoryName = mb_substr(trim((string)$category), 0, 50);
                $amount = max(0, floatval($limitAmount));

                if ($categoryName !== '') {
                    $stmt->execute([
                        ':uid' => $userId,
                        ':category' => $categoryName,
                        ':limit_amount' => $amount,
                        ':limit_amount_up' => $amount
                    ]);
                }
            }

            $this->pdo->commit();
            sendJson(["success" => true, "message" => "Đã lưu hạn mức chi tiêu thành công"]);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            error_log("Budget save error: " . $e->getMessage());
            sendError("Lỗi lưu hạn mức chi tiêu. Vui lòng thử lại sau.", 500);
        }
    }
}
