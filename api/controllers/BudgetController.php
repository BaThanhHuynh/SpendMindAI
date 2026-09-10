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
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Cơ sở dữ liệu chưa sẵn sàng"]);
            exit();
        }

        if (!is_array($input)) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Dữ liệu hạn mức ngân sách không hợp lệ"]);
            exit();
        }

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                INSERT INTO `budgets` (`user_id`, `category`, `limit_amount`) 
                VALUES (:uid, :category, :limit_amount)
                ON DUPLICATE KEY UPDATE `limit_amount` = :limit_amount_up
            ");

            foreach ($input as $category => $limitAmount) {
                $categoryName = trim((string)$category);
                $amount = floatval($limitAmount);

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
            echo json_encode(["success" => true, "message" => "Đã lưu hạn mức chi tiêu thành công"]);
            exit();

        } catch (PDOException $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi lưu hạn mức MySQL: " . $e->getMessage()]);
            exit();
        }
    }
}
