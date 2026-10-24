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
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$syncScript`" -Repository `"$Repository`" -ProjectRoot `"$ProjectRoot`""
if ($PublicUrl) { $arguments += " -PublicUrl `"$PublicUrl`"" }
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$triggers = @(3, 13, 20 | ForEach-Object { New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today.AddHours($_)) })
$taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName "HomeServer-SFL-Release-Sync" -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description "Checks stable SFL site releases at 03:00, 13:00 and 20:00, verifies hashes, and updates Docker." -Force -ErrorAction Stop | Out-Null
Write-Host "Registered HomeServer-SFL-Release-Sync (03:00 / 13:00 / 20:00; no wake or missed-run catch-up)."
