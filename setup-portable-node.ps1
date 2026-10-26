$ErrorActionPreference = "Stop"
$version = "v24.22.1"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path $root ".tools"
$dest = Join-Path $tools "node"
$nodeExe = Join-Path $dest "node.exe"

if (Test-Path $nodeExe) {
  Write-Host "Portable Node.js already present."
  exit 0
}

New-Item -ItemType Directory -Force -Path $tools | Out-Null
$zip = Join-Path $env:TEMP "ovp-node-$version.zip"
$url = "https://nodejs.org/dist/$version/node-$version-win-x64.zip"

Write-Host "Downloading Node.js $version (one-time, ~40 MB)..."
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host "Unpacking..."
Expand-Archive -Path $zip -DestinationPath $tools -Force
$extracted = Join-Path $tools "node-$version-win-x64"
if (Test-Path $dest) {
  Remove-Item $dest -Recurse -Force
}
Rename-Item $extracted "node"
Remove-Item $zip -Force

if (-not (Test-Path $nodeExe)) {
  throw "Portable Node.js extract failed."
}

Write-Host "Node.js is ready."
