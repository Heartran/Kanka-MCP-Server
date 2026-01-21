cd C:\Users\Federico\repo\Kanka-MCP-Server

function Start-Server {
  git fetch
  git pull
  npm install
  tailscale funnel 5000
  $env:PORT = "5000"
  Start-Process -FilePath node -ArgumentList "index.js" -PassThru -NoNewWindow
}

$serverProcess = Start-Server

while ($true) {
  Start-Sleep -Seconds 300
  git fetch
  $local = git rev-parse HEAD
  $remote = $null
  try {
    $remote = git rev-parse "@{u}"
  } catch {
    $remote = $null
  }

  if ($remote -and ($local -ne $remote)) {
    if ($serverProcess -and -not $serverProcess.HasExited) {
      Stop-Process -Id $serverProcess.Id -Force
    }
    $serverProcess = Start-Server
    continue
  }

  if ($serverProcess -and $serverProcess.HasExited) {
    $serverProcess = Start-Server
  }
}
