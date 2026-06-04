# Run the benchmark, then commit & push the results (triggers the Pages deploy).
#
#   ./packages/runner/run-and-publish.ps1 -Models "opus,sonnet,haiku" -Repeat 5
#
# Requires: claude logged in (subscription), git remote configured.

param(
  [string]$Models = "opus,sonnet,haiku",
  [int]$Repeat = 5,
  [string]$Effort = "high"
)

$ErrorActionPreference = "Stop"

# repo root = two levels up from packages/runner/
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo

Write-Host "Running benchmark: models=$Models repeat=$Repeat effort=$Effort"
node "packages/runner/src/bench.mjs" --models $Models --repeat $Repeat --effort $Effort

git add packages/web/public/data
$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm")
# Commit only if there is something staged.
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "data: benchmark run $stamp"
  git push
  Write-Host "Published results for $stamp"
} else {
  Write-Host "No data changes to publish."
}
