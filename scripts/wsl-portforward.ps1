# WSL Port Forwarding Setup
# Detects current WSL IP and sets up port forwarding rules.
# Run after each reboot or WSL restart.
#
# Usage (from regular PowerShell - it self-elevates):
#   powershell -ExecutionPolicy Bypass -File scripts\wsl-portforward.ps1

$ports = @(5000, 5001, 4000)

# Get current WSL IP (must be done BEFORE elevating, since admin context can't see user's WSL)
$wslIp = (wsl hostname -I).Trim().Split(" ")[0]

if (-not $wslIp) {
    Write-Host "ERROR: Could not detect WSL IP. Is WSL running?" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "WSL IP detected: $wslIp" -ForegroundColor Cyan

# Build the netsh commands
$cmds = @()
foreach ($port in $ports) {
    $cmds += "netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>`$null | Out-Null"
    $cmds += "netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp"
}
$cmds += "netsh interface portproxy show all"
$script = $cmds -join "; "

# Self-elevate: run the netsh commands as admin
Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -Command `"$script`"" -Verb RunAs -Wait

# Verify
Write-Host ""
foreach ($port in $ports) {
    Write-Host "  localhost:$port -> ${wslIp}:$port" -ForegroundColor Green
}
Write-Host ""
Write-Host "Port forwarding active! Test: http://localhost:5000" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to close"
