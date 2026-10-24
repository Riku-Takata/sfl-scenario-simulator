[CmdletBinding()]
param([string]$ProjectRoot = "D:\HomeServer", [string]$Repository = "Riku-Takata/sfl-scenario-simulator", [switch]$ResumeOnly)
$ErrorActionPreference = "Stop"
$sflRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$appDirectory = Join-Path $sflRoot "apps\sfl-scenario-simulator"
$logFile = Join-Path $sflRoot "logs\sfl-recap-trigger.log"
$ghCommand = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $ghCommand) {
    $ghCommand = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages") -Recurse -Filter gh.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $ghCommand) { throw "GitHub CLI is required." }
$mutex = [Threading.Mutex]::new($false, "Global\HomeServer-SFL-Recap-Trigger")
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); return }
Push-Location -LiteralPath $appDirectory
try {
    $runsJson = & $ghCommand run list --repo $Repository --limit 30 --json workflowName,status
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect active workflows." }
    $runs = $runsJson | ConvertFrom-Json
    $busy = @($runs | Where-Object {
        $_.workflowName -in @("SFL Recap Evidence & Article Worker", "SFL 2026 Auto Result Fetch & Scenario Update") -and
        $_.status -in @("queued", "pending", "in_progress", "waiting", "requested")
    })
    if ($busy.Count) {
        Add-Content -LiteralPath $logFile -Value ("{0:o} Data writer is busy; the next periodic check will resume work." -f [DateTime]::Now) -Encoding UTF8
        return
    }
    $stateDirectory = Join-Path $sflRoot "data\app-data\sfl-recap"
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $stateFile = Join-Path $stateDirectory "archive-check.json"
    $jstNow = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, "Tokyo Standard Time")
    $lastWindow = @($jstNow.Date.AddDays(-1).AddHours(8), $jstNow.Date.AddMinutes(10), $jstNow.Date.AddHours(8)) | Where-Object { $_ -le $jstNow } | Sort-Object -Descending | Select-Object -First 1
    $lastWindowUtc = [TimeZoneInfo]::ConvertTimeToUtc([DateTime]::SpecifyKind($lastWindow, [DateTimeKind]::Unspecified), [TimeZoneInfo]::FindSystemTimeZoneById("Tokyo Standard Time"))
    $previous = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
    $checkArchives = -not $ResumeOnly -or -not $previous -or [DateTime]$previous.checkedAt -lt $lastWindowUtc
    $env:SFL_GH_PATH = $ghCommand
    $env:SFL_REPOSITORY = $Repository
    $codexCommand = (Get-Command codex -ErrorAction SilentlyContinue).Source
    if (-not $codexCommand) {
        $codexCommand = Get-ChildItem (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin") -Filter codex.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if ($codexCommand) { $env:SFL_CODEX_PATH = $codexCommand }
    $env:SFL_WRITER_CACHE_DIR = Join-Path $stateDirectory "writer"
    # Fetch public descriptions and write from verified evidence with local Codex.
    # Video extraction and independent verification stay in Actions.
    # Windows PowerShell 5 treats native stderr as ErrorRecords. Chapter
    # availability warnings must not abort the scheduled recheck.
    $ErrorActionPreference = "Continue"
    try {
        $prepareArgs = @("--import", "tsx", "scripts/prepare-recap-chapters.ts", "--publish", "--write-with-codex")
        if (-not $checkArchives) { $prepareArgs += "--ready-only" }
        $output = & node @prepareArgs 2>&1
        $prepareExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = "Stop" }
    $output | Where-Object { [string]$_ -notlike "SFL_RECAP_CACHE=*" -and [string]$_ -notlike "SFL_NARRATIVE_CACHE=*" } | ForEach-Object { Add-Content -LiteralPath $logFile -Value ("{0:o} {1}" -f [DateTime]::Now, $_) -Encoding UTF8; Write-Host $_ }
    if ($prepareExit -ne 0) { throw "Chapter preparation failed (exit $prepareExit)." }
    $marker = $output | Where-Object { [string]$_ -like "SFL_RECAP_SECTIONS=*" } | Select-Object -Last 1
    $sections = if ($marker) { ([string]$marker).Substring("SFL_RECAP_SECTIONS=".Length).Split(",") } else { @() }
    $section = $sections | Where-Object { $_ -match '^div-[sf]-sec\d+$' } | Select-Object -First 1
    $cacheMarker = $output | Where-Object { [string]$_ -like "SFL_RECAP_CACHE=*" } | Select-Object -Last 1
    $chapterCache = if ($cacheMarker) { ([string]$cacheMarker).Substring("SFL_RECAP_CACHE=".Length) } else { "" }
    $narrativeMarker = $output | Where-Object { [string]$_ -like "SFL_NARRATIVE_CACHE=*" } | Select-Object -Last 1
    $narrativeCache = if ($narrativeMarker) { ([string]$narrativeMarker).Substring("SFL_NARRATIVE_CACHE=".Length) } else { "" }
    if ($section -or $chapterCache -or $narrativeCache) {
        $archiveFlag = if ($checkArchives) { "true" } else { "false" }
        $dispatchArgs = @("workflow", "run", "recap-worker.yml", "--repo", $Repository, "--ref", "main", "-f", "check_archives=$archiveFlag")
        if ($section) { $dispatchArgs += @("-f", "section=$section") }
        if ($chapterCache) { $dispatchArgs += @("-f", "chapter_cache=$chapterCache") }
        if ($narrativeCache) { $dispatchArgs += @("-f", "narrative_cache=$narrativeCache") }
        & $ghCommand @dispatchArgs
        if ($LASTEXITCODE -ne 0) { throw "Could not dispatch recap worker for $section." }
        Add-Content -LiteralPath $logFile -Value ("{0:o} Dispatched {1}" -f [DateTime]::Now, $section) -Encoding UTF8
    }
    if ($checkArchives) { @{ checkedAt = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8 }
} finally {
    Remove-Item Env:SFL_GH_PATH, Env:SFL_REPOSITORY, Env:SFL_CODEX_PATH, Env:SFL_WRITER_CACHE_DIR -ErrorAction SilentlyContinue
    Pop-Location
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
