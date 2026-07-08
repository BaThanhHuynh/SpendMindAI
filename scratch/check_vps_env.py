import paramiko

VM_IP = "52.184.77.236"
VM_PORT = 22
VM_USER = "HuynhBaThanh"
VM_PASS = "BaThanh2005@"

def check_vps_env():
    print(f"Connecting to SSH {VM_USER}@{VM_IP}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(VM_IP, port=VM_PORT, username=VM_USER, password=VM_PASS, timeout=30)
        
        # Read the .env file on the VPS
        stdin, stdout, stderr = ssh.exec_command("sudo cat /var/www/QuanLyChiTieu/.env")
        stdin.write(VM_PASS + "\n")
        stdin.flush()
        
        content = stdout.read().decode('utf-8')
        print("--- VPS .env Content ---")
        lines = content.split("\n")
        for line in lines:
            if "GEMINI_API_KEY" in line:
                print(line) # Print only the GEMINI_API_KEY line to see if it is empty or has a key
        print("------------------------")
    except Exception as e:
        print(f"SSH Error: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    check_vps_env()
