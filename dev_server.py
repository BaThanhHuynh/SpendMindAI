#!/usr/bin/env python3
"""
SpendMindAI - Local Development & Demo Server
Run the entire application locally with Python (Zero-dependency setup).
Supports full static assets and local JSON-backed API simulation for transactions,
budgets, authentication, and mobile testing across Wi-Fi.
"""

import os
import sys
import json
import time
import socket
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Force UTF-8 terminal encoding on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8080
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(ROOT_DIR, "local_dev_data.json")

# Initial mock data for instant demo体验
DEFAULT_DATA = {
    "user": {
        "authenticated": True,
        "username": "Bá Thành",
        "email": "demo@spendmindai.com",
        "userId": 1,
        "reminder_time": "20:00",
        "email_notifications": 0,
        "zalo_phone": "0912345678",
        "zalo_user_id": "",
        "zalo_notifications": 1,
        "avatar_url": None,
        "db_connected": True
    },
    "budgets": {
        "food": 4000000,
        "transport": 1000000,
        "shopping": 2000000,
        "entertainment": 1500000,
        "home": 3000000,
        "other_expense": 1000000
    },
    "transactions": [
        {
            "id": "tx_demo_1",
            "type": "income",
            "amount": 25000000,
            "category": "salary",
            "date": time.strftime("%Y-%m-05"),
            "description": "Lương tháng chuyển khoản"
        },
        {
            "id": "tx_demo_2",
            "type": "expense",
            "amount": 150000,
            "category": "food",
            "date": time.strftime("%Y-%m-%d"),
            "description": "Ăn trưa và cà phê đồng nghiệp"
        },
        {
            "id": "tx_demo_3",
            "type": "expense",
            "amount": 450000,
            "category": "shopping",
            "date": time.strftime("%Y-%m-%d"),
            "description": "Mua sắm nhu yếu phẩm siêu thị"
        },
        {
            "id": "tx_demo_4",
            "type": "expense",
            "amount": 80000,
            "category": "transport",
            "date": time.strftime("%Y-%m-%d"),
            "description": "Đổ xăng xe máy"
        },
        {
            "id": "tx_demo_5",
            "type": "income",
            "amount": 3500000,
            "category": "freelance",
            "date": time.strftime("%Y-%m-08"),
            "description": "Thù lao dự án thiết kế web"
        }
    ]
}

def load_data():
    if not os.path.exists(DATA_FILE):
        save_data(DEFAULT_DATA)
        return DEFAULT_DATA
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_DATA

def save_data(data):
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Error saving data] {e}")

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class SpendMindHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS and caching headers
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=UTF-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        action = qs.get("action", [""])[0]

        # 0. Health & Readiness endpoints
        if path in ("/healthz", "/readyz") or (path in ("/api", "/api.php", "/api/index.php") and action in ("health", "healthz", "readyz")):
            is_ready = path == "/readyz" or action == "readyz"
            return self.send_json({
                "status": "ready" if is_ready else "ok",
                "service": "SpendMindAI Local Dev Server",
                "database": "mock_json_db",
                "timestamp": int(time.time()),
                "environment": "development"
            })

        # Handle API routes
        if path in ("/api", "/api.php", "/api/index.php"):
            db = load_data()
            if action == "check_session":
                res = dict(db["user"])
                if qs.get("include_state", [""])[0] == "1":
                    res["transactions"] = db.get("transactions", [])
                    res["budgets"] = db.get("budgets", {})
                return self.send_json(res)

            if action == "get_google_client_id":
                return self.send_json({
                    "success": True,
                    "client_id": "125274610515-6qi1cnl41k7itnfch3v6123q6tbqgovf.apps.googleusercontent.com"
                })

            if action == "get_gemini_key":
                # Check .env if exists
                gemini_key = ""
                env_path = os.path.join(ROOT_DIR, ".env")
                if os.path.exists(env_path):
                    with open(env_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.startswith("GEMINI_API_KEY="):
                                gemini_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                return self.send_json({
                    "success": bool(gemini_key),
                    "key": gemini_key,
                    "message": "" if gemini_key else "Chưa cấu hình GEMINI_API_KEY trong .env"
                })

            if action == "get_notification_settings":
                u = db["user"]
                return self.send_json({
                    "success": True,
                    "email": u.get("email", ""),
                    "reminder_time": u.get("reminder_time", "20:00"),
                    "email_notifications": u.get("email_notifications", 0),
                    "zalo_phone": u.get("zalo_phone", "0912345678"),
                    "zalo_user_id": u.get("zalo_user_id", ""),
                    "zalo_notifications": u.get("zalo_notifications", 1),
                    "avatar_url": u.get("avatar_url", None)
                })

            if action == "check_and_send_reminder":
                return self.send_json({
                    "success": True,
                    "sent": False,
                    "message": "Local demo: Không cần gửi nhắc nhở."
                })

            # Default GET /api returns transactions & budgets
            return self.send_json({
                "success": True,
                "authenticated": True,
                "username": db["user"]["username"],
                "transactions": db["transactions"],
                "budgets": db["budgets"]
            })

        # Static files fallback (index.html, dashboard.html, etc.)
        if path == "/":
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        action = qs.get("action", [""])[0]

        if path in ("/api", "/api.php", "/api/index.php"):
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length)
            try:
                payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
            except Exception:
                payload = {}

            db = load_data()

            if action in ("login", "register", "google_auth"):
                username = payload.get("username", "Bá Thành")
                email = payload.get("email", "demo@spendmindai.com")
                db["user"]["authenticated"] = True
                db["user"]["username"] = username
                db["user"]["email"] = email
                save_data(db)
                return self.send_json({
                    "success": True,
                    "authenticated": True,
                    "username": username,
                    "message": "Đăng nhập thành công (Local Demo)"
                })

            if action == "logout":
                # Keep authenticated for easy demo, or toggle:
                return self.send_json({"success": True, "message": "Đăng xuất thành công"})

            if action == "save_transaction":
                tx_id = payload.get("id")
                if not tx_id:
                    tx_id = f"tx_{int(time.time() * 1000)}"
                    payload["id"] = tx_id
                
                # Update or Insert
                existing = False
                for idx, t in enumerate(db["transactions"]):
                    if t["id"] == tx_id:
                        db["transactions"][idx] = payload
                        existing = True
                        break
                if not existing:
                    db["transactions"].insert(0, payload)

                save_data(db)
                return self.send_json({"success": True, "message": "Đã ghi nhận giao dịch thành công (Local)"})

            if action == "delete_transaction":
                tx_id = payload.get("id")
                db["transactions"] = [t for t in db["transactions"] if t["id"] != tx_id]
                save_data(db)
                return self.send_json({"success": True, "message": "Đã xóa giao dịch thành công (Local)"})

            if action == "save_budgets":
                if isinstance(payload, dict):
                    db["budgets"].update(payload)
                    save_data(db)
                return self.send_json({"success": True, "message": "Đã lưu hạn mức chi tiêu thành công (Local)"})

            if action == "clear_all_data":
                db["transactions"] = []
                save_data(db)
                return self.send_json({"success": True, "message": "Đã xóa toàn bộ dữ liệu thành công (Local)"})

            if action == "save_notification_settings":
                if "email" in payload:
                    db["user"]["email"] = payload["email"]
                if "reminder_time" in payload:
                    db["user"]["reminder_time"] = payload["reminder_time"]
                if "email_notifications" in payload:
                    db["user"]["email_notifications"] = int(payload["email_notifications"])
                if "zalo_phone" in payload:
                    db["user"]["zalo_phone"] = payload["zalo_phone"]
                if "zalo_user_id" in payload:
                    db["user"]["zalo_user_id"] = payload["zalo_user_id"]
                if "zalo_notifications" in payload:
                    db["user"]["zalo_notifications"] = int(payload["zalo_notifications"])
                save_data(db)
                return self.send_json({"success": True, "message": "Đã lưu cài đặt nhắc nhở qua Zalo thành công"})

            if action == "test_zalo_reminder":
                phone = db["user"].get("zalo_phone") or payload.get("zalo_phone", "0912345678")
                return self.send_json({
                    "success": True,
                    "simulated": True,
                    "zalo_link": f"https://zalo.me/{phone}",
                    "message": f"Đã tạo tin nhắn nhắc nhở Zalo cá nhân cho số {phone}!"
                })

            if action == "chat":
                msg = payload.get("message", "").strip()
                if not msg:
                    return self.send_json({"success": False, "message": "Tin nhắn không được để trống"}, 400)
                # Check for GEMINI_API_KEY in .env
                gemini_key = ""
                env_path = os.path.join(ROOT_DIR, ".env")
                if os.path.exists(env_path):
                    with open(env_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.startswith("GEMINI_API_KEY="):
                                gemini_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                if gemini_key:
                    try:
                        import urllib.request
                        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={gemini_key}"
                        req_body = json.dumps({
                            "contents": [{"parts": [{"text": f"Bạn là trợ lý tài chính SpendMindAI. Câu hỏi: {msg}. Trả lời ngắn gọn súc tích bằng tiếng Việt định dạng markdown."}]}]
                        }).encode("utf-8")
                        req = urllib.request.Request(api_url, data=req_body, headers={"Content-Type": "application/json"})
                        with urllib.request.urlopen(req, timeout=12) as resp:
                            res_json = json.loads(resp.read().decode("utf-8"))
                            reply = res_json.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            if reply:
                                return self.send_json({"success": True, "reply": reply})
                    except Exception as ai_err:
                        print(f"[Gemini Local Error] {ai_err}")

                # Fallback mock response for local testing
                total_income = sum(t["amount"] for t in db["transactions"] if t.get("type") == "income")
                total_expense = sum(t["amount"] for t in db["transactions"] if t.get("type") == "expense")
                balance = total_income - total_expense
                mock_reply = (
                    f"**Phân tích tài chính nhanh (Local Demo):**\n\n"
                    f"- Tổng thu nhập: **{total_income:,.0f}đ**\n"
                    f"- Tổng chi tiêu: **{total_expense:,.0f}đ**\n"
                    f"- Số dư hiện tại: **{balance:,.0f}đ**\n\n"
                    f"Bạn đã hỏi: *\"{msg}\"*. Hệ thống đang hoạt động ổn định ở chế độ demo!"
                )
                return self.send_json({"success": True, "reply": mock_reply})

        return self.send_json({"success": False, "message": "Unsupported POST action"}, 404)

def run_server():
    local_ip = get_local_ip()
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, SpendMindHandler)

    print("\n" + "=" * 65)
    print("  [SpendMindAI] MAY CHU CHAY THU LOCAL (DEMO DEV SERVER)")
    print("=" * 65)
    print(f"  [PC] Tren may tinh (Local):   http://localhost:{PORT}")
    print(f"  [Mobile] Dien thoai (Wi-Fi):  http://{local_ip}:{PORT}")
    print("=" * 65)
    print("  -> Dashboard truc tiep: http://localhost:8080/dashboard.html")
    print("  -> Trang Landing page:  http://localhost:8080/index.html")
    print("  -> Trang Dang nhap:     http://localhost:8080/login.html")
    print("=" * 65)
    print("  * Du lieu thu nghiem luu tu dong tai: local_dev_data.json")
    print("  * Nhan Ctrl + C de dung may chu.\n")

    # Open dashboard in browser after 0.5s if not in headless/test mode
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(f"http://localhost:{PORT}/dashboard.html")
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[SpendMindAI] Máy chủ đã dừng. Chúc bạn một ngày tốt lành!")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
