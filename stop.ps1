# Set console to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "      DUNG HE THONG QUAN LY CHI TIEU DOCKER COMPOSE      " -ForegroundColor Cyan -BackgroundColor DarkRed
Write-Host "========================================================" -ForegroundColor Cyan

Write-Host "[1/1] Dang dung cac container va giai phong tai nguyen..." -ForegroundColor Yellow
docker compose down

if ($LASTEXITCODE -ne 0) {
    Write-Host "[LOI] Khong the dung Docker Compose. Hay kiem tra thu cong!" -ForegroundColor Red
} else {
    # Xoa file lien ket tam
    if (Test-Path "$PSScriptRoot\cloudflare_link.txt") {
        Remove-Item "$PSScriptRoot\cloudflare_link.txt"
    }
    Write-Host "[OK] Da dung he thong thanh cong va don dep cac lien ket tam." -ForegroundColor Green
}
