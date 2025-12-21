cd C:\Users\Federico\repo\Kanka-MCP-Server
git fetch
git pull
npm install
tailscale funnel 5000
$env:PORT = "5000"; node index.js