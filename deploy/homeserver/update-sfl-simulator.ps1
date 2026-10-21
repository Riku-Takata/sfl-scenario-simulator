[CmdletBinding()]
param(
    [string]$ProjectRoot = "D:\HomeServer",
    [switch]$Force,
    [switch]$CommitAndPush,
    [switch]$RebuildContainer,
    [switch]$LocalBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$appDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$composeFile = Join-Path $ProjectRoot "compose.yaml"

if (-not $LocalBuild) {
    & (Join-Path $PSScriptRoot "sync-sfl-release.ps1") -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "SFL stable release sync failed." }
    return
}

Push-Location $appDir
try {
    $pipelineArgs = @("run", "pipeline")
    $extra = @()
    if ($Force) { $extra += "--force" }
    if ($CommitAndPush) { $extra += @("--commit", "--push") }
    if ($extra.Count -gt 0) { $pipelineArgs += "--"; $pipelineArgs += $extra }
    Write-Host "ローカル開発用SFLパイプラインを実行しています..."
    & npm.cmd @pipelineArgs
    if ($LASTEXITCODE -ne 0) { throw "SFLパイプラインに失敗しました。" }
} finally { Pop-Location }

if ($RebuildContainer) {
    $image = "homeserver-sfl-simulator:local"
    docker build --tag $image $appDir
    if ($LASTEXITCODE -ne 0) { throw "ローカルSFLイメージのビルドに失敗しました。" }
    $env:SFL_SIMULATOR_IMAGE = $image
    try {
        docker compose --file $composeFile --profile normal up -d --no-build sfl-simulator
        if ($LASTEXITCODE -ne 0) { throw "ローカルSFLコンテナを更新できませんでした。" }
    } finally { Remove-Item Env:\SFL_SIMULATOR_IMAGE -ErrorAction SilentlyContinue }
}
