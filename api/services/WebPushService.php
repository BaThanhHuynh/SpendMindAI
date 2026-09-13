<?php
/* ==========================================================================
   SPENDMINDAI - WEB PUSH NOTIFICATION SERVICE (RFC 8030, RFC 8291, RFC 8292)
   Native PHP implementation with zero external dependencies.
   Sends real Web Push notifications to Google FCM (Android) & Apple APNs (iOS PWA).
   ========================================================================== */

class WebPushService {
    // Default fallback keys if not provided in environment
    const DEFAULT_PUBLIC_KEY = 'BMQjBm-Q8HdsZtTjxqhCrRja2-vW0HG8D66eYM6eI8znAs3dWCzVzSBqUc8xlMEx2_ygHCc3ALNlO9virV5wzPo';
    const DEFAULT_PRIVATE_KEY = 'IdGlj3y8FDqOs22a0MlYgLVeWT1E6MliYQI9J_7ycig';
    const DEFAULT_SUBJECT = 'mailto:admin@huynhbathanh.site';

    /**
     * Get VAPID public key
     */
    public static function getPublicKey(): string {
        $key = function_exists('getEnvVar') ? getEnvVar('VAPID_PUBLIC_KEY', '') : (getenv('VAPID_PUBLIC_KEY') ?: '');
        return !empty($key) ? trim($key) : self::DEFAULT_PUBLIC_KEY;
    }

    /**
     * Get VAPID private key
     */
    public static function getPrivateKey(): string {
        $key = function_exists('getEnvVar') ? getEnvVar('VAPID_PRIVATE_KEY', '') : (getenv('VAPID_PRIVATE_KEY') ?: '');
        return !empty($key) ? trim($key) : self::DEFAULT_PRIVATE_KEY;
    }

    /**
     * Get VAPID subject
     */
    public static function getSubject(): string {
        $subj = function_exists('getEnvVar') ? getEnvVar('VAPID_SUBJECT', '') : (getenv('VAPID_SUBJECT') ?: '');
        return !empty($subj) ? trim($subj) : self::DEFAULT_SUBJECT;
    }

    /**
     * Base64Url encode helper
     */
    public static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Base64Url decode helper
     */
    public static function base64UrlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/'));
    }

    /**
     * Convert DER formatted ECDSA signature to IEEE P1363 (r || s, 64 bytes) for ES256 JWT
     */
    private static function derToP1363(string $der): ?string {
        if (strlen($der) < 8 || ord($der[0]) !== 0x30) {
            return null;
        }

        $pos = 2;
        if (ord($der[1]) & 0x80) {
            $lenBytes = ord($der[1]) & 0x7f;
            $pos += $lenBytes;
        }

        // Read integer r
        if (ord($der[$pos]) !== 0x02) return null;
        $rLen = ord($der[$pos + 1]);
        $r = substr($der, $pos + 2, $rLen);
        $pos += 2 + $rLen;

        // Read integer s
        if (ord($der[$pos]) !== 0x02) return null;
        $sLen = ord($der[$pos + 1]);
        $s = substr($der, $pos + 2, $sLen);

        // Strip leading zeros or pad to exactly 32 bytes
        $r = ltrim($r, "\x00");
        $s = ltrim($s, "\x00");

        $r = str_pad($r, 32, "\x00", STR_PAD_LEFT);
        $s = str_pad($s, 32, "\x00", STR_PAD_LEFT);

        return $r . $s;
    }

    /**
     * Build PEM formatted EC private key from raw 32-byte secret for OpenSSL
     */
    private static function getPrivateKeyPem(string $rawPrivKey): ?string {
        // ASN.1 sequence for SEC1 ECPrivateKey (prime256v1)
        // 30 77 02 01 01 04 20 [32-byte key] a0 0a 06 08 2a 86 48 ce 3d 03 01 07
        $sec1Der = "\x30\x77\x02\x01\x01\x04\x20" . $rawPrivKey . 
                   "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07";
        
        $pem = "-----BEGIN EC PRIVATE KEY-----\n" . 
               chunk_split(base64_encode($sec1Der), 64, "\n") . 
               "-----END EC PRIVATE KEY-----\n";
        return $pem;
    }

    /**
     * Create VAPID JWT header for endpoint
     */
    public static function createVapidJwt(string $endpoint): ?string {
        $parsed = parse_url($endpoint);
        if (!$parsed || empty($parsed['host'])) {
            return null;
        }

        $audience = ($parsed['scheme'] ?? 'https') . '://' . $parsed['host'];
        if (!empty($parsed['port'])) {
            $audience .= ':' . $parsed['port'];
        }

        $header = ['typ' => 'JWT', 'alg' => 'ES256'];
        $claims = [
            'aud' => $audience,
            'exp' => time() + 43200, // Valid for 12 hours
            'sub' => self::getSubject()
        ];

        $unsignedToken = self::base64UrlEncode(json_encode($header, JSON_UNESCAPED_SLASHES)) . '.' . 
                          self::base64UrlEncode(json_encode($claims, JSON_UNESCAPED_SLASHES));

        $privKeyRaw = self::base64UrlDecode(self::getPrivateKey());
        $pem = self::getPrivateKeyPem($privKeyRaw);
        if (!$pem) return null;

        $keyRes = openssl_pkey_get_private($pem);
        if (!$keyRes) return null;

        $derSignature = '';
        $signSuccess = openssl_sign($unsignedToken, $derSignature, $keyRes, OPENSSL_ALGO_SHA256);
        if (!$signSuccess) return null;

        $rawSig = self::derToP1363($derSignature);
        if (!$rawSig || strlen($rawSig) !== 64) return null;

        return $unsignedToken . '.' . self::base64UrlEncode($rawSig);
    }

    /**
     * Encrypt notification payload according to RFC 8291 (aes128gcm)
     */
    public static function encryptPayload(string $plaintext, string $clientP256dhB64, string $clientAuthB64): ?array {
        $clientPublicKey = self::base64UrlDecode($clientP256dhB64);
        $clientAuth = self::base64UrlDecode($clientAuthB64);

        if (strlen($clientPublicKey) !== 65 || strlen($clientAuth) < 16) {
            return null;
        }

        // Generate ephemeral local EC key pair on prime256v1
        $config = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
        $localKey = openssl_pkey_new($config);
        if (!$localKey) return null;

        // Extract raw 65-byte local public key
        $details = openssl_pkey_get_details($localKey);
        if (!$details || empty($details['ec']['x']) || empty($details['ec']['y'])) return null;
        $localPublicKey = "\x04" . str_pad($details['ec']['x'], 32, "\x00", STR_PAD_LEFT) . 
                                  str_pad($details['ec']['y'], 32, "\x00", STR_PAD_LEFT);

        // Convert client's raw public key to PEM for OpenSSL derivation
        $clientPubDer = "\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00" . $clientPublicKey;
        $clientPem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($clientPubDer), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $clientKeyRes = openssl_pkey_get_public($clientPem);
        if (!$clientKeyRes) return null;

        // Perform ECDH key exchange
        if (!function_exists('openssl_pkey_derive')) return null;
        $sharedSecret = openssl_pkey_derive($clientKeyRes, $localKey);
        if (!$sharedSecret) return null;

        // Generate 16 bytes random salt
        $salt = random_bytes(16);

        // HKDF derivation as per RFC 8291
        // IKM = HKDF-Extract(salt=auth, IKM=sharedSecret)
        // PRK_key = HKDF-Extract(salt=salt, IKM=HKDF-Expand(PRK=IKM, info="WebPush: info\0" || client_pub || local_pub, L=32))
        $keyInfo = "WebPush: info\x00" . $clientPublicKey . $localPublicKey;
        $ikm = hash_hkdf('sha256', $sharedSecret, 32, $keyInfo, $clientAuth);

        $cekInfo = "Content-Encoding: aes128gcm\x00";
        $cek = hash_hkdf('sha256', $ikm, 16, $cekInfo, $salt);

        $nonceInfo = "Content-Encoding: nonce\x00";
        $nonce = hash_hkdf('sha256', $ikm, 12, $nonceInfo, $salt);

        // Add padding delimiter as per RFC 8291 (Record: padding delimiter \x02, padding \x00*)
        $payloadWithPadding = $plaintext . "\x02";

        $tag = '';
        $ciphertext = openssl_encrypt(
            $payloadWithPadding,
            'aes-128-gcm',
            $cek,
            OPENSSL_RAW_DATA,
            $nonce,
            $tag,
            '',
            16
        );

        if ($ciphertext === false || strlen($tag) !== 16) {
            return null;
        }

        // Construct aes128gcm binary record header:
        // salt (16) + record_size (4, BE integer 4096 = 0x00001000) + id_len (1, 65 = 0x41) + key (65) + ciphertext + tag (16)
        $recordSize = pack('N', 4096);
        $idLen = chr(65);
        $body = $salt . $recordSize . $idLen . $localPublicKey . $ciphertext . $tag;

        return [
            'body' => $body,
            'content_type' => 'application/octet-stream',
            'content_encoding' => 'aes128gcm'
        ];
    }

    /**
     * Dispatch a Web Push notification to a specific client subscription endpoint
     *
     * @param string $endpoint The push endpoint URL (Apple APNs or Google FCM)
     * @param string $p256dh Client public key
     * @param string $auth Client authentication secret
     * @param array $payload Notification data array [title, body, icon, url, ...]
     * @return array [success => bool, status => int, expired => bool, message => string]
     */
    public static function send(string $endpoint, string $p256dh = '', string $auth = '', array $payload = []): array {
        if (empty($endpoint) || !filter_var($endpoint, FILTER_VALIDATE_URL)) {
            return [
                'success' => false,
                'status' => 400,
                'expired' => false,
                'message' => 'Endpoint Web Push không hợp lệ'
            ];
        }

        $jwt = self::createVapidJwt($endpoint);
        if (!$jwt) {
            return [
                'success' => false,
                'status' => 500,
                'expired' => false,
                'message' => 'Không thể tạo VAPID JWT token'
            ];
        }

        $pubKey = self::getPublicKey();
        $authHeader = 'vapid t=' . $jwt . ', k=' . $pubKey;

        $headers = [
            'Authorization: ' . $authHeader,
            'TTL: 86400',
            'Urgency: high'
        ];

        $postBody = '';
        // If client keys are provided, encrypt payload with RFC 8291
        if (!empty($p256dh) && !empty($auth) && !empty($payload)) {
            $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $encrypted = self::encryptPayload($jsonPayload, $p256dh, $auth);
            if ($encrypted) {
                $postBody = $encrypted['body'];
                $headers[] = 'Content-Type: ' . $encrypted['content_type'];
                $headers[] = 'Content-Encoding: ' . $encrypted['content_encoding'];
                $headers[] = 'Content-Length: ' . strlen($postBody);
            } else {
                // Fallback to empty body (ping trigger)
                $headers[] = 'Content-Length: 0';
            }
        } else {
            $headers[] = 'Content-Length: 0';
        }

        // Execute HTTP POST to endpoint
        if (function_exists('curl_init')) {
            $ch = curl_init($endpoint);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postBody);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

            $response = curl_exec($ch);
            $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($curlError) {
                return [
                    'success' => false,
                    'status' => 0,
                    'expired' => false,
                    'message' => 'Lỗi kết nối Web Push: ' . $curlError
                ];
            }
        } else {
            // Fallback via file_get_contents with stream context
            $opts = [
                'http' => [
                    'method' => 'POST',
                    'header' => implode("\r\n", $headers),
                    'content' => $postBody,
                    'timeout' => 10,
                    'ignore_errors' => true
                ]
            ];
            $context = stream_context_create($opts);
            $response = @file_get_contents($endpoint, false, $context);
            $statusCode = 200;
            if (isset($http_response_header[0]) && preg_match('{HTTP\/\S*\s(\d{3})}', $http_response_header[0], $m)) {
                $statusCode = intval($m[1]);
            }
        }

        // Evaluate Web Push server response
        // 200 OK, 201 Created, 202 Accepted = Success
        if ($statusCode === 200 || $statusCode === 201 || $statusCode === 202) {
            return [
                'success' => true,
                'status' => $statusCode,
                'expired' => false,
                'message' => 'Đã gửi thông báo Web Push thành công'
            ];
        }

        // 404 Not Found or 410 Gone = Subscription has expired or user revoked permission
        $isExpired = ($statusCode === 404 || $statusCode === 410);

        return [
            'success' => false,
            'status' => $statusCode,
            'expired' => $isExpired,
            'message' => 'Máy chủ Web Push phản hồi mã: ' . $statusCode . ($isExpired ? ' (Subscription đã hết hạn)' : '')
        ];
    }
}
