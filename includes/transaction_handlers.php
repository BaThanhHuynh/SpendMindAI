<?php
/* ==========================================================================
   TRANSACTION CRUD ACTIONS (GET list, save_transaction, delete_transaction, clear_all_data)
   ========================================================================== */

if (!defined('PDO_CONNECT_VERIFIED')) {
    exit("Access Denied");
}

if ($method === 'GET') {
    // Fetch user transactions & budgets
    try {
        $stmt = $pdo->prepare("SELECT * FROM `transactions` WHERE `user_id` = :uid ORDER BY `date` DESC, `id` DESC");
        $stmt->execute([':uid' => $userId]);
        $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($transactions as &$t) {
            $t['amount'] = floatval($t['amount']);
        }

        // Fetch User Budgets
        $stmt = $pdo->prepare("SELECT * FROM `budgets` WHERE `user_id` = :uid");
        $stmt->execute([':uid' => $userId]);
        $budgetList = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $budgets = [];
        foreach ($budgetList as $b) {
            $budgets[$b['category']] = floatval($b['limit_amount']);
        }

        echo json_encode([
            "success" => true,
            "authenticated" => true,
            "username" => $_SESSION['username'],
            "transactions" => $transactions,
            "budgets" => $budgets
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Lỗi kết xuất dữ liệu MySQL: " . $e->getMessage()]);
    }
    exit();
}

if ($method === 'POST') {
    if ($action === 'save_transaction') {
        if (
            empty($input['id']) || empty($input['type']) ||
            empty($input['amount']) || empty($input['category']) || empty($input['date'])
        ) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Dữ liệu giao dịch thiếu trường bắt buộc"]);
            exit();
        }

        try {
            // Check if transaction exists and belongs to someone else
            $stmt = $pdo->prepare("SELECT user_id FROM `transactions` WHERE `id` = :id");
            $stmt->execute([':id' => $input['id']]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existing && intval($existing['user_id']) !== $userId) {
                http_response_code(403);
                echo json_encode(["success" => false, "message" => "Không có quyền sửa giao dịch này"]);
                exit();
            }

            $stmt = $pdo->prepare("
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
                ':id' => $input['id'],
                ':uid' => $userId,
                ':type' => $input['type'],
                ':amount' => $input['amount'],
                ':category' => $input['category'],
                ':date' => $input['date'],
                ':description' => isset($input['description']) ? $input['description'] : '',

                ':type_up' => $input['type'],
                ':amount_up' => $input['amount'],
                ':category_up' => $input['category'],
                ':date_up' => $input['date'],
                ':description_up' => isset($input['description']) ? $input['description'] : ''
            ]);

            echo json_encode(["success" => true, "message" => "Đã ghi nhận giao dịch thành công"]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi ghi giao dịch MySQL: " . $e->getMessage()]);
        }
        exit();
    }

    if ($action === 'delete_transaction') {
        if (empty($input['id'])) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Thiếu ID giao dịch để xóa"]);
            exit();
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM `transactions` WHERE `id` = :id AND `user_id` = :uid");
            $stmt->execute([':id' => $input['id'], ':uid' => $userId]);

            if ($stmt->rowCount() > 0) {
                echo json_encode(["success" => true, "message" => "Đã xóa giao dịch thành công"]);
            } else {
                http_response_code(404);
                echo json_encode(["success" => false, "message" => "Giao dịch không tồn tại hoặc bạn không có quyền xóa"]);
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi MySQL: " . $e->getMessage()]);
        }
        exit();
    }

    if ($action === 'clear_all_data') {
        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare("DELETE FROM `transactions` WHERE `user_id` = :uid");
            $stmt->execute([':uid' => $userId]);

            $stmt = $pdo->prepare("DELETE FROM `budgets` WHERE `user_id` = :uid");
            $stmt->execute([':uid' => $userId]);

            $pdo->commit();
            echo json_encode(["success" => true, "message" => "Xóa toàn bộ dữ liệu thành công."]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi MySQL: " . $e->getMessage()]);
        }
        exit();
    }
}
