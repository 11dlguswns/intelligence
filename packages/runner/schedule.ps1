# Register a daily Windows Scheduled Task that runs the benchmark and publishes results.
#
#   ./packages/runner/schedule.ps1 -Models "opus,sonnet,haiku" -Repeat 5 -Time "09:00"
#
# Re-run with the same name to update it. Remove with:
#   Unregister-ScheduledTask -TaskName "ClaudeIntelligenceMonitor" -Confirm:$false

param(
  [string]$Models = "opus,sonnet,haiku",
  [int]$Repeat = 5,
  [string]$Time = "09:00",
  [string]$TaskName = "ClaudeIntelligenceMonitor"
)

$ErrorActionPreference = "Stop"

$publish = Join-Path $PSScriptRoot "run-and-publish.ps1"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$publish`" -Models `"$Models`" -Repeat $Repeat" `
  -WorkingDirectory $repo

$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Daily Claude intelligence benchmark + publish" `
  -Force

Write-Host "Registered scheduled task '$TaskName' — daily at $Time (models=$Models, repeat=$Repeat)."
