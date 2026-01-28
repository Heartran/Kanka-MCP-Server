cd $PSScriptRoot

function Start-Server {
  git fetch
  git pull
  npm install
  # Using the more explicit serve command to avoid argument parsing issues
  # and running it in the background so it doesn't block the Node server
  Start-Process -FilePath "tailscale" -ArgumentList "serve", "--https=443", "--funnel", "5000" -NoNewWindow
  $env:PORT = "5000"
  return Start-Process -FilePath "node" -ArgumentList "index.js" -PassThru -NoNewWindow
}

$serverProcess = Start-Server

while ($true) {
  Start-Sleep -Seconds 300
  git fetch
  $local = git rev-parse HEAD
  $remote = $null
  try {
    $remote = git rev-parse "@{u}"
  }
  catch {
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
