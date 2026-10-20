# Package OpenGrab: bundles the yt-dlp engine next to the app executable and
# produces a portable zip. Run after `wails build`.
param(
    [string]$YtDlpSource = "$env:APPDATA\OpenGrab\bin\yt-dlp.exe"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root 'build\bin'

if (-not (Test-Path (Join-Path $bin 'OpenGrab.exe'))) {
    throw "OpenGrab.exe not found in $bin - run 'wails build' first."
}
if (-not (Test-Path $YtDlpSource)) {
    throw "yt-dlp.exe not found at $YtDlpSource - open the app settings and run 检查更新 once to download it."
}

Copy-Item $YtDlpSource $bin -Force
Write-Host "Bundled engine: $(Join-Path $bin 'yt-dlp.exe')"

$zip = Join-Path $root 'build\OpenGrab-portable.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $bin 'OpenGrab.exe'), (Join-Path $bin 'yt-dlp.exe') -DestinationPath $zip
Write-Host "Created $zip"
Write-Host 'Portable layout: extract anywhere, OpenGrab.exe + yt-dlp.exe side by side.'
