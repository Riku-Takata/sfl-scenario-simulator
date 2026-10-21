[CmdletBinding()]
param(
    [string]$Repository = "Riku-Takata/sfl-scenario-simulator",
    [string]$ProjectRoot = "D:\HomeServer",
    [string]$HealthUrl = "http://127.0.0.1:3002",
    [string]$PublicUrl,
    [switch]$Rollback
)

$ErrorActionPreference = "Stop"
$script:ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Join-Path $script:ProjectRoot "apps\sfl-scenario-simulator"
$stateRoot = Join-Path $script:ProjectRoot "data\app-data\sfl-deploy"
$releaseRoot = Join-Path $stateRoot "releases"
$stateFile = Join-Path $stateRoot "current.json"
$logFile = Join-Path $script:ProjectRoot "logs\sfl-release-sync.log"
$composeFile = Join-Path $script:ProjectRoot "compose.yaml"
$mutex = [Threading.Mutex]::new($false, "Global\HomeServer-SFL-Release-Sync")

function Write-SyncLog([string]$Message) {
    $line = "{0:o} {1}" -f [DateTime]::Now, $Message
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Get-BuildInfo([string]$BaseUrl) {
    try {
        $info = Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/build-info.json" -TimeoutSec 12
        if ($info.service -ne "sfl-scenario-simulator" -or -not $info.buildId -or -not $info.contentHash) { return $null }
        return $info
    } catch { return $null }
}

function Get-StableRelease {
    $releases = gh api "repos/$Repository/releases?per_page=100" | ConvertFrom-Json
    return $releases |
        Where-Object { $_.tag_name -like "sfl-site-*" -and -not $_.draft -and -not $_.prerelease } |
        Sort-Object { [DateTime]$_.published_at } -Descending |
        Select-Object -First 1
}

function Assert-ReleaseFiles([string]$Directory, $Manifest) {
    if ($Manifest.schemaVersion -ne 1 -or $Manifest.service -ne "sfl-scenario-simulator") { throw "Unsupported release manifest." }
    if ([string]$Manifest.buildId -notmatch '^[A-Za-z0-9._-]+$') { throw "Unsafe build id in release manifest." }
    foreach ($entry in $Manifest.files.PSObject.Properties) {
        $relative = [string]$entry.Name
        if ([IO.Path]::IsPathRooted($relative) -or $relative -match '(^|[/\\])\.\.([/\\]|$)') { throw "Unsafe manifest path: $relative" }
        $file = Join-Path $Directory ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Release file missing: $relative" }
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne ([string]$entry.Value).ToLowerInvariant()) { throw "SHA-256 mismatch: $relative" }
    }
    $info = Get-Content -LiteralPath (Join-Path $Directory "dist\build-info.json") -Raw | ConvertFrom-Json
    if ($info.buildId -ne $Manifest.buildId -or $info.contentHash -ne $Manifest.contentHash) { throw "Manifest and build-info disagree." }
}

if (-not $mutex.WaitOne(0)) { Write-SyncLog "Another sync is running; skipped."; exit 0 }
try {
    New-Item -ItemType Directory -Force -Path $releaseRoot, (Split-Path $logFile) | Out-Null
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) is required." }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker CLI is required." }

    $stable = Get-StableRelease
    if (-not $stable) { throw "No stable sfl-site-* GitHub Release found in $Repository." }
    $manifest = $null
    $target = $stable
    if ($Rollback) {
        $currentState = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
        $releases = gh api "repos/$Repository/releases?per_page=100" | ConvertFrom-Json |
            Where-Object { $_.tag_name -like "sfl-site-*" -and -not $_.draft -and -not $_.prerelease } |
            Sort-Object { [DateTime]$_.published_at } -Descending
        $target = $releases | Where-Object { $_.tag_name -ne $currentState.releaseTag } | Select-Object -First 1
        if (-not $target) { throw "No previous stable site release available for rollback." }
    }

    $work = Join-Path $releaseRoot (".incoming-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    try {
        gh release download $target.tag_name --repo $Repository --pattern "sfl-site.zip" --dir $work
        if ($LASTEXITCODE -ne 0) { throw "Could not download $($target.tag_name)." }
        $zipPath = Join-Path $work "sfl-site.zip"
        $zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
        try {
            foreach ($entry in $zip.Entries) {
                $name = $entry.FullName.Replace('\', '/')
                if ([IO.Path]::IsPathRooted($name) -or $name -match '(^|/)\.\.(/|$)') { throw "Unsafe ZIP entry: $name" }
            }
        } finally { $zip.Dispose() }
        $expanded = Join-Path $work "expanded"
        Expand-Archive -LiteralPath $zipPath -DestinationPath $expanded
        $manifest = Get-Content -LiteralPath (Join-Path $expanded "release-manifest.json") -Raw | ConvertFrom-Json
        Assert-ReleaseFiles $expanded $manifest
        if ($target.tag_name -ne "sfl-site-$($manifest.buildId)") { throw "Release tag and build id disagree." }

        $currentState = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
        if (-not $Rollback -and $currentState.buildId -eq $manifest.buildId) {
            $served = Get-BuildInfo $HealthUrl
            if ($served -and $served.buildId -eq $manifest.buildId) { Write-SyncLog "Already serving $($manifest.buildId)."; return }
        }
        # Prevent an older run from replacing a release published while this download was in flight.
        if (-not $Rollback) {
            $latestNow = Get-StableRelease
            if ($latestNow.tag_name -ne $target.tag_name) { throw "Release changed during sync; retry against $($latestNow.tag_name)." }
        }

        $releaseDir = Join-Path $releaseRoot $manifest.buildId
        if (Test-Path -LiteralPath $releaseDir) { Remove-Item -LiteralPath $releaseDir -Recurse -Force }
        Move-Item -LiteralPath $expanded -Destination $releaseDir
        $image = "homeserver-sfl-release:$($manifest.buildId)"
        docker build --pull --tag $image --file (Join-Path $releaseDir "runtime\Dockerfile") $releaseDir
        if ($LASTEXITCODE -ne 0) { throw "Docker build failed for $image." }

        try {
            $env:SFL_SIMULATOR_IMAGE = $image
            docker compose --file $composeFile --profile normal up -d --no-build sfl-simulator
            if ($LASTEXITCODE -ne 0) { throw "Compose could not apply $image." }

            $container = docker exec home-sfl-simulator node -e "fetch('http://127.0.0.1:3000/build-info.json').then(r=>r.json()).then(x=>{console.log(JSON.stringify(x));if(x.service!=='sfl-scenario-simulator'||x.buildId!=='$($manifest.buildId)'||x.contentHash!=='$($manifest.contentHash)')process.exit(2)}).catch(()=>process.exit(3))"
            if ($LASTEXITCODE -ne 0) { throw "Container build identity check failed: $container" }
            $served = $null
            for ($attempt = 0; $attempt -lt 8; $attempt++) {
                $served = Get-BuildInfo $HealthUrl
                if ($served -and $served.buildId -eq $manifest.buildId -and $served.contentHash -eq $manifest.contentHash) { break }
                Start-Sleep -Seconds 2
            }
            if (-not $served -or $served.buildId -ne $manifest.buildId -or $served.contentHash -ne $manifest.contentHash) {
                $other = if ($served) { "service=$($served.service), buildId=$($served.buildId)" } else { "no valid SFL build-info response" }
                throw "Host URL $HealthUrl did not serve expected SFL build $($manifest.buildId): $other"
            }
            $health = Invoke-RestMethod -Uri "$($HealthUrl.TrimEnd('/'))/api/health" -TimeoutSec 12
            if ($health.service -ne "sfl-scenario-simulator" -or $health.buildId -ne $manifest.buildId) { throw "Host health identity check failed." }
            if ($PublicUrl) {
                $public = Get-BuildInfo $PublicUrl
                if (-not $public -or $public.buildId -ne $manifest.buildId -or $public.contentHash -ne $manifest.contentHash) {
                    throw "Public URL $PublicUrl does not serve the applied SFL build $($manifest.buildId)."
                }
            }
            $state = [pscustomobject]@{ buildId = $manifest.buildId; contentHash = $manifest.contentHash; sourceCommit = $manifest.sourceCommit; releaseTag = $target.tag_name; appliedAt = [DateTime]::UtcNow.ToString("o") }
            $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
            Write-SyncLog "Applied $($manifest.buildId) from $($target.tag_name); host URL verified."
        } catch {
            if ($currentState -and $currentState.buildId) {
                $previousImage = "homeserver-sfl-release:$($currentState.buildId)"
                $env:SFL_SIMULATOR_IMAGE = $previousImage
                docker compose --file $composeFile --profile normal up -d --no-build sfl-simulator | Out-Null
            } else {
                Remove-Item Env:\SFL_SIMULATOR_IMAGE -ErrorAction SilentlyContinue
                docker compose --file $composeFile --profile normal up -d --no-build sfl-simulator | Out-Null
            }
            throw
        } finally { Remove-Item Env:\SFL_SIMULATOR_IMAGE -ErrorAction SilentlyContinue }
    } finally {
        if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
    }
} catch {
    Write-SyncLog "FAILED: $($_.Exception.Message)"
    exit 1
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
