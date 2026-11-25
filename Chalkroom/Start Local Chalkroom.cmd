@echo off
setlocal
set "CHALKROOM_SCRIPT=%~dp0local.mjs"
powershell.exe -NoProfile -Command "$url='http://127.0.0.1:31416/'; $quote=[string][char]34; for($try=0;$try -lt 20;$try++){ try { if ((Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1).Content.Contains('chalkroom-local-gateway')) { Start-Process $url; exit 0 } } catch {}; if ($try -eq 0) { Start-Process node -WindowStyle Hidden -ArgumentList ($quote + $env:CHALKROOM_SCRIPT + $quote) }; Start-Sleep -Milliseconds 250 }; Write-Error 'Chalkroom could not start on port 31416.'; exit 1"
if errorlevel 1 pause
