[CmdletBinding()]
param(
    [string]$Repository = "Riku-Takata/sfl-scenario-simulator",
    [string]$ProjectRoot = "D:\HomeServer",
    [string]$PublicUrl
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$syncScript = Join-Path $PSScriptRoot "sync-sfl-release.ps1"
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$syncScript`" -Repository `"$Repository`" -ProjectRoot `"$ProjectRoot`""
if ($PublicUrl) { $arguments += " -PublicUrl `"$PublicUrl`"" }
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$daily = New-ScheduledTaskTrigger -Daily -At "00:00"
$daily.Repetition = (New-ScheduledTaskTrigger -Once -At "00:00" -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 1)).Repetition
$startup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName "HomeServer-SFL-Release-Sync" -Action $action -Trigger @($startup, $daily) -Settings $settings -Description "Polls the stable SFL site release, verifies its hashes, and applies the immutable build to Docker." -Force | Out-Null
Write-Host "Registered HomeServer-SFL-Release-Sync (startup + five-minute polling)."
