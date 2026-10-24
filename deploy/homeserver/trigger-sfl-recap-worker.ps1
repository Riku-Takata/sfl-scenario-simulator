[CmdletBinding()]
param([string]$ProjectRoot = "D:\HomeServer", [string]$Repository = "Riku-Takata/sfl-scenario-simulator")
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
    $env:SFL_GH_PATH = $ghCommand
    $env:SFL_REPOSITORY = $Repository
    # Fetch only public descriptions here; Gemini generation stays in Actions.
    # Windows PowerShell 5 treats native stderr as ErrorRecords. Chapter
    # availability warnings must not abort the scheduled recheck.
    $ErrorActionPreference = "Continue"
    try {
        $output = & node --import tsx scripts/prepare-recap-chapters.ts --publish 2>&1
        $prepareExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = "Stop" }
    $output | ForEach-Object { Add-Content -LiteralPath $logFile -Value ("{0:o} {1}" -f [DateTime]::Now, $_) -Encoding UTF8; Write-Host $_ }
    if ($prepareExit -ne 0) { throw "Chapter preparation failed (exit $prepareExit)." }
    $marker = $output | Where-Object { [string]$_ -like "SFL_RECAP_SECTIONS=*" } | Select-Object -Last 1
    $sections = if ($marker) { ([string]$marker).Substring("SFL_RECAP_SECTIONS=".Length).Split(",") } else { @() }
    foreach ($section in $sections) {
        if ($section -notmatch '^div-[sf]-sec\d+$') { continue }
        & $ghCommand workflow run recap-worker.yml --repo $Repository --ref main -f "section=$section"
        if ($LASTEXITCODE -ne 0) { throw "Could not dispatch recap worker for $section." }
        Add-Content -LiteralPath $logFile -Value ("{0:o} Dispatched {1}" -f [DateTime]::Now, $section) -Encoding UTF8
    }
} finally {
    Remove-Item Env:SFL_GH_PATH, Env:SFL_REPOSITORY -ErrorAction SilentlyContinue
    Pop-Location
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
