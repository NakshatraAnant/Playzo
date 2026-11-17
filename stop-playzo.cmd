@echo off
rem Stops the PLAYZO server listening on port 5757 (data is saved; live rooms are restored next start).
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 5757 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c.OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force }; 'PLAYZO stopped.' } else { 'PLAYZO is not running.' }"
timeout /t 3 >nul
