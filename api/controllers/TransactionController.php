<?php
/* ==========================================================================
   SPENDMINDAI - TRANSACTION CONTROLLER
   Full CRUD operations for User Financial Transactions & Budgets
   ========================================================================== */

class TransactionController {
    private ?PDO $pdo;

    public function __construct(?PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * List all transactions and budget limits for the current user.
     */
    public function list(int $userId): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Cơ sở dữ liệu chưa sẵn sàng"]);
            exit();
        }

        try {
            // Fetch user transactions
            $stmt = $this->pdo->prepare("
                SELECT `id`, `type`, `amount`, `category`, `date`, `description` 
                FROM `transactions` 
                WHERE `user_id` = :uid 
                ORDER BY `date` DESC, `id` DESC
            ");
            $stmt->execute([':uid' => $userId]);
            $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($transactions as &$t) {
                $t['amount'] = floatval($t['amount']);
            }

            // Fetch user budgets
            $stmt = $this->pdo->prepare("SELECT `category`, `limit_amount` FROM `budgets` WHERE `user_id` = :uid");
            $stmt->execute([':uid' => $userId]);
            $budgetList = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $budgets = [];
            foreach ($budgetList as $b) {
                $budgets[$b['category']] = floatval($b['limit_amount']);
            }

            echo json_encode([
                "success" => true,
                "authenticated" => true,
                "username" => $_SESSION['username'] ?? '',
                "transactions" => $transactions,
                "budgets" => $budgets
            ]);
            exit();

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi truy vấn CSDL: " . $e->getMessage()]);
            exit();
        }
    }

    /**
     * Save or update a financial transaction.
     */
    public function save(int $userId, array $input): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Cơ sở dữ liệu chưa sẵn sàng"]);
            exit();
        }

        if (
            empty($input['id']) || empty($input['type']) ||
            empty($input['amount']) || empty($input['category']) || empty($input['date'])
        ) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Dữ liệu giao dịch thiếu trường bắt buộc"]);
            exit();
        }

        $id = trim($input['id']);
        $type = in_array($input['type'], ['income', 'expense']) ? $input['type'] : 'expense';
        $amount = floatval($input['amount']);
        $category = trim($input['category']);
        $date = trim($input['date']);
        $description = isset($input['description']) ? trim($input['description']) : '';

        try {
            // Verify ownership if record exists
            $stmt = $this->pdo->prepare("SELECT `user_id` FROM `transactions` WHERE `id` = :id");
            $stmt->execute([':id' => $id]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existing && intval($existing['user_id']) !== $userId) {
                http_response_code(403);
                echo json_encode(["success" => false, "message" => "Bạn không có quyền chỉnh sửa giao dịch này"]);
                exit();
            }

            $stmt = $this->pdo->prepare("
                INSERT INTO `transactions` (`id`, `user_id`, `type`, `amount`, `category`, `date`, `description`) 
                VALUES (:id, :uid, :type, :amount, :category, :date, :description)
                ON DUPLICATE KEY UPDATE 
                    `type` = :type_up, 
                    `amount` = :amount_up, 
                    `category` = :category_up, 
                    `date` = :date_up, 
                    `description` = :description_up
            ");

            $stmt->execute([
                ':id' => $id,
                ':uid' => $userId,
                ':type' => $type,
                ':amount' => $amount,
                ':category' => $category,
                ':date' => $date,
                ':description' => $description,

                ':type_up' => $type,
                ':amount_up' => $amount,
                ':category_up' => $category,
                ':date_up' => $date,
                ':description_up' => $description
            ]);

            echo json_encode(["success" => true, "message" => "Đã ghi nhận giao dịch thành công"]);
            exit();

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi ghi nhận giao dịch MySQL: " . $e->getMessage()]);
            exit();
        }
    }

    /**
     * Delete a single transaction.
     */
    public function delete(int $userId, array $input): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Cơ sở dữ liệu chưa sẵn sàng"]);
            exit();
        }

        if (empty($input['id'])) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Thiếu ID giao dịch cần xóa"]);
            exit();
        }

        $id = trim($input['id']);

        try {
            $stmt = $this->pdo->prepare("DELETE FROM `transactions` WHERE `id` = :id AND `user_id` = :uid");
            $stmt->execute([':id' => $id, ':uid' => $userId]);

            if ($stmt->rowCount() > 0) {
                echo json_encode(["success" => true, "message" => "Đã xóa giao dịch thành công"]);
            } else {
                http_response_code(404);
                echo json_encode(["success" => false, "message" => "Giao dịch không tồn tại hoặc bạn không có quyền xóa"]);
            }
            exit();

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi xóa giao dịch MySQL: " . $e->getMessage()]);
            exit();
        }
    }

    /**
     * Clear all user transactions and budget limits.
     */
    public function clearAll(int $userId): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Cơ sở dữ liệu chưa sẵn sàng"]);
            exit();
        }

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("DELETE FROM `transactions` WHERE `user_id` = :uid");
            $stmt->execute([':uid' => $userId]);

            $stmt = $this->pdo->prepare("DELETE FROM `budgets` WHERE `user_id` = :uid");
            $stmt->execute([':uid' => $userId]);

            $this->pdo->commit();
            echo json_encode(["success" => true, "message" => "Đã xóa toàn bộ dữ liệu giao dịch và ngân sách thành công."]);
            exit();

        } catch (PDOException $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi xóa dữ liệu MySQL: " . $e->getMessage()]);
            exit();
        }
    }
}
