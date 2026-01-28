---
description: Health check endpoint for monitoring server status
---

# Health Check Workflow

This workflow provides a comprehensive health check endpoint for monitoring the Kanka MCP Server status.

## Endpoint: `/health`

### Purpose
- Monitor server health and performance
- Check active sessions and connections
- Verify API configuration
- Monitor memory usage and uptime

### Response Format
Returns JSON with:
- **status**: Server health status
- **timestamp**: Current timestamp
- **uptime**: Server uptime in seconds and human-readable format
- **server**: Version, port, Node.js version, platform
- **memory**: Memory usage statistics in MB
- **sessions**: Active session count and details
- **endpoints**: List of available endpoints
- **kanka_api**: API configuration status
- **features**: Enabled features

### Usage Examples

#### Basic Health Check
```bash
curl http://localhost:5000/health
```

#### With Tailscale
```bash
curl https://your-node.ts.net/health
```

#### Monitor Script
```bash
#!/bin/bash
while true; do
  response=$(curl -s http://localhost:5000/health)
  status=$(echo $response | jq -r '.status')
  sessions=$(echo $response | jq -r '.sessions.active_count')
  memory=$(echo $response | jq -r '.memory.heap_used')
  
  echo "$(date): Status=$status, Sessions=$sessions, Memory=${memory}MB"
  sleep 30
done
```

### Integration with Monitoring Tools

#### Prometheus
Can be scraped by Prometheus for metrics collection.

#### Docker Health Check
Add to docker-compose.yml:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

#### Kubernetes Liveness/Readiness
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Alerting Examples

#### High Memory Usage
Alert when heap_used > 500MB

#### No Active Sessions
Alert when active_count = 0 for > 5 minutes

#### Server Down
Alert when health check fails

### Security Considerations
- Endpoint logs all requests with IP and headers
- No sensitive data exposed (tokens are masked)
- Rate limiting can be applied if needed
- Can be protected with authentication in production
