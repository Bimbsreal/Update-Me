# Local smoke checks for Update Me (does NOT hit production).
# Prerequisites: backend on :5000, frontend on :3000.

$ErrorActionPreference = 'Stop'
$api = 'http://localhost:5000/api/v1'
$web = 'http://localhost:3000'

function Check($name, $url, $expect = 200) {
  try {
    $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 60
    $ok = [int]$r.StatusCode -eq $expect
    Write-Output ("{0}={1} status={2}" -f $name, ($(if ($ok) { 'PASS' } else { 'FAIL' })), $r.StatusCode)
    return $ok
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Output ("{0}=FAIL status={1} err={2}" -f $name, $code, $_.Exception.Message)
    return $false
  }
}

$failed = 0
if (-not (Check 'live' "$api/health/live")) { $failed++ }
if (-not (Check 'ready' "$api/health/ready")) { $failed++ }
$health = Invoke-RestMethod "$api/health"
Write-Output ("health_status={0}" -f $health.status)
if ($health.status -eq 'unhealthy') { $failed++ }

$liveHeaders = (Invoke-WebRequest "$api/health/live" -Headers @{ 'X-Request-Id' = 'smoke-local-001' } -UseBasicParsing).Headers
Write-Output ("request_id={0}" -f $liveHeaders['x-request-id'])

if (-not (Check 'landing' "$web/")) { $failed++ }
if (-not (Check 'manifest' "$web/manifest.webmanifest")) { $failed++ }
if (-not (Check 'sw' "$web/sw.js")) { $failed++ }
if (-not (Check 'explore' "$web/explore")) { $failed++ }
if (-not (Check 'traffic' "$web/traffic")) { $failed++ }

$search = Invoke-RestMethod "$api/locations/search?q=Lagos&limit=1"
Write-Output ("location_search={0}" -f ($(if ($search.results.Count -ge 1) { 'PASS' } else { 'FAIL' })))
if (-not $search.results.Count) { $failed++ }

try {
  Invoke-WebRequest "$api/admin/system-health" -UseBasicParsing | Out-Null
  Write-Output 'admin_unauth=FAIL'
  $failed++
} catch {
  $code = [int]$_.Exception.Response.StatusCode
  Write-Output ("admin_unauth={0}" -f ($(if ($code -eq 401) { 'PASS' } else { "FAIL:$code" })))
  if ($code -ne 401) { $failed++ }
}

Write-Output ("smoke_failed_count={0}" -f $failed)
if ($failed -gt 0) { exit 1 }
exit 0
