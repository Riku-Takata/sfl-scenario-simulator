[CmdletBinding()]
param([string]$ProjectRoot = "D:\HomeServer", [string]$Repository = "Riku-Takata/sfl-scenario-simulator")
$ErrorActionPreference = "Stop"
$sflRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$triggerScript = Join-Path $PSScriptRoot "trigger-sfl-recap-worker.ps1"
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$triggerScript`" -ProjectRoot `"$sflRoot`" -Repository `"$Repository`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$triggers = @((New-ScheduledTaskTrigger -Daily -At "00:10"), (New-ScheduledTaskTrigger -Daily -At "08:00"))
$taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName "HomeServer-SFL-Recap-Worker" -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description "Cache official chapters and resume SFL articles at 00:10 and 08:00 JST." -Force -ErrorAction Stop | Out-Null
Write-Host "Registered HomeServer-SFL-Recap-Worker (00:10 / 08:00 JST)."
$resumeAction = New-ScheduledTaskAction -Execute $powershell -Argument ($arguments + " -ResumeOnly")
$resumeTriggers = @(3, 13, 20 | ForEach-Object { New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today.AddHours($_)) })
Register-ScheduledTask -TaskName "HomeServer-SFL-Recap-Continue" -Action $resumeAction -Trigger $resumeTriggers -Principal $principal -Settings $settings -Description "Resume local Codex writing and due SFL articles at 03:00, 13:00 and 20:00; skip busy writers." -Force -ErrorAction Stop | Out-Null
Write-Host "Registered HomeServer-SFL-Recap-Continue (03:00 / 13:00 / 20:00)."
