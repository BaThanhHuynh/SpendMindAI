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
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        try {
            // Fetch user transactions using composite index
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

            sendJson([
                "success" => true,
                "authenticated" => true,
                "username" => $_SESSION['username'] ?? '',
                "transactions" => $transactions,
                "budgets" => $budgets
            ]);
        } catch (Throwable $e) {
            error_log("Transaction list error: " . $e->getMessage());
            sendError("Không thể tải danh sách giao dịch. Vui lòng thử lại sau.", 500);
        }
    }

    /**
     * Save or update a financial transaction.
     */
    public function save(int $userId, array $input): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        if (
            empty($input['id']) || empty($input['type']) ||
            !isset($input['amount']) || empty($input['category']) || empty($input['date'])
        ) {
            sendError("Dữ liệu giao dịch thiếu trường bắt buộc", 400);
            return;
        }

        $id = trim((string)$input['id']);
        if (strlen($id) > 50 || !preg_match('/^[a-zA-Z0-9_-]+$/', $id)) {
            sendError("Mã giao dịch không hợp lệ", 400);
            return;
        }

        $type = ($input['type'] === 'income') ? 'income' : 'expense';
        $amount = abs(floatval($input['amount']));
        if ($amount <= 0) {
            sendError("Số tiền giao dịch phải lớn hơn 0", 400);
            return;
        }

        $category = mb_substr(trim((string)$input['category']), 0, 50);
        $date = trim((string)$input['date']);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            sendError("Định dạng ngày không hợp lệ (YYYY-MM-DD)", 400);
            return;
        }

        $description = isset($input['description']) ? mb_substr(trim((string)$input['description']), 0, 500) : '';

        try {
            // Verify ownership if record exists
            $stmt = $this->pdo->prepare("SELECT `user_id` FROM `transactions` WHERE `id` = :id");
            $stmt->execute([':id' => $id]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existing && intval($existing['user_id']) !== $userId) {
                sendError("Bạn không có quyền chỉnh sửa giao dịch này", 403);
                return;
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

            sendJson(["success" => true, "message" => "Đã ghi nhận giao dịch thành công"]);
        } catch (Throwable $e) {
            error_log("Transaction save error: " . $e->getMessage());
            sendError("Lỗi ghi nhận giao dịch. Vui lòng thử lại sau.", 500);
        }
    }

    /**
     * Delete a single transaction.
     */
    public function delete(int $userId, array $input): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        if (empty($input['id'])) {
            sendError("Thiếu ID giao dịch cần xóa", 400);
            return;
        }

        $id = trim((string)$input['id']);

        try {
            $stmt = $this->pdo->prepare("DELETE FROM `transactions` WHERE `id` = :id AND `user_id` = :uid");
            $stmt->execute([':id' => $id, ':uid' => $userId]);

            if ($stmt->rowCount() > 0) {
                sendJson(["success" => true, "message" => "Đã xóa giao dịch thành công"]);
            } else {
                sendError("Giao dịch không tồn tại hoặc bạn không có quyền xóa", 404);
            }
        } catch (Throwable $e) {
            error_log("Transaction delete error: " . $e->getMessage());
            sendError("Lỗi xóa giao dịch. Vui lòng thử lại sau.", 500);
        }
    }

    /**
     * Clear all user transactions and budget limits.
     */
    public function clearAll(int $userId): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("DELETE FROM `transactions` WHERE `user_id` = :uid");
            $stmt->execute([':uid' => $userId]);

            $stmt = $this->pdo->prepare("DELETE FROM `budgets` WHERE `user_id` = :uid");
            $stmt->execute([':uid' => $userId]);

            $this->pdo->commit();
            sendJson(["success" => true, "message" => "Đã xóa toàn bộ dữ liệu giao dịch và ngân sách thành công."]);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            error_log("Transaction clearAll error: " . $e->getMessage());
            sendError("Lỗi xóa dữ liệu. Vui lòng thử lại sau.", 500);
        }
    }
}
