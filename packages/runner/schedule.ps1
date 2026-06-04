# Register a recurring Windows Scheduled Task that measures the intelligence score and
# publishes results. Default = every hour (real-time, hour-by-hour tracking).
#
#   ./packages/runner/schedule.ps1 -IntervalMinutes 60                    # hourly (default)
#   ./packages/runner/schedule.ps1 -IntervalMinutes 30 -Models "opus"     # every 30 min, opus only
#   ./packages/runner/schedule.ps1 -IntervalMinutes 0  -Time "09:00"      # once daily instead
#
# Remove with:
#   Unregister-ScheduledTask -TaskName "ClaudeIntelligenceMonitor" -Confirm:$false
#
# COST NOTE: each run = (questions x 2 calls) x models. Hourly x 3 models is heavy on
# rate limits (esp. the Opus judge). If you hit limits, raise -IntervalMinutes or cut
# -Models. effort is pinned in config.mjs.

param(
  [string]$Models = "opus,sonnet,haiku",
  [int]$IntervalMinutes = 60,
  [string]$Time = "09:00",
  [string]$TaskName = "ClaudeIntelligenceMonitor"
)

$ErrorActionPreference = "Stop"

$publish = Join-Path $PSScriptRoot "run-and-publish.ps1"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$publish`" -Models `"$Models`"" `
  -WorkingDirectory $repo

if ($IntervalMinutes -gt 0) {
  # Repeat every N minutes, indefinitely, starting ~2 minutes from now.
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)
  $rep = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
      -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
      -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition
  $trigger.Repetition = $rep
  $cadence = "every $IntervalMinutes min"
} else {
  $trigger = New-ScheduledTaskTrigger -Daily -At $Time
  $cadence = "daily at $Time"
}

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Claude intelligence-score monitor + publish" `
  -Force

Write-Host "Registered '$TaskName' — $cadence (models=$Models). First run in ~2 min."
