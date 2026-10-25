<?php
// Chạy ChatbotController.php THẬT trên local_dev_data.json (nạp vào SQLite trong RAM). Dùng bởi: run_eval.py --target php
// Vào: JSON {"message","history","state"} qua stdin.  Ra: JSON mà handleChat() gửi (+ "http" = mã trạng thái).
// Tự kiểm sanitizeHistory():  php -d zend.assertions=1 -d extension=mbstring php_harness.php --self-test
date_default_timezone_set('Asia/Ho_Chi_Minh');
$root = dirname(__DIR__, 2);

function sendJson(array $data, int $statusCode = 200): void {
    echo json_encode($data + ["http" => $statusCode], JSON_UNESCAPED_UNICODE);
}

function sendError(string $message, int $statusCode = 400, ?string $code = null): void {
    sendJson(["success" => false, "message" => $message], $statusCode);
}

function getEnvVar($key, $default = null) {
    $v = getenv($key);
    if ($v !== false && $v !== '') {
        return $v;
    }
    foreach (@file($GLOBALS['root'] . '/.env', FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        if (strpos($line, "$key=") === 0) {
            return trim(substr($line, strlen($key) + 1), " \"'");
        }
    }
    return $default;
}

require $root . '/api/controllers/ChatbotController.php';
$bot = new ChatbotController();

if (in_array('--self-test', $argv, true)) {
    $m = new ReflectionMethod($bot, 'sanitizeHistory');
    $h = fn($raw) => $m->invoke($bot, $raw);
    $u = fn($t) => ["role" => "user", "text" => $t];
    $b = fn($t) => ["role" => "bot", "text" => $t];
    assert($h(null) === [] && $h("x") === []);
    assert($h([$b("a"), $u("q1"), $b("r1")]) === [$u("q1"), $b("r1")]);     // bỏ tin bot đứng đầu
    assert($h([$u("q1"), $u("q2"), $b("r")]) === [$u("q1"), $b("r")]);      // bỏ hai tin user liền nhau
    assert($h([$u("q1"), $b("r1"), $u("q2")]) === [$u("q1"), $b("r1")]);    // bỏ tin user đứng cuối
    assert($h([$u("q"), ["role" => "system", "text" => "x"], 5, $b("r")]) === [$u("q"), $b("r")]);
    assert(count($h(array_merge(...array_fill(0, 5, [$u("q"), $b("r")])))) === 6);
    assert(mb_strlen($h([$u(str_repeat("á", 3000)), $b("r")])[0]["text"]) === 2000);
    echo "php self-test: đạt\n";
    exit(0);
}

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("CREATE TABLE users (id INTEGER, username TEXT);
            CREATE TABLE transactions (id TEXT, user_id INTEGER, type TEXT, amount REAL, category TEXT, date TEXT, description TEXT);
            CREATE TABLE budgets (user_id INTEGER, category TEXT, limit_amount REAL);");
$db = json_decode(file_get_contents($root . '/local_dev_data.json'), true);
$pdo->prepare("INSERT INTO users VALUES (1, ?)")->execute([$db['user']['username'] ?? 'ban']);
$ins = $pdo->prepare("INSERT INTO transactions VALUES (?, 1, ?, ?, ?, ?, ?)");
foreach ($db['transactions'] as $t) {
    $ins->execute([$t['id'], $t['type'], $t['amount'], $t['category'], $t['date'], $t['description'] ?? '']);
}
$bud = $pdo->prepare("INSERT INTO budgets VALUES (1, ?, ?)");
foreach ($db['budgets'] ?? [] as $cat => $limit) {
    $bud->execute([$cat, $limit]);
}
$bot->handleChat(1, json_decode(stream_get_contents(STDIN), true) ?: [], $pdo);
