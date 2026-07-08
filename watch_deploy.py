import os
import sys
import time
import subprocess

# Configure monitored extensions and folders
EXTENSIONS = ('.html', '.js', '.css', '.php', '.sql', '.env', '.md')
MONITORED_DIRS = ['js', 'css', 'includes', 'vps_deployment']
EXCLUDE_DIRS = ['.git', '__pycache__', '.idea', '.vscode', 'scratch', 'brand']

# Path to the deployment script
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DEPLOY_SCRIPT = os.path.join(PROJECT_ROOT, "scratch", "deploy_vps.py")

def get_monitored_files():
    """Recursively lists files that match the monitored criteria."""
    monitored_files = {}
    
    # 1. Monitored root files
    for entry in os.listdir(PROJECT_ROOT):
        full_path = os.path.join(PROJECT_ROOT, entry)
        if os.path.isfile(full_path) and entry.endswith(EXTENSIONS):
            monitored_files[full_path] = os.path.getmtime(full_path)
            
    # 2. Monitored directories
    for root, dirs, files in os.walk(PROJECT_ROOT):
        # Exclude directories on-the-fly
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        rel_path = os.path.relpath(root, PROJECT_ROOT)
        first_part = rel_path.split(os.sep)[0] if rel_path != '.' else '.'
        
        if first_part in MONITORED_DIRS:
            for file in files:
                if file.endswith(EXTENSIONS):
                    full_path = os.path.join(root, file)
                    try:
                        monitored_files[full_path] = os.path.getmtime(full_path)
                    except OSError:
                        pass
                        
    return monitored_files

def main():
    print("==============================================================")
    print(" SpendMindAI - AUTO-DEPLOY FILE WATCHER RUNNING")
    print("==============================================================")
    print(f"Monitoring folder: {PROJECT_ROOT}")
    print(f"Monitored extensions: {', '.join(EXTENSIONS)}")
    print("Press Ctrl+C to stop the watcher.\n")
    
    # Initial scan
    last_state = get_monitored_files()
    print(f"Initialized: monitoring {len(last_state)} source files.")
    
    try:
        while True:
            time.sleep(1.0)
            current_state = get_monitored_files()
            
            changed_files = []
            
            # Check for modified or new files
            for file, mtime in current_state.items():
                if file not in last_state:
                    changed_files.append((file, "NEW"))
                elif last_state[file] < mtime:
                    changed_files.append((file, "MODIFIED"))
                    
            # Check for deleted files
            for file in last_state:
                if file not in current_state:
                    changed_files.append((file, "DELETED"))
                    
            if changed_files:
                print("\n" + "="*50)
                print(f"Detected {len(changed_files)} file change(s):")
                for file, change_type in changed_files:
                    rel_name = os.path.relpath(file, PROJECT_ROOT)
                    print(f" - [{change_type}] {rel_name}")
                
                print("Waiting 0.5s for write operations to settle...")
                time.sleep(0.5)
                
                print("Triggering deployment script...")
                try:
                    subprocess.run(["python", DEPLOY_SCRIPT], check=True)
                    print("Deploy completed successfully!")
                except subprocess.CalledProcessError as e:
                    print(f"Deployment failed with error: {e}")
                except Exception as e:
                    print(f"Error executing deploy script: {e}")
                    
                # Refresh state after deploy to prevent triggering again for the same change
                last_state = get_monitored_files()
            else:
                last_state = current_state
                
    except KeyboardInterrupt:
        print("\nWatcher stopped. Goodbye!")

if __name__ == "__main__":
    main()
