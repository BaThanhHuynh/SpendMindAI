<?php
/* ==========================================================================
   REMINDER UTILITY FUNCTIONS - SHARED BY LAZY CRON & SYSTEM CRON
   ========================================================================== */

require_once __DIR__ . '/mailer.php';

/**
 * Gửi email nhắc nhở tự động cho người dùng.
 *
 * @param array $user Thông tin người dùng từ CSDL
 * @param string $appUrl Đường dẫn ứng dụng
 * @param PDO $pdo Kết nối CSDL
 * @return array Kết quả gửi email
 */
function sendReminderEmailToUser($user, $appUrl, $pdo)
{
    $userId = intval($user['id']);
    $today = date('Y-m-d');
    
    // Select a funny financial meme quote based on the reminder hour
    $reminderHour = intval(substr($user['reminder_time'], 0, 2));
    $memeTitle = "💡 Nhắc nhở từ ví tiền của bạn:";
    
    if ($reminderHour >= 5 && $reminderHour < 12) {
        $memes = [
            "Chào buổi sáng! Húp nhẹ bát phở 50k xong thì nhớ ghi vào sổ nhé, kẻo cuối tháng lại thắc mắc tiền đi đâu như một cơn gió.",
            "Sáng ra làm ly cà phê 35k tỉnh táo rồi thì nhập sổ đi bạn. Cà phê giúp tỉnh táo, còn nhập sổ giúp tỉnh ngộ!",
            "Bình minh ơi dậy chưa? Dậy rồi thì nhớ ghi chi tiêu bữa sáng đi nhé. Đừng để ví tiền của bạn cũng trôi về nơi xa."
        ];
    } elseif ($reminderHour >= 12 && $reminderHour < 18) {
        $memes = [
            "Đã nửa ngày trôi qua, cốc trà sữa 60k ban chiều có làm bạn ngọt ngào? Ghi vào sổ đi rồi xem ví bạn có đắng lòng không.",
            "Bữa trưa ăn gì hết bao nhiêu nhớ nhập sổ nha. Ăn thì nhanh chứ ví xẹp thì lâu mới phồng lại đấy!",
            "Alo alo! Trà chiều, bánh ngọt, ăn vặt... ghi hết vào sổ chưa bạn ơi? Đừng giả vờ quên để trốn tránh sự thật."
        ];
    } elseif ($reminderHour >= 18 && $reminderHour < 22) {
        $memes = [
            "Hôm nay tiêu gì ghi chưa bạn? Đừng để lúc đi ngủ nhắm mắt lại mới chợt nhớ ra ví mình đã mất tích một khoản không rõ nguyên nhân.",
            "Ghi sổ chi tiêu đi nào! Ghi sổ không làm bạn giàu lên ngay lập tức, nhưng ít nhất giúp bạn biết tại sao mình nghèo.",
            "Nhập thu chi đi bạn ơi! Để lúc thanh toán quét mã QR, tài khoản báo 'Số dư không đủ' lại tự hỏi mình đã làm gì sai với cuộc đời."
        ];
    } else {
        $memes = [
            "Nửa đêm rồi, đừng lướt Shopee/Tiktok nữa bạn ơi! Hãy vào ghi sổ chi tiêu đi để thấy giỏ hàng kia xa xỉ thế nào.",
            "Đêm muộn ví tiền thì lạnh, sổ chi tiêu thì trống. Vào nhập nốt khoản chi hôm nay rồi ngủ ngon nhé, đừng thức khuya nghĩ cách tiêu tiền nữa.",
            "Người ta thức khuya nhớ người yêu, còn bạn thức khuya chắc là đang suy nghĩ vì sao tiền trong thẻ bốc hơi đúng không? Ghi sổ ngay!"
        ];
    }
    
    $selectedMeme = $memes[array_rand($memes)];

    $subject = "Nhắc nhở hàng ngày: Nhập dữ liệu thu chi của bạn";
    $body = "
    <div style='font-family: \"SF Pro Display\", -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;'>
        <div style='text-align: center; margin-bottom: 24px;'>
            <div style='display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #34d399, #059669); color: white; text-align: center; line-height: 48px; font-size: 24px; font-weight: bold;'>
                💰
            </div>
            <h2 style='color: #0c1c13; margin-top: 12px; font-weight: 700;'>SpendMindAI</h2>
        </div>
        <p style='color: #4a5c52; font-size: 16px; line-height: 1.6;'>
            Xin chào <strong>" . htmlspecialchars($user['username']) . "</strong>,
        </p>
        <p style='color: #4a5c52; font-size: 16px; line-height: 1.6;'>
            Đây là email nhắc nhở tự động từ hệ thống SpendMindAI của bạn. Đã đến giờ nhập các giao dịch phát sinh trong ngày hôm nay!
        </p>
        <div style='background-color: #f4f8f6; border: 1px solid #e1e8e4; border-radius: 12px; padding: 18px; margin: 20px 0;'>
            <h4 style='color: #059669; margin: 0 0 8px 0; font-weight: 600;'>" . htmlspecialchars($memeTitle) . "</h4>
            <p style='color: #4a5c52; font-size: 14px; margin: 0; line-height: 1.5; font-style: italic;'>
                \"" . htmlspecialchars($selectedMeme) . "\"
            </p>
        </div>
        <div style='text-align: center; margin: 30px 0 10px 0;'>
            <a href='" . $appUrl . "/login.html' style='background-color: #059669; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; display: inline-block;'>
                Nhập thu chi ngay
            </a>
        </div>
        <hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 20px 0;'>
        <p style='color: #7d9085; font-size: 12px; text-align: center; margin: 0;'>
            Bạn nhận được email này vì đã đăng ký nhận thông báo nhắc nhở lúc " . substr($user['reminder_time'], 0, 5) . " hàng ngày.
            <br>Để hủy nhận thông báo, vui lòng truy cập Bảng điều khiển -> Cài đặt nhắc nhở.
        </p>
    </div>";

    $mailResult = sendSystemEmail($user['email'], $subject, $body);

    if ($mailResult['success']) {
        $stmt = $pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");
        $stmt->execute([':today' => $today, ':id' => $userId]);
        $mailResult['sent'] = true;
    } else {
        $mailResult['sent'] = false;
    }

    return $mailResult;
}
