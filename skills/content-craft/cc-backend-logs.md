# Backend Logs Monitor

Monitor Content-Craft backend API logs for debugging and issue tracking.

**Argument:** `$ARGUMENTS` - Optional environment (local, dev, test, staging, prod). Defaults to local.

## Environment-Specific Log Access

### Local Development
```bash
# Get API server PID
API_PID=$(ps aux | grep "uvicorn.*8000" | grep -v grep | awk '{print $2}')

# Read process output
cat /proc/$API_PID/fd/1 2>/dev/null | tail -100
```

### Azure Container Apps (test/prod)

#### Prerequisites
1. Install Azure CLI: `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash`
2. Login: `az login`
3. Set subscription: `az account set --subscription "NORG-AI-Production"`

#### Connect to Container Console (Interactive Shell)
```bash
# Test environment
az containerapp exec \
  --name cc-api-test \
  --resource-group rg-content-craft-test \
  --command "/bin/bash"

# Production environment
az containerapp exec \
  --name cc-api-prod \
  --resource-group rg-content-craft-prod \
  --command "/bin/bash"
```

#### Stream Live Logs (Real-time)
```bash
# Test environment - stream logs
az containerapp logs show \
  --name cc-api-test \
  --resource-group rg-content-craft-test \
  --type console \
  --follow

# Production environment - stream logs
az containerapp logs show \
  --name cc-api-prod \
  --resource-group rg-content-craft-prod \
  --type console \
  --follow
```

#### Query Recent Logs
```bash
# Test - last 100 lines
az containerapp logs show \
  --name cc-api-test \
  --resource-group rg-content-craft-test \
  --type console \
  --tail 100

# Production - last 100 lines
az containerapp logs show \
  --name cc-api-prod \
  --resource-group rg-content-craft-prod \
  --type console \
  --tail 100
```

#### Query System Logs (Container Events)
```bash
# Test - system logs
az containerapp logs show \
  --name cc-api-test \
  --resource-group rg-content-craft-test \
  --type system \
  --tail 50

# Production - system logs
az containerapp logs show \
  --name cc-api-prod \
  --resource-group rg-content-craft-prod \
  --type system \
  --tail 50
```

## Quick Commands Summary

| Environment | Stream Logs | Console Access |
|-------------|-------------|----------------|
| local | `cat /proc/$(pgrep -f "uvicorn.*8000")/fd/1` | N/A |
| test | `az containerapp logs show --name cc-api-test --resource-group rg-content-craft-test --type console --follow` | `az containerapp exec --name cc-api-test --resource-group rg-content-craft-test --command "/bin/bash"` |
| prod | `az containerapp logs show --name cc-api-prod --resource-group rg-content-craft-prod --type console --follow` | `az containerapp exec --name cc-api-prod --resource-group rg-content-craft-prod --command "/bin/bash"` |

## Worker Logs

### Local
```bash
WORKER_PID=$(ps aux | grep "start_crawler_worker\|start_worker" | grep -v grep | awk '{print $2}')
cat /proc/$WORKER_PID/fd/1
```

### Azure (test/prod)
```bash
# Test worker logs
az containerapp logs show --name cc-worker-test --resource-group rg-content-craft-test --type console --follow

# Production worker logs
az containerapp logs show --name cc-worker-prod --resource-group rg-content-craft-prod --type console --follow
```

## Monitor Script (Local Only)
```bash
cd /home/developer/norg/content-craft && ./monitor-logs.sh
```

## Log Analytics Queries (Azure Portal)

For advanced log analysis, use Log Analytics in Azure Portal:

```kusto
// API errors in last hour
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "cc-api-prod"
| where Log_s contains "ERROR" or Log_s contains "Exception"
| where TimeGenerated > ago(1h)
| order by TimeGenerated desc

// Request latency
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "cc-api-prod"
| where Log_s contains "completed in"
| parse Log_s with * "completed in " duration:double "ms" *
| summarize avg(duration), max(duration), percentile(duration, 95) by bin(TimeGenerated, 5m)
```

## Debugging Tips

1. **Import Errors**: Check for `NameError` or `ImportError` in logs
2. **Database Issues**: Look for `sqlalchemy` or connection errors
3. **Auth Issues**: Search for `401`, `403`, or `authentication` messages
4. **API Errors**: Filter for `ERROR` or `Exception` in output
5. **Memory Issues**: Check system logs for OOM kills

## Health Checks

| Environment | Endpoint |
|-------------|----------|
| local | `curl http://localhost:8000/health` |
| test | `curl https://cc-api-test.azurecontainerapps.io/health` |
| prod | `curl https://api.norg.ai/health` |

## Troubleshooting Azure Connection

```bash
# Check if logged in
az account show

# List available container apps
az containerapp list --resource-group rg-content-craft-prod -o table

# Check container app status
az containerapp show --name cc-api-prod --resource-group rg-content-craft-prod --query "properties.runningStatus"
```
