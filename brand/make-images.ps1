# Makes every logo and banner picture from icon.html and banner.html, using Microsoft Edge (already on Windows).
# Run it from anywhere:   powershell -ExecutionPolicy Bypass -File brand\make-images.ps1
#
#   brand/social/discord-icon.png     512 x 512    Discord server icon (and the bot's picture)
#   brand/social/discord-banner.png   1920 x 1080  Discord server banner
#   brand/social/youtube-icon.png     800 x 800    YouTube profile picture
#   brand/social/youtube-banner.png   2560 x 1440  YouTube banner (logo and name inside the part every device shows)
#   content/images/brand/icon-512.png               the website's phone icon
#   content/images/brand/banner.png    1600 x 900   the picture shown when the website is shared
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$social = Join-Path $here 'social'
$site = Join-Path $here '..\content\images\brand'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$edgeProfile = Join-Path $env:TEMP 'neutral-brand-edge'
New-Item -ItemType Directory -Force $social, $site | Out-Null

function Shoot($page, $query, $folder, $png, $w, $h) {
  $url = 'file:///' + ((Join-Path $here $page) -replace '\\', '/') + $query
  $file = Join-Path (Resolve-Path $folder) $png
  $edgeArgs = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', "--user-data-dir=$edgeProfile",
            "--window-size=$w,$h", '--virtual-time-budget=6000', "--screenshot=$file", $url)
  Start-Process -FilePath $edge -ArgumentList $edgeArgs -Wait -NoNewWindow
  Write-Output "made $png ($w x $h)"
}

Shoot 'icon.html'   ''        $social 'discord-icon.png'   512  512
Shoot 'banner.html' '?s=1.35' $social 'discord-banner.png' 1920 1080
Shoot 'icon.html'   ''        $social 'youtube-icon.png'   800  800
Shoot 'banner.html' '?s=1'    $social 'youtube-banner.png' 2560 1440
Shoot 'icon.html'   ''        $site   'icon-512.png'       512  512
Shoot 'banner.html' '?s=1.35' $site   'banner.png'         1600 900
