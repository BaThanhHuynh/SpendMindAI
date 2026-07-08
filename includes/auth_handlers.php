<?php
/* ==========================================================================
   AUTHENTICATION ACTION HANDLERS (check_session, google_auth, login, register, logout)
   ========================================================================== */

if (!defined('PDO_CONNECT_VERIFIED')) {
    // Prevent direct execution if pdo is not configured
    exit("Access Denied");
}

// Helper to set or clear remember_me cookie
function handleRememberCookie($remember, $isSecure) {
    if ($remember) {
        setcookie('remember_me', '1', time() + 2592000, '/', '', $isSecure, true);
        $params = session_get_cookie_params();
        setcookie(session_name(), session_id(), time() + 2592000, $params['path'], $params['domain'], $isSecure, true);
    } else {
        setcookie('remember_me', '', time() - 3600, '/', '', $isSecure, true);
    }
}

// Check Session Status
if ($action === 'check_session') {
    $userId = getLoggedInUserId();
    if ($userId) {
        $stmt = $pdo->prepare("SELECT username, email, google_id, reminder_time, email_notifications, avatar_url FROM users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $u = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode([
            "authenticated" => true,
            "username" => $u['username'],
            "email" => $u['email'],
            "google_id" => $u['google_id'],
            "reminder_time" => $u['reminder_time'] ? substr($u['reminder_time'], 0, 5) : '',
            "email_notifications" => intval($u['email_notifications']),
            "avatar_url" => $u['avatar_url'],
            "userId" => $userId
        ]);
    } else {
        echo json_encode(["authenticated" => false]);
    }
    exit();
}

// Get Google Client ID config
if ($action === 'get_google_client_id') {
    $clientId = getenv('GOOGLE_CLIENT_ID') ?: '';
    echo json_encode(["client_id" => $clientId]);
    exit();
}

// Google Quick Authentication (Login & Auto-Register)
if ($action === 'google_auth' && $method === 'POST') {
    $email = null;
    $googleId = null;
    $avatarUrl = null;

    if (!empty($input['access_token'])) {
        $accessToken = trim($input['access_token']);
        $userInfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo?access_token=' . urlencode($accessToken);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $userInfoUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200 || !$response) {
            http_response_code(401);
            echo json_encode(["success" => false, "message" => "Xác thực mã Google Access Token thất bại. Vui lòng thử lại."]);
            exit();
        }
        
        $userInfo = json_decode($response, true);
        if (empty($userInfo['email']) || empty($userInfo['sub'])) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Không lấy được thông tin email/ID từ Google"]);
            exit();
        }
        
        $email = trim($userInfo['email']);
        $googleId = trim($userInfo['sub']);
        $avatarUrl = isset($userInfo['picture']) ? trim($userInfo['picture']) : null;
    } else {
        if (empty($input['email']) || empty($input['google_id'])) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Dữ liệu Google không đầy đủ"]);
            exit();
        }
        $email = trim($input['email']);
        $googleId = trim($input['google_id']);
        // Simulated avatar url using ui-avatars.com
        $avatarUrl = 'https://ui-avatars.com/api/?name=' . urlencode(explode('@', $email)[0]) . '&background=059669&color=fff&size=128';
    }

    try {
        // 1. Check if user already exists by google_id
        $stmt = $pdo->prepare("SELECT * FROM users WHERE google_id = :gid");
        $stmt->execute([':gid' => $googleId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            // Update avatar_url if fetched
            if ($avatarUrl) {
                $stmt = $pdo->prepare("UPDATE users SET avatar_url = :avatar WHERE id = :id");
                $stmt->execute([':avatar' => $avatarUrl, ':id' => $user['id']]);
                $user['avatar_url'] = $avatarUrl;
            }
            // Log user in
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            
            handleRememberCookie(true, $isSecure);
            
            echo json_encode([
                "success" => true,
                "message" => "Đăng nhập bằng Google thành công!",
                "username" => $user['username'],
                "email" => $user['email'],
                "avatar_url" => $user['avatar_url'] ?: $avatarUrl,
                "google_id" => $googleId
            ]);
            exit();
        }

        // 2. Check if a user already has this email (link them to google_id)
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            // Update user to link Google ID & avatar
            $stmt = $pdo->prepare("UPDATE users SET google_id = :gid, avatar_url = :avatar WHERE id = :id");
            $stmt->execute([':gid' => $googleId, ':avatar' => $avatarUrl, ':id' => $user['id']]);

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            
            handleRememberCookie(true, $isSecure);

            echo json_encode([
                "success" => true,
                "message" => "Tài khoản liên kết Google thành công và đã đăng nhập!",
                "username" => $user['username'],
                "email" => $user['email'],
                "avatar_url" => $avatarUrl,
                "google_id" => $googleId
            ]);
            exit();
        }

        // 3. Otherwise, automatically register a new user
        $usernamePrefix = explode('@', $email)[0];
        $username = $usernamePrefix;

        // Check for duplicates
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = :usr");
        $stmt->execute([':usr' => $username]);
        if ($stmt->fetch()) {
            $username = $usernamePrefix . rand(100, 999);
        }

        // Save user (random password since they login with Google)
        $randomPass = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO users (username, password, email, google_id, avatar_url) VALUES (:usr, :pass, :email, :gid, :avatar)");
        $stmt->execute([
            ':usr' => $username,
            ':pass' => $randomPass,
            ':email' => $email,
            ':gid' => $googleId,
            ':avatar' => $avatarUrl
        ]);

        $newUserId = $pdo->lastInsertId();
        $_SESSION['user_id'] = $newUserId;
        $_SESSION['username'] = $username;
        
        handleRememberCookie(true, $isSecure);

        echo json_encode([
            "success" => true,
            "message" => "Tạo mới tài khoản Google thành công!",
            "username" => $username,
            "email" => $email,
            "avatar_url" => $avatarUrl,
            "google_id" => $googleId
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Lỗi CSDL Google Login: " . $e->getMessage()]);
    }
    exit();
}

// Register Account
if ($action === 'register' && $method === 'POST') {
    if (empty($input['username']) || empty($input['password']) || empty($input['email'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Vui lòng nhập đầy đủ các trường bắt buộc"]);
        exit();
    }

    $usr = trim($input['username']);
    $email = trim($input['email']);
    $pass = $input['password'];

    if (strlen($usr) < 3) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Tên đăng nhập phải chứa ít nhất 3 ký tự"]);
        exit();
    }
    if (strlen($pass) < 6) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Mật khẩu phải chứa ít nhất 6 ký tự"]);
        exit();
    }

    try {
        // Check if username already exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = :usr OR email = :email");
        $stmt->execute([':usr' => $usr, ':email' => $email]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Tên đăng nhập hoặc email đã được đăng ký"]);
            exit();
        }

        // Hash password and insert
        $hashedPass = password_hash($pass, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO users (username, password, email) VALUES (:usr, :pass, :email)");
        $stmt->execute([
            ':usr' => $usr,
            ':pass' => $hashedPass,
            ':email' => $email
        ]);

        echo json_encode(["success" => true, "message" => "Đăng ký tài khoản thành công! Hãy đăng nhập"]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Lỗi đăng ký CSDL: " . $e->getMessage()]);
    }
    exit();
}

// Login
if ($action === 'login' && $method === 'POST') {
    if (empty($input['username']) || empty($input['password'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Vui lòng nhập đầy đủ thông tin đăng nhập"]);
        exit();
    }

    $usr = trim($input['username']);
    $pass = $input['password'];

    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = :usr");
        $stmt->execute([':usr' => $usr]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            http_response_code(401);
            echo json_encode(["success" => false, "message" => "Tài khoản chưa được đăng ký. Vui lòng tạo tài khoản mới."]);
        } elseif (!password_verify($pass, $user['password'])) {
            http_response_code(401);
            echo json_encode(["success" => false, "message" => "Mật khẩu không chính xác. Vui lòng thử lại."]);
        } else {
            // Write session variables
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];

            handleRememberCookie(!empty($input['remember']), $isSecure);

            echo json_encode([
                "success" => true,
                "message" => "Đăng nhập thành công!",
                "username" => $user['username']
            ]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Lỗi đăng nhập: " . $e->getMessage()]);
    }
    exit();
}

// Logout
if ($action === 'logout' && $method === 'POST') {
    session_unset();
    session_destroy();
    
    // Clear remember_me cookie
    setcookie('remember_me', '', time() - 3600, '/', '', $isSecure, true);
    
    echo json_encode(["success" => true, "message" => "Đăng xuất thành công"]);
    exit();
}
