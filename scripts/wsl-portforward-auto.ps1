# WSL Port Forwarding - Auto (runs from Task Scheduler with admin rights)
# Waits for WSL to be ready, then sets up port forwarding rules.

$ports = @(5000, 5001, 4000)
$maxRetries = 12
$retryDelay = 5

# Wait for WSL to be ready (it may not be up immediately at logon)
for ($i = 1; $i -le $maxRetries; $i++) {
    $wslIp = $null
    try {
        $raw = (wsl hostname -I 2>$null)
        if ($raw) {
            $wslIp = $raw.Trim().Split(" ")[0]
        }
    } catch {}

    if ($wslIp -and $wslIp -match '^\d+\.\d+\.\d+\.\d+$') {
        break
    }

    Start-Sleep -Seconds $retryDelay
}

if (-not $wslIp) {
    exit 1
}

# Set port forwarding rules
foreach ($port in $ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp 2>$null | Out-Null
}
