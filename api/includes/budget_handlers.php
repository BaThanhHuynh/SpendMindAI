<?php
/* ==========================================================================
   BUDGET LIMITS ACTION HANDLERS (save_budgets)
   ========================================================================== */

if (!defined('PDO_CONNECT_VERIFIED')) {
    exit("Access Denied");
}

if ($action === 'save_budgets' && $method === 'POST') {
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Hạn mức ngân sách không hợp lệ"]);
        exit();
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            INSERT INTO `budgets` (`user_id`, `category`, `limit_amount`) 
            VALUES (:uid, :category, :limit_amount)
            ON DUPLICATE KEY UPDATE `limit_amount` = :limit_amount_up
        ");

        foreach ($input as $category => $limitAmount) {
            $stmt->execute([
                ':uid' => $userId,
                ':category' => $category,
                ':limit_amount' => $limitAmount,
                ':limit_amount_up' => $limitAmount
            ]);
        }

        $pdo->commit();
        echo json_encode(["success" => true, "message" => "Đã lưu hạn mức chi tiêu thành công"]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Lỗi lưu hạn mức MySQL: " . $e->getMessage()]);
    }
    exit();
}
