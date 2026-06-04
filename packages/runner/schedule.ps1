# Register a daily Windows Scheduled Task that runs the condition monitor and
# publishes results. Measuring at the SAME time each day keeps latency comparable.
#
#   ./packages/runner/schedule.ps1 -Models "opus,sonnet,haiku" -Time "09:00"
#
# Re-run with the same name to update it. Remove with:
#   Unregister-ScheduledTask -TaskName "ClaudeConditionMonitor" -Confirm:$false

param(
  [string]$Models = "opus,sonnet,haiku",
  [string]$Time = "09:00",
  [string]$TaskName = "ClaudeConditionMonitor"
)

$ErrorActionPreference = "Stop"

$publish = Join-Path $PSScriptRoot "run-and-publish.ps1"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$publish`" -Models `"$Models`"" `
  -WorkingDirectory $repo

$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Daily Claude condition monitor + publish" `
  -Force

Write-Host "Registered scheduled task '$TaskName' — daily at $Time (models=$Models)."
