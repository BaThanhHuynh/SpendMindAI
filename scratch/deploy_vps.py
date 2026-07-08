import os
import sys
import zipfile
import time
import paramiko
from scp import SCPClient

# VM Configuration
VM_IP = "52.184.77.236"
VM_PORT = 22
VM_USER = "HuynhBaThanh"
VM_PASS = "BaThanh2005@"
DOMAIN = "huynhbathanh.site"

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_ZIP = os.path.join(PROJECT_ROOT, "QuanLyChiTieu.zip")
LOCAL_DEPLOY_SH = os.path.join(PROJECT_ROOT, "vps_deployment", "deploy.sh")

def print_banner(msg):
    print("=" * 60)
    print(f" {msg}")
    print("=" * 60)

def zip_project(zip_path):
    exclude_dirs = {'.git', '.github', '.idea', '.vscode', 'vps_deployment', 'vps_deployment_temp', '__pycache__', 'scratch'}
    exclude_files = {
        'cloudflared.exe', 
        'cloudflare_link.txt', 
        'QuanLyChiTieu.zip', 
        'deploy_vps.py', 
        'watch_deploy.py', 
        'README.md', 
        'BaoCaoDoAn.md', 
        '.gitignore', 
        '.dockerignore', 
        'Dockerfile', 
        'docker-compose.yml', 
        '.env.example'
    }
    
    print("Zipping project files...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(PROJECT_ROOT):
            # Exclude folders
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
            
            for file in files:
                if file in exclude_files:
                    continue
                if file.endswith('.zip') or file.endswith('.exe') or file.endswith('.log') or file.endswith('.docx'):
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, PROJECT_ROOT)
                try:
                    zipf.write(file_path, arcname)
                except PermissionError as e:
                    print(f"Skipping locked/in-use file: {file_path}")
    print(f"Created project zip: {zip_path} ({os.path.getsize(zip_path) / 1024 / 1024:.2f} MB)")

def safe_write(stream, text):
    try:
        stream.write(text)
        stream.flush()
    except UnicodeEncodeError:
        # Strip or replace unicode characters so Windows console doesn't choke
        encoding = sys.stdout.encoding or 'ascii'
        safe_text = text.encode(encoding, errors='replace').decode(encoding)
        stream.write(safe_text)
        stream.flush()

def execute_sudo_cmd(ssh, cmd, password):
    # Execute with sudo -S to feed the password
    stdin, stdout, stderr = ssh.exec_command(f"sudo -S {cmd}")
    stdin.write(password + "\n")
    stdin.flush()
    
    # Read output in real time
    while not stdout.channel.exit_status_ready():
        if stdout.channel.recv_ready():
            data = stdout.channel.recv(1024).decode('utf-8', errors='ignore')
            safe_write(sys.stdout, data)
        if stderr.channel.recv_ready():
            data = stderr.channel.recv(1024).decode('utf-8', errors='ignore')
            # Avoid showing password prompt warnings in red if they are just [sudo] password prompts
            if "[sudo] password" not in data:
                safe_write(sys.stderr, data)
            
    # Read any remaining output
    data = stdout.read().decode('utf-8', errors='ignore')
    if data:
        safe_write(sys.stdout, data)
    data_err = stderr.read().decode('utf-8', errors='ignore')
    if data_err:
        if "[sudo] password" not in data_err:
            safe_write(sys.stderr, data_err)
            
    return stdout.channel.recv_exit_status()

def main():
    print_banner("STARTING DEPLOYMENT TO AZURE VM")
    
    # Step 1: Zip the project locally
    zip_project(LOCAL_ZIP)
    
    # Step 2: Establish SSH connection
    print(f"\nConnecting to SSH {VM_USER}@{VM_IP}:{VM_PORT}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(VM_IP, port=VM_PORT, username=VM_USER, password=VM_PASS, timeout=30)
        print("Successfully connected via SSH!")
    except Exception as e:
        print(f"Failed to connect via SSH: {e}")
        return
        
    try:
        # Step 3: SFTP Upload files
        print("\nUploading deploy.sh and QuanLyChiTieu.zip to VM...")
        with SCPClient(ssh.get_transport()) as scp:
            scp.put(LOCAL_DEPLOY_SH, "/home/" + VM_USER + "/deploy.sh")
            scp.put(LOCAL_ZIP, "/home/" + VM_USER + "/QuanLyChiTieu.zip")
        print("Upload completed!")
        
        # Step 4: Make deploy.sh executable
        print("\nMaking deploy.sh executable...")
        ssh.exec_command("chmod +x /home/" + VM_USER + "/deploy.sh")
        
        # Step 5: Run deploy.sh with sudo
        print_banner("RUNNING deploy.sh SCRIPT ON VM")
        exit_code = execute_sudo_cmd(ssh, f"bash /home/{VM_USER}/deploy.sh", VM_PASS)
        if exit_code != 0:
            print("Error: deploy.sh failed!")
            return
            
        # Step 6: Extract the project files to /var/www/QuanLyChiTieu/
        print_banner("EXTRACTING PROJECT FILES")
        execute_sudo_cmd(ssh, f"unzip -o /home/{VM_USER}/QuanLyChiTieu.zip -d /var/www/QuanLyChiTieu", VM_PASS)
        
        # Step 7: Read generated database password and setup production .env
        print("\nReading generated database credentials on VM...")
        stdin, stdout, stderr = ssh.exec_command("sudo cat /var/www/QuanLyChiTieu/db_credentials.txt")
        db_creds = stdout.read().decode('utf-8')
        
        db_pass = ""
        for line in db_creds.split("\n"):
            if "Database Password:" in line:
                db_pass = line.split("Database Password:")[1].strip()
                break
                
        if not db_pass:
            print("Warning: Could not parse database password from db_credentials.txt!")
            db_pass = "secret" # Fallback if error
            
        print(f"Parsed DB Password: {db_pass[:3]}*****")
        
        # Read local GEMINI_API_KEY if present
        local_gemini_key = ""
        local_env_path = os.path.join(PROJECT_ROOT, ".env")
        if os.path.exists(local_env_path):
            with open(local_env_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("GEMINI_API_KEY="):
                        parts = line.split("=", 1)
                        if len(parts) > 1:
                            local_gemini_key = parts[1].strip()
                        break

        # Build production .env content
        env_content = f"""# CẤU HÌNH CƠ SỞ DỮ LIỆU (Môi trường VPS)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=chi_tieu_user
DB_PASS={db_pass}
DB_NAME=quan_ly_chi_tieu

# CẤU HÌNH GỬI MAIL SMTP (GMAIL APP PASSWORD)
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=huynhbathanh21102005@gmail.com
SMTP_PASS=ewsh tytq ifvq rlun
SMTP_FROM=huynhbathanh21102005@gmail.com
SMTP_FROM_NAME=SpendMindAI

# CẤU HÌNH ỨNG DỤNG (PRODUCTION)
APP_ENV=production
APP_URL=https://huynhbathanh.site

# CORS WHITELIST
ALLOWED_ORIGINS=https://huynhbathanh.site,https://www.huynhbathanh.site

# CẤU HÌNH API GOOGLE OAUTH 2.0
GOOGLE_CLIENT_ID=323969067193-8ph0nqo120aa1mm0iecjhhreu3u96k71.apps.googleusercontent.com

# CẤU HÌNH API GOOGLE GEMINI AI
GEMINI_API_KEY={local_gemini_key}
"""
        
        # Write .env file to a temp local file, then upload it
        temp_env_path = os.path.join(PROJECT_ROOT, "vps_deployment", ".env.temp")
        with open(temp_env_path, "w", encoding="utf-8") as f:
            f.write(env_content)
            
        print("\nUploading production .env file...")
        with SCPClient(ssh.get_transport()) as scp:
            scp.put(temp_env_path, f"/home/{VM_USER}/.env")
            
        # Remove local temp file
        os.remove(temp_env_path)
        
        # Move .env to project directory and remove zip from home
        print("Moving .env to destination and cleaning up...")
        execute_sudo_cmd(ssh, f"mv /home/{VM_USER}/.env /var/www/QuanLyChiTieu/.env", VM_PASS)
        execute_sudo_cmd(ssh, f"rm -f /home/{VM_USER}/QuanLyChiTieu.zip /home/{VM_USER}/deploy.sh", VM_PASS)
        
        # Step 8: Fix permissions
        print("\nSetting Nginx folder ownership and permissions...")
        execute_sudo_cmd(ssh, "chown -R www-data:www-data /var/www/QuanLyChiTieu", VM_PASS)
        execute_sudo_cmd(ssh, "chmod -R 755 /var/www/QuanLyChiTieu", VM_PASS)
        execute_sudo_cmd(ssh, "systemctl restart nginx", VM_PASS)
        
        # Step 8.5: Configure System Cron Job for Reminders
        print("\nConfiguring system cron job for email reminders...")
        execute_sudo_cmd(ssh, "touch /var/log/quan_ly_chi_tieu_cron.log", VM_PASS)
        execute_sudo_cmd(ssh, "chown www-data:www-data /var/log/quan_ly_chi_tieu_cron.log", VM_PASS)
        
        # Create cron definition file in /etc/cron.d/ running as www-data
        cron_def = "*/5 * * * * www-data php /var/www/QuanLyChiTieu/cron.php > /var/log/quan_ly_chi_tieu_cron.log 2>&1\\n"
        execute_sudo_cmd(ssh, f'bash -c "echo -e \'{cron_def}\' > /etc/cron.d/quan_ly_chi_tieu"', VM_PASS)
        execute_sudo_cmd(ssh, "systemctl restart cron", VM_PASS)
        print("Cron job configured successfully (running every 5 minutes).")
        
        # Step 9: Install Certbot & Attempt SSL config
        print_banner("CONFIGURING LET'S ENCRYPT SSL")
        print("Installing certbot packages...")
        execute_sudo_cmd(ssh, "apt install certbot python3-certbot-nginx -y", VM_PASS)
        
        print(f"\nAttempting to obtain SSL cert for {DOMAIN} and www.{DOMAIN}...")
        ssl_code = execute_sudo_cmd(ssh, f"certbot --nginx -d {DOMAIN} -d www.{DOMAIN} --non-interactive --agree-tos --email huynhbathanh21102005@gmail.com --redirect", VM_PASS)
        
        if ssl_code == 0:
            print_banner("DEPLOYMENT COMPLETED SUCCESSFULLY WITH SSL!")
            print(f"Your website is live at: https://{DOMAIN}")
        else:
            print_banner("DEPLOYMENT COMPLETED WITH SSL WARNING")
            print("Let's Encrypt SSL configuration failed. This is likely because the DNS records for")
            print(f"'{DOMAIN}' are not yet pointed to the IP address '{VM_IP}'.")
            print("\nPlease make sure to:")
            print(f"1. Add an A record pointing '{DOMAIN}' and 'www.{DOMAIN}' to IP: {VM_IP} in your domain provider dashboard.")
            print("2. Wait a few minutes for DNS propagation.")
            print("3. Log into your VPS and run Certbot manually using:")
            print(f"   sudo certbot --nginx -d {DOMAIN} -d www.{DOMAIN}")
            print(f"\nCurrently, you can access your site without HTTPS at: http://{VM_IP}")
            
    finally:
        ssh.close()
        # Clean up local zip file
        if os.path.exists(LOCAL_ZIP):
            os.remove(LOCAL_ZIP)
            print("\nRemoved local temp zip file.")

if __name__ == "__main__":
    main()
