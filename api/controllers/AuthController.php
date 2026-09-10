<?php
/* ==========================================================================
   SPENDMINDAI - AUTH CONTROLLER
   Multiuser Authentication, Google OAuth, Session Guard & Password Hash
   ========================================================================== */

class AuthController {
    private ?PDO $pdo;
    private bool $isSecure;

    public function __construct(?PDO $pdo, bool $isSecure) {
        $this->pdo = $pdo;
        $this->isSecure = $isSecure;
    }

    public static function getLoggedInUserId(): ?int {
        return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
    }

    public function checkSession(): void {
        $userId = self::getLoggedInUserId();
        if ($userId && $this->pdo) {
            try {
                $stmt = $this->pdo->prepare("SELECT username, email, google_id, reminder_time, email_notifications, avatar_url FROM users WHERE id = :id");
                $stmt->execute([':id' => $userId]);
                $u = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($u) {
                    echo json_encode([
                        "authenticated" => true,
                        "username" => $u['username'],
                        "email" => $u['email'],
                        "google_id" => $u['google_id'],
                        "reminder_time" => $u['reminder_time'] ? substr($u['reminder_time'], 0, 5) : '',
                        "email_notifications" => intval($u['email_notifications']),
                        "avatar_url" => $u['avatar_url'],
                        "userId" => $userId,
                        "db_connected" => true
                    ]);
                    exit();
                }
            } catch (Throwable $e) {
                error_log("checkSession error: " . $e->getMessage());
            }
        }
        echo json_encode([
            "authenticated" => false,
            "db_connected" => ($this->pdo !== null)
        ]);
        exit();
    }

    public function getGoogleClientId(): void {
        $clientId = (function_exists('getEnvVar') ? getEnvVar('GOOGLE_CLIENT_ID') : getenv('GOOGLE_CLIENT_ID')) 
                    ?: '125274610515-6qi1cnl41k7itnfch3v6123q6tbqgovf.apps.googleusercontent.com';
        echo json_encode([
            "success" => true,
            "client_id" => $clientId
        ]);
        exit();
    }

    public function handleGoogleAuth(array $input): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode([
                "success" => false,
                "authenticated" => false,
                "db_connected" => false,
                "message" => "Chưa kết nối cơ sở dữ liệu Cloud trên Vercel. Vui lòng cấu hình biến môi trường DATABASE_URL hoặc DB_HOST, DB_USER, DB_PASS (TiDB Cloud) trong mục Settings -> Environment Variables."
            ]);
            exit();
        }

        $email = null;
        $googleId = null;
        $avatarUrl = null;

        // 1. Check ID Token (JWT) credential
        if (!empty($input['credential'])) {
            $jwtParts = explode('.', trim($input['credential']));
            if (count($jwtParts) === 3) {
                $payloadJson = base64_decode(strtr($jwtParts[1], '-_', '+/'));
                $payload = json_decode($payloadJson, true);
                if ($payload && !empty($payload['email']) && !empty($payload['sub'])) {
                    $email = trim($payload['email']);
                    $googleId = trim($payload['sub']);
                    $avatarUrl = $payload['picture'] ?? null;
                }
            }
            if (!$email || !$googleId) {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "Xác thực mã Google ID Token thất bại"]);
                exit();
            }
        }
        // 2. Check Access Token via Google Userinfo API
        elseif (!empty($input['access_token'])) {
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
            $avatarUrl = $userInfo['picture'] ?? null;
        }
        // 3. Fallback direct email/google_id
        else {
            if (empty($input['email']) || empty($input['google_id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "message" => "Dữ liệu Google không đầy đủ"]);
                exit();
            }
            $email = trim($input['email']);
            $googleId = trim($input['google_id']);
            $avatarUrl = 'https://ui-avatars.com/api/?name=' . urlencode(explode('@', $email)[0]) . '&background=059669&color=fff&size=128';
        }

        try {
            // Find existing user by google_id
            $stmt = $this->pdo->prepare("SELECT * FROM users WHERE google_id = :gid");
            $stmt->execute([':gid' => $googleId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user) {
                if ($avatarUrl) {
                    $stmt = $this->pdo->prepare("UPDATE users SET avatar_url = :avatar WHERE id = :id");
                    $stmt->execute([':avatar' => $avatarUrl, ':id' => $user['id']]);
                    $user['avatar_url'] = $avatarUrl;
                }
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                $this->setRememberCookie(true);

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

            // Find existing user by email to link Google ID
            $stmt = $this->pdo->prepare("SELECT * FROM users WHERE email = :email");
            $stmt->execute([':email' => $email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user) {
                $stmt = $this->pdo->prepare("UPDATE users SET google_id = :gid, avatar_url = :avatar WHERE id = :id");
                $stmt->execute([':gid' => $googleId, ':avatar' => $avatarUrl, ':id' => $user['id']]);

                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                $this->setRememberCookie(true);

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

            // Create new Google user
            $usernamePrefix = explode('@', $email)[0];
            $username = $usernamePrefix;
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE username = :usr");
            $stmt->execute([':usr' => $username]);
            if ($stmt->fetch()) {
                $username = $usernamePrefix . rand(100, 999);
            }

            $randomPass = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
            $stmt = $this->pdo->prepare("INSERT INTO users (username, password, email, google_id, avatar_url) VALUES (:usr, :pass, :email, :gid, :avatar)");
            $stmt->execute([
                ':usr' => $username,
                ':pass' => $randomPass,
                ':email' => $email,
                ':gid' => $googleId,
                ':avatar' => $avatarUrl
            ]);

            $newUserId = (int)$this->pdo->lastInsertId();
            $_SESSION['user_id'] = $newUserId;
            $_SESSION['username'] = $username;
            $this->setRememberCookie(true);

            echo json_encode([
                "success" => true,
                "message" => "Tạo mới tài khoản Google thành công!",
                "username" => $username,
                "email" => $email,
                "avatar_url" => $avatarUrl,
                "google_id" => $googleId
            ]);
            exit();

        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi CSDL Google Login: " . $e->getMessage()]);
            exit();
        }
    }

    public function handleRegister(array $input): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Chưa kết nối CSDL Cloud"]);
            exit();
        }

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
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE username = :usr OR email = :email");
            $stmt->execute([':usr' => $usr, ':email' => $email]);
            if ($stmt->fetch()) {
                http_response_code(409);
                echo json_encode(["success" => false, "message" => "Tên đăng nhập hoặc email đã được đăng ký"]);
                exit();
            }

            $hashedPass = password_hash($pass, PASSWORD_DEFAULT);
            $stmt = $this->pdo->prepare("INSERT INTO users (username, password, email) VALUES (:usr, :pass, :email)");
            $stmt->execute([
                ':usr' => $usr,
                ':pass' => $hashedPass,
                ':email' => $email
            ]);

            echo json_encode(["success" => true, "message" => "Đăng ký tài khoản thành công! Hãy đăng nhập"]);
            exit();
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi đăng ký: " . $e->getMessage()]);
            exit();
        }
    }

    public function handleLogin(array $input): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Chưa kết nối CSDL Cloud"]);
            exit();
        }

        if (empty($input['username']) || empty($input['password'])) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Vui lòng nhập đầy đủ thông tin đăng nhập"]);
            exit();
        }

        $usr = trim($input['username']);
        $pass = $input['password'];

        try {
            $stmt = $this->pdo->prepare("SELECT * FROM users WHERE username = :usr");
            $stmt->execute([':usr' => $usr]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                http_response_code(401);
                echo json_encode(["success" => false, "message" => "Tài khoản chưa được đăng ký. Vui lòng tạo tài khoản mới."]);
                exit();
            }
            if (!password_verify($pass, $user['password'])) {
                http_response_code(401);
                echo json_encode(["success" => false, "message" => "Mật khẩu không chính xác. Vui lòng thử lại."]);
                exit();
            }

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            $this->setRememberCookie(!empty($input['remember']));

            echo json_encode([
                "success" => true,
                "message" => "Đăng nhập thành công!",
                "username" => $user['username']
            ]);
            exit();
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi đăng nhập: " . $e->getMessage()]);
            exit();
        }
    }

    public function handleLogout(): void {
        session_unset();
        session_destroy();
        setcookie('remember_me', '', time() - 3600, '/', '', $this->isSecure, true);
        echo json_encode(["success" => true, "message" => "Đăng xuất thành công"]);
        exit();
    }

    private function setRememberCookie(bool $remember): void {
        if ($remember) {
            setcookie('remember_me', '1', time() + 2592000, '/', '', $this->isSecure, true);
            $params = session_get_cookie_params();
            setcookie(session_name(), session_id(), time() + 2592000, $params['path'], $params['domain'], $this->isSecure, true);
        } else {
            setcookie('remember_me', '', time() - 3600, '/', '', $this->isSecure, true);
        }
    }
}
