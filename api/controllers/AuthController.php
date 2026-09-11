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

    public function checkSession(bool $includeState = false): void {
        $userId = self::getLoggedInUserId();
        if ($userId && $this->pdo) {
            try {
                $stmt = $this->pdo->prepare("SELECT username, email, google_id, reminder_time, email_notifications, avatar_url FROM users WHERE id = :id");
                $stmt->execute([':id' => $userId]);
                $u = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($u) {
                    $response = [
                        "authenticated" => true,
                        "username" => $u['username'],
                        "email" => $u['email'],
                        "google_id" => $u['google_id'],
                        "reminder_time" => $u['reminder_time'] ? substr($u['reminder_time'], 0, 5) : '',
                        "email_notifications" => intval($u['email_notifications']),
                        "avatar_url" => $u['avatar_url'],
                        "userId" => $userId,
                        "db_connected" => true
                    ];

                    if ($includeState) {
                        $tStmt = $this->pdo->prepare("SELECT id, type, amount, category, date, description FROM transactions WHERE user_id = :uid ORDER BY date DESC, id DESC");
                        $tStmt->execute([':uid' => $userId]);
                        $txs = $tStmt->fetchAll(PDO::FETCH_ASSOC);
                        foreach ($txs as &$t) {
                            $t['amount'] = floatval($t['amount']);
                        }
                        $response["transactions"] = $txs;

                        $bStmt = $this->pdo->prepare("SELECT category, limit_amount FROM budgets WHERE user_id = :uid");
                        $bStmt->execute([':uid' => $userId]);
                        $bList = $bStmt->fetchAll(PDO::FETCH_ASSOC);
                        $budgets = [];
                        foreach ($bList as $b) {
                            $budgets[$b['category']] = floatval($b['limit_amount']);
                        }
                        $response["budgets"] = $budgets;
                    }

                    sendJson($response);
                    return;
                }
            } catch (Throwable $e) {
                error_log("checkSession error: " . $e->getMessage());
            }
        }
        sendJson([
            "authenticated" => false,
            "db_connected" => ($this->pdo !== null),
            "db_error" => Database::getError()
        ]);
    }

    public function getGoogleClientId(): void {
        $clientId = (function_exists('getEnvVar') ? getEnvVar('GOOGLE_CLIENT_ID') : getenv('GOOGLE_CLIENT_ID')) 
                    ?: '125274610515-6qi1cnl41k7itnfch3v6123q6tbqgovf.apps.googleusercontent.com';
        sendJson([
            "success" => true,
            "client_id" => $clientId
        ]);
    }

    public function handleGoogleAuth(array $input): void {
        if (!$this->pdo) {
            sendError("Chưa kết nối cơ sở dữ liệu. Vui lòng kiểm tra biến môi trường DATABASE_URL trên Vercel.", 503);
            return;
        }

        $email = null;
        $googleId = null;
        $avatarUrl = null;

        // 1. Verify Google ID Token credential (JWT)
        if (!empty($input['credential'])) {
            $credential = trim($input['credential']);
            $tokenInfoUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential);
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $tokenInfoUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 8);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode === 200 && $response) {
                $payload = json_decode($response, true);
                if ($payload && !empty($payload['email']) && !empty($payload['sub'])) {
                    $email = trim($payload['email']);
                    $googleId = trim($payload['sub']);
                    $avatarUrl = $payload['picture'] ?? null;
                }
            }

            // Fallback for local testing if external tokeninfo endpoint is unreachable
            if (!$email || !$googleId) {
                $jwtParts = explode('.', $credential);
                if (count($jwtParts) === 3) {
                    $payloadJson = base64_decode(strtr($jwtParts[1], '-_', '+/'));
                    $payload = json_decode($payloadJson, true);
                    $expectedClientId = (function_exists('getEnvVar') ? getEnvVar('GOOGLE_CLIENT_ID') : getenv('GOOGLE_CLIENT_ID')) ?: '125274610515-6qi1cnl41k7itnfch3v6123q6tbqgovf.apps.googleusercontent.com';
                    if ($payload && !empty($payload['email']) && !empty($payload['sub']) && isset($payload['aud']) && $payload['aud'] === $expectedClientId) {
                        $email = trim($payload['email']);
                        $googleId = trim($payload['sub']);
                        $avatarUrl = $payload['picture'] ?? null;
                    }
                }
            }

            if (!$email || !$googleId) {
                sendError("Xác thực mã Google ID Token thất bại", 401);
                return;
            }
        }
        // 2. Check Access Token via Google Userinfo API
        elseif (!empty($input['access_token'])) {
            $accessToken = trim($input['access_token']);
            $userInfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo?access_token=' . urlencode($accessToken);
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $userInfoUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 8);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200 || !$response) {
                sendError("Xác thực mã Google Access Token thất bại. Vui lòng thử lại.", 401);
                return;
            }
            $userInfo = json_decode($response, true);
            if (empty($userInfo['email']) || empty($userInfo['sub'])) {
                sendError("Không lấy được thông tin email/ID từ Google", 400);
                return;
            }
            $email = trim($userInfo['email']);
            $googleId = trim($userInfo['sub']);
            $avatarUrl = $userInfo['picture'] ?? null;
        }
        // 3. Fallback direct email/google_id (strictly gated for development/demo mode)
        else {
            $allowSimulated = ((function_exists('getEnvVar') ? getEnvVar('ALLOW_SIMULATED_AUTH', 'false') : (getenv('ALLOW_SIMULATED_AUTH') ?: 'false')) === 'true')
                              || (getenv('APP_ENV') === 'development');
            if (!$allowSimulated) {
                sendError("Chế độ đăng nhập thử nghiệm không khả dụng trên môi trường này.", 403);
                return;
            }
            if (empty($input['email']) || empty($input['google_id'])) {
                sendError("Dữ liệu đăng nhập Google không đầy đủ", 400);
                return;
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

                sendJson([
                    "success" => true,
                    "message" => "Đăng nhập bằng Google thành công!",
                    "username" => $user['username'],
                    "email" => $user['email'],
                    "avatar_url" => $user['avatar_url'] ?: $avatarUrl,
                    "google_id" => $googleId
                ]);
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

                sendJson([
                    "success" => true,
                    "message" => "Tài khoản liên kết Google thành công và đã đăng nhập!",
                    "username" => $user['username'],
                    "email" => $user['email'],
                    "avatar_url" => $avatarUrl,
                    "google_id" => $googleId
                ]);
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

            sendJson([
                "success" => true,
                "message" => "Tạo mới tài khoản Google thành công!",
                "username" => $username,
                "email" => $email,
                "avatar_url" => $avatarUrl,
                "google_id" => $googleId
            ]);

        } catch (Throwable $e) {
            error_log("Google auth error: " . $e->getMessage());
            sendError("Lỗi hệ thống khi xác thực Google. Vui lòng thử lại sau.", 500);
        }
    }

    public function handleRegister(array $input): void {
        if (!$this->pdo) {
            sendError("Chưa kết nối cơ sở dữ liệu. Vui lòng thử lại sau.", 503);
            return;
        }

        if (empty($input['username']) || empty($input['password']) || empty($input['email'])) {
            sendError("Vui lòng nhập đầy đủ các trường bắt buộc", 400);
            return;
        }

        $usr = trim($input['username']);
        $email = trim($input['email']);
        $pass = (string)$input['password'];

        if (strlen($usr) < 3) {
            sendError("Tên đăng nhập phải chứa ít nhất 3 ký tự", 400);
            return;
        }
        if (strlen($pass) < 6) {
            sendError("Mật khẩu phải chứa ít nhất 6 ký tự", 400);
            return;
        }

        try {
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE username = :usr OR email = :email");
            $stmt->execute([':usr' => $usr, ':email' => $email]);
            if ($stmt->fetch()) {
                sendError("Tên đăng nhập hoặc email đã được đăng ký", 409);
                return;
            }

            $hashedPass = password_hash($pass, PASSWORD_DEFAULT);
            $stmt = $this->pdo->prepare("INSERT INTO users (username, password, email) VALUES (:usr, :pass, :email)");
            $stmt->execute([
                ':usr' => $usr,
                ':pass' => $hashedPass,
                ':email' => $email
            ]);

            sendJson(["success" => true, "message" => "Đăng ký tài khoản thành công! Hãy đăng nhập"]);
        } catch (Throwable $e) {
            error_log("Register error: " . $e->getMessage());
            sendError("Đã xảy ra lỗi khi tạo tài khoản. Vui lòng thử lại sau.", 500);
        }
    }

    public function handleLogin(array $input): void {
        if (!$this->pdo) {
            sendError("Chưa kết nối cơ sở dữ liệu. Vui lòng thử lại sau.", 503);
            return;
        }

        if (empty($input['username']) || empty($input['password'])) {
            sendError("Vui lòng nhập đầy đủ thông tin đăng nhập", 400);
            return;
        }

        $usr = trim($input['username']);
        $pass = (string)$input['password'];

        try {
            $stmt = $this->pdo->prepare("SELECT * FROM users WHERE username = :usr");
            $stmt->execute([':usr' => $usr]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendError("Tài khoản chưa được đăng ký. Vui lòng tạo tài khoản mới.", 401);
                return;
            }
            if (!password_verify($pass, $user['password'])) {
                sendError("Mật khẩu không chính xác. Vui lòng thử lại.", 401);
                return;
            }

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            $this->setRememberCookie(!empty($input['remember']));

            sendJson([
                "success" => true,
                "message" => "Đăng nhập thành công!",
                "username" => $user['username']
            ]);
        } catch (Throwable $e) {
            error_log("Login error: " . $e->getMessage());
            sendError("Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại sau.", 500);
        }
    }

    public function handleLogout(): void {
        session_unset();
        session_destroy();
        setcookie('remember_me', '', time() - 3600, '/', '', $this->isSecure, true);
        sendJson(["success" => true, "message" => "Đăng xuất thành công"]);
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
