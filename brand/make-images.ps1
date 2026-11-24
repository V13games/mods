# Makes the logo and banner pictures from icon.html and banner.html, using Microsoft Edge (already on Windows).
# Run it from anywhere:   powershell -ExecutionPolicy Bypass -File brand\make-images.ps1
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here '..\content\images\brand'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$edgeProfile = Join-Path $env:TEMP 'neutral-brand-edge'
New-Item -ItemType Directory -Force $out | Out-Null

function Shoot($page, $png, $w, $h) {
  $url = 'file:///' + ((Join-Path $here $page) -replace '\\', '/')
  $file = Join-Path (Resolve-Path $out) $png
  $edgeArgs = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', "--user-data-dir=$edgeProfile",
            "--window-size=$w,$h", '--virtual-time-budget=6000', "--screenshot=$file", $url)
  Start-Process -FilePath $edge -ArgumentList $edgeArgs -Wait -NoNewWindow
  Write-Output "made $png"
}

Shoot 'icon.html' 'icon-512.png' 512 512
Shoot 'banner.html' 'banner.png' 1600 900
