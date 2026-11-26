param([Parameter(Mandatory)][string]$Ffmpeg)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$metroScratch = Join-Path $env:TEMP 'gunja-surface-frames'
$metroOutput = Join-Path (Get-Location).Path 'data/processed/textures'
New-Item -ItemType Directory -Force $metroScratch,$metroOutput | Out-Null

$metroPatches = @(
    @{ Video='gunja1.mp4'; Seconds=63; File='concourse-granite.png'; Box=@(51,1465,151,138) },
    @{ Video='gunja2.mp4'; Seconds=23; File='stair-granite.png'; Box=@(234,1214,138,55) },
    @{ Video='gunja2.mp4'; Seconds=23; File='wall-ceramic.png'; Box=@(723,290,22,21) }
)
foreach ($metroPatch in $metroPatches) {
    $metroJpg = Join-Path $metroScratch ($metroPatch.Video + '-' + $metroPatch.Seconds + '.jpg')
    if (!(Test-Path $metroJpg)) {
        & $Ffmpeg -hide_banner -loglevel error -ss $metroPatch.Seconds -i $metroPatch.Video -frames:v 1 -vf scale=960:-2 -q:v 2 -y $metroJpg
        if ($LASTEXITCODE -ne 0) { throw "Video frame extraction failed: $($metroPatch.Video)" }
    }
    $src = [Drawing.Image]::FromFile($metroJpg)
    $sample = [Drawing.Bitmap]::new(128,128)
    $draw = [Drawing.Graphics]::FromImage($sample)
    $draw.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $crop = [Drawing.Rectangle]::new($metroPatch.Box[0],$metroPatch.Box[1],$metroPatch.Box[2],$metroPatch.Box[3])
    $draw.DrawImage($src,[Drawing.Rectangle]::new(0,0,128,128),$crop,[Drawing.GraphicsUnit]::Pixel)
    $target = [Drawing.Bitmap]::new(256,256)
    for ($y=0; $y -lt 256; $y++) {
        $sy = [Math]::Min($y,255-$y)
        for ($x=0; $x -lt 256; $x++) {
            $sx = [Math]::Min($x,255-$x)
            $target.SetPixel($x,$y,$sample.GetPixel($sx,$sy))
        }
    }
    $target.Save((Join-Path $metroOutput $metroPatch.File),[Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
    $draw.Dispose()
    $sample.Dispose()
    $src.Dispose()
}
