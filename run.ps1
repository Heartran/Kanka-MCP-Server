cd C:\actions-runner\repo\Kanka-MCP-Server
npm install
tailscale funnel 5000
$env:PORT="5000"; node index.js