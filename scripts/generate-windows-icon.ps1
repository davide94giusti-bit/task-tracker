$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'build\icon-source.png'
$target = Join-Path $root 'build\brand-icon.ico'

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  throw 'ImageMagick 7 (magick.exe) is required to regenerate the Windows icon.'
}

& magick $source -define 'icon:auto-resize=256,128,64,48,40,32,24,20,16' $target
if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }
Write-Host "Generated $target from $source"
