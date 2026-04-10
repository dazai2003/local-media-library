$backendPath = Join-Path $PSScriptRoot "backend"
$frontendPath = Join-Path $PSScriptRoot "frontend"

# Start the servers completely hidden
$backend = Start-Process node -ArgumentList "server.js" -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru
# Using npm via cmd to ensure paths resolve, but we can call it directly
$frontend = Start-Process cmd.exe -ArgumentList "/c npm run dev" -WorkingDirectory $frontendPath -WindowStyle Hidden -PassThru

# Wait a few seconds for servers to boot
Start-Sleep -Seconds 3

# Start Chrome in "App Mode" with a temporary isolated profile so we can track exactly when it closes!
$tempProfile = Join-Path $env:TEMP "MediaLibraryApp"
$chrome = Start-Process "chrome.exe" -ArgumentList "--app=http://localhost:5173/", "--user-data-dir=`"$tempProfile`"" -PassThru

# Wait for the user to close the Chrome window
$chrome.WaitForExit()

# When Chrome closes, kill our specific servers (and their children)
taskkill /PID $backend.Id /T /F | Out-Null
taskkill /PID $frontend.Id /T /F | Out-Null

# Just in case Vite spawned orphan node processes
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "vite" -or $_.CommandLine -match "server.js" } | Invoke-CimMethod -MethodName Terminate | Out-Null
