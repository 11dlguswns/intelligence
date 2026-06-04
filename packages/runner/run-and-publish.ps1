# Run one condition-monitor measurement, then commit & push the results
# (triggers the GitHub Pages deploy). Run this on a schedule to build the
# time-series and keep each model's baseline current.
#
#   ./packages/runner/run-and-publish.ps1 -Models "opus,sonnet,haiku"
#
# Requires: claude logged in (subscription), git remote configured.
# Note: effort is PINNED in config.mjs (low) — do not override it here, or the
# latency baseline becomes incomparable.

param(
  [string]$Models = "opus,sonnet,haiku"
)

$ErrorActionPreference = "Stop"

# repo root = two levels up from packages/runner/
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo

Write-Host "Condition run: models=$Models"
node "packages/runner/src/bench.mjs" --models $Models

git add packages/web/public/data
$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm")
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "data: condition run $stamp"
  git push
  Write-Host "Published results for $stamp"
} else {
  Write-Host "No data changes to publish."
}
