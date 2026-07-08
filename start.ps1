# Set console to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  KHOI DONG HE THONG QUAN LY CHI TIEU QUA DOCKER COMPOSE  " -ForegroundColor Cyan -BackgroundColor DarkCyan
Write-Host "========================================================" -ForegroundColor Cyan

# Canh bao xung dot cong 8081
Write-Host "Luu y: Hay chac chan rang ban da tat Apache tren XAMPP (neu dang bat) de khong bi xung dot cong 8081." -ForegroundColor DarkYellow

# 1. Khai chay Docker Compose
Write-Host ""
Write-Host "[1/3] Dang khoi dong cac dich vu (Database, Web Server, Cloudflare Tunnel)..." -ForegroundColor Yellow
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[LOI] Khroi dong Docker Compose that bai!" -ForegroundColor Red
    Write-Host "Hay kiem tra xem Docker Desktop da duoc mo chua." -ForegroundColor Yellow
    Exit 1
}

# 2. Quet log de tim lien ket Cloudflare Tunnel
Write-Host ""
Write-Host "[2/3] Dang ket noi Cloudflare Tunnel de sinh link chia se..." -ForegroundColor Yellow
Write-Host "Dang cho may chu cap phat URL cong khai (mat khoang 5-15 giay)..." -ForegroundColor Gray

$tunnelUrl = $null
$timeout = 45
$elapsed = 0

while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 2
    $elapsed += 2
    
    # Lay logs tu container tunnel (chi lay 100 dong cuoi de tranh lay link cu tu phien truoc)
    $logs = docker compose logs --tail 100 tunnel 2>&1
    
    $currentMatch = $null
    foreach ($line in $logs) {
        if ($line -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $currentMatch = $Matches[0]
        }
    }
    
    if ($currentMatch) {
        $tunnelUrl = $currentMatch
        break
    }
}

if (-not $tunnelUrl) {
    Write-Host "[LOI] Khong the tu dong lay link Cloudflare Tunnel." -ForegroundColor Red
    Write-Host "Co the do duong truyen cham. Ban co the kiem tra log thu cong bang lenh:" -ForegroundColor Yellow
    Write-Host "  docker compose logs tunnel" -ForegroundColor Gray
    Exit 1
}

# 3. Luu lien ket va ho tro sao chep nhanh
Write-Host ""
Write-Host "[3/3] Da khoi dong he thong va ket noi Cloudflare Tunnel thanh cong!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "LIEN KET CHIA SE CONG KHAI CUA BAN:" -ForegroundColor Yellow
Write-Host "  $tunnelUrl" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""

# Luu vao file de tien xem lai
$tunnelUrl | Out-File -FilePath "$PSScriptRoot\cloudflare_link.txt" -Encoding utf8
Write-Host "[OK] Da luu lien ket vao file: cloudflare_link.txt" -ForegroundColor Gray

# Sao chep vao clipboard
Set-Clipboard -Value $tunnelUrl -ErrorAction SilentlyContinue
Write-Host "[OK] Da tu dong copy link vao Clipboard. Hay paste (Ctrl+V) de chia se ngay!" -ForegroundColor Gray

# Tu dong mo trinh duyet
Write-Host "[OK] Dang tu dong mo lien ket tren trinh duyet cua ban..." -ForegroundColor Gray
Start-Sleep -Seconds 1
Start-Process $tunnelUrl
