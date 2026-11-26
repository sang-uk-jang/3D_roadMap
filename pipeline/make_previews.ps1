Add-Type -AssemblyName System.Drawing

$previewDir = (Resolve-Path 'artifacts/previews').Path
$plan = Get-Content -Raw -Encoding UTF8 'data/annotations/floorplan.json' | ConvertFrom-Json
$fontFamily = New-Object Drawing.FontFamily 'Malgun Gothic'
$titleFont = New-Object Drawing.Font $fontFamily, 47, Bold, Pixel
$bodyFont = New-Object Drawing.Font $fontFamily, 23, Regular, Pixel
$legendFont = New-Object Drawing.Font $fontFamily, 21, Bold, Pixel

function Brush([string]$hex) {
    return New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($hex))
}

$canvas = Brush '#F6F7F3'
$ink = Brush '#172B30'
$muted = Brush '#526165'
$panel = Brush '#FFFFFF'
$divider = Brush '#CCD5D0'

function New-Board([int]$height) {
    $bitmap = New-Object Drawing.Bitmap 1800, $height
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.FillRectangle($canvas, 0, 0, 1800, $height)
    return $bitmap, $graphics
}

function Write-Title($graphics, [string]$title, [string]$subtitle) {
    $graphics.DrawString($title, $titleFont, $ink, 65, 32)
    $graphics.DrawString($subtitle, $bodyFont, $muted, 68, 100)
    $graphics.FillRectangle($divider, 69, 151, 1662, 2)
}

function Write-Legend($graphics, [int]$y, $items) {
    $x = 69
    foreach ($item in $items) {
        $chip = Brush $item[0]
        $graphics.FillRectangle($chip, $x, $y + 8, 24, 16)
        $graphics.DrawString($item[1], $legendFont, $ink, $x + 34, $y)
        $x += 50 + [int]$graphics.MeasureString($item[1], $legendFont).Width + 30
        $chip.Dispose()
    }
}

$views = @(
    @('map', '군자역 3D 모델', '역사 안내도와 같은 방향에서 본 B1~B3 배치', 'gunja-3d.png'),
    @('inspection', '군자역 위쪽에서 보기', '외곽 벽과 승강장 차단벽, 계단 입구 확인', 'gunja-walls.png')
)
foreach ($view in $views) {
    $bitmap, $graphics = New-Board 1505
    Write-Title $graphics $view[1] $view[2]
    $render = [Drawing.Image]::FromFile((Join-Path $previewDir "gunja-$($view[0]).png"))
    $graphics.FillRectangle($panel, 24, 170, 1752, 1200)
    $graphics.DrawImage($render, 36, 171, 1728, 1200)
    Write-Legend $graphics 1400 @(
        @('#D9D8D1','대합실·환승통로'),
        @('#B7ADD2','B2 5호선 승강장'),
        @('#A9BD9E','B3 7호선 승강장'),
        @('#687774','추정 외곽 벽'),
        @('#779597','추정 승강장 차단벽')
    )
    $graphics.DrawString('군자역 역사 안내도 기반 · 층간 높이와 벽 위치 및 치수는 추정', $bodyFont, $muted, 68, 1450)
    $bitmap.Save((Join-Path $previewDir $view[3]), [Drawing.Imaging.ImageFormat]::Png)
    $render.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

$bitmap, $graphics = New-Board 1130
Write-Title $graphics '군자역 안내도 대조' '3D 모델에 사용한 바닥 외곽과 층간 연결 기준점을 원본에 겹쳐 표시'
$source = [Drawing.Image]::FromFile((Resolve-Path $plan.source).Path)
$ratio = $source.Width / 3200.0
$cropX = 280
$cropY = 1108
$scale = 0.64
$crop = New-Object Drawing.RectangleF ($cropX * $ratio), ($cropY * $ratio), (2570 * $ratio), (1365 * $ratio)
$dest = New-Object Drawing.RectangleF 80, 168, (2570 * $scale), (1365 * $scale)
$graphics.DrawImage($source, $dest, $crop, [Drawing.GraphicsUnit]::Pixel)

function Map-Point($xz, [string]$floor) {
    $origin = $plan.coordinateSystem.sourceProjection.origin
    $x = $origin[0] + 10 * $xz[0] - 5.062 * $xz[1]
    $y = $origin[1] + 1.64 * $xz[0] + 3.24 * $xz[1] - 10.56 * $plan.floors.$floor
    return New-Object Drawing.PointF (80 + ($x - $cropX) * $scale), (168 + ($y - $cropY) * $scale)
}

$lineColors = @{ B1='#236886'; B2='#7548A0'; B3='#36794A' }
$areaLevels = @{ G = 'G' }
foreach ($area in $plan.areas) {
    $areaLevels[$area.id] = $area.floor
    $color = [Drawing.ColorTranslator]::FromHtml($lineColors[$area.floor])
    $linePen = New-Object Drawing.Pen $color, 2.7
    foreach ($polygon in $area.polygons) {
        $points = [Drawing.PointF[]]@($polygon | ForEach-Object { Map-Point $_ $area.floor })
        $graphics.DrawPolygon($linePen, $points)
    }
    $linePen.Dispose()
}
$pointBrush = Brush '#A94731'
foreach ($connector in $plan.connectors) {
    foreach ($endpoint in @($connector.upper, $connector.lower)) {
        $p = Map-Point @($endpoint[1], $endpoint[2]) $areaLevels[$endpoint[0]]
        $graphics.FillEllipse($panel, $p.X - 5, $p.Y - 5, 10, 10)
        $graphics.FillEllipse($pointBrush, $p.X - 3, $p.Y - 3, 6, 6)
    }
}
Write-Legend $graphics 1064 @(
    @($lineColors.B1,'B1 바닥 외곽'),
    @($lineColors.B2,'B2 바닥 외곽'),
    @($lineColors.B3,'B3 바닥 외곽'),
    @('#A94731','계단·에스컬레이터 시작·도착점')
)
$bitmap.Save((Join-Path $previewDir 'gunja-source-overlay.png'), [Drawing.Imaging.ImageFormat]::Png)
$source.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
foreach ($resource in @($fontFamily,$titleFont,$bodyFont,$legendFont,$canvas,$ink,$muted,$panel,$divider,$pointBrush)) {
    $resource.Dispose()
}
