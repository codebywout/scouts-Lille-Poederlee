# Generates high-quality responsive JPEG + WebP derivatives.
# Never overwrites original source files.
# Usage: powershell -File tools/generate-image-variants.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Cwebp = Join-Path $PSScriptRoot 'libwebp\libwebp-1.4.0-windows-x64\bin\cwebp.exe'
if (-not (Test-Path $Cwebp)) {
  throw "cwebp not found at $Cwebp"
}

# Quality-first settings (perceived quality over minimal bytes).
$JpegQuality = 88L
$WebpQuality = 85
$Widths = @(480, 800, 1200, 1600, 2400)

function Get-SourceSize([string]$Path) {
  $img = [Drawing.Image]::FromFile($Path)
  try {
    return @{ Width = $img.Width; Height = $img.Height }
  } finally { $img.Dispose() }
}

function Write-JpegWidth {
  param([string]$Source, [string]$Dest, [int]$TargetWidth, [long]$Quality)
  $img = [Drawing.Image]::FromFile($Source)
  try {
    if ($img.Width -le $TargetWidth) {
      $nw = $img.Width
      $nh = $img.Height
    } else {
      $nw = $TargetWidth
      $nh = [int][math]::Round($img.Height * ($TargetWidth / [double]$img.Width))
    }
    $bmp = New-Object Drawing.Bitmap $nw, $nh
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $nw, $nh)
    $g.Dispose()

    $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
      Where-Object { $_.MimeType -eq 'image/jpeg' }
    $eps = New-Object Drawing.Imaging.EncoderParameters 1
    $eps.Param[0] = New-Object Drawing.Imaging.EncoderParameter (
      [Drawing.Imaging.Encoder]::Quality), $Quality
    $tmp = "$Dest.__tmp"
    if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
    if (Test-Path $Dest) { Remove-Item -LiteralPath $Dest -Force }
    $bmp.Save($tmp, $codec, $eps)
    $bmp.Dispose()
    Rename-Item -LiteralPath $tmp -NewName (Split-Path $Dest -Leaf)
    return @{ Width = $nw; Height = $nh }
  } finally { $img.Dispose() }
}

function Write-WebpFromJpeg {
  param([string]$JpegPath, [string]$WebpPath)
  $tmp = "$WebpPath.__tmp"
  if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
  & $Cwebp -q $WebpQuality -m 6 -af -quiet $JpegPath -o $tmp | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmp)) {
    throw "cwebp failed for $JpegPath"
  }
  if (Test-Path $WebpPath) { Remove-Item -LiteralPath $WebpPath -Force }
  Rename-Item -LiteralPath $tmp -NewName (Split-Path $WebpPath -Leaf)
}

function New-VariantsForImage {
  param([string]$SourcePath, [int[]]$UseWidths = $Widths)
  if (-not (Test-Path $SourcePath)) {
    Write-Warning "Missing: $SourcePath"
    return
  }

  $dir = Split-Path $SourcePath
  $base = [IO.Path]::GetFileNameWithoutExtension($SourcePath)
  # Skip already-generated derivatives as sources.
  if ($base -match '-(?:thumb|md|display|w\d+)$') { return }

  $size = Get-SourceSize $SourcePath
  $made = @()
  # Name files by requested width so srcset URLs stay stable.
  # Never upscale: pixel width is min(requested, native).
  foreach ($w in ($UseWidths | Sort-Object -Unique)) {
    $pixelWidth = [math]::Min($w, $size.Width)
    $jpg = Join-Path $dir "$base-w$w.jpg"
    $webp = Join-Path $dir "$base-w$w.webp"
    $sourceTime = (Get-Item $SourcePath).LastWriteTimeUtc
    $needsWrite = -not (Test-Path $jpg) -or -not (Test-Path $webp) -or
      (Get-Item $jpg).LastWriteTimeUtc -lt $sourceTime -or
      (Get-Item $webp).LastWriteTimeUtc -lt $sourceTime
    if ($needsWrite) {
      $dims = Write-JpegWidth -Source $SourcePath -Dest $jpg -TargetWidth $pixelWidth -Quality $JpegQuality
      Write-WebpFromJpeg -JpegPath $jpg -WebpPath $webp
    } else {
      $probe = [Drawing.Image]::FromFile($jpg)
      try { $dims = @{ Width = $probe.Width; Height = $probe.Height } }
      finally { $probe.Dispose() }
    }
    $made += [PSCustomObject]@{
      File = "$base-w$w"
      Width = $dims.Width
      JpgKB = [math]::Round((Get-Item $jpg).Length / 1KB)
      WebpKB = [math]::Round((Get-Item $webp).Length / 1KB)
    }
  }

  # Extra native-width max variant when source is wider than largest requested.
  $maxRequested = ($UseWidths | Measure-Object -Maximum).Maximum
  if ($size.Width -gt $maxRequested) {
    $w = $size.Width
    $jpg = Join-Path $dir "$base-w$w.jpg"
    $webp = Join-Path $dir "$base-w$w.webp"
    if (-not (Test-Path $jpg) -or -not (Test-Path $webp)) {
      $dims = Write-JpegWidth -Source $SourcePath -Dest $jpg -TargetWidth $w -Quality $JpegQuality
      Write-WebpFromJpeg -JpegPath $jpg -WebpPath $webp
      $made += [PSCustomObject]@{
        File = "$base-w$w"
        Width = $dims.Width
        JpgKB = [math]::Round((Get-Item $jpg).Length / 1KB)
        WebpKB = [math]::Round((Get-Item $webp).Length / 1KB)
      }
    }
  }

  Write-Output "=== $(Split-Path $SourcePath -Leaf) ($($size.Width)x$($size.Height)) ==="
  $made | Format-Table -AutoSize | Out-String | Write-Output
}

$jobs = @(
  @{ Path = Join-Path $Root 'assets\images\domein.jpg'; Widths = @(800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'assets\images\domein2.jpg'; Widths = @(800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'assets\images\domein3.jpg'; Widths = @(800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'assets\images\domein4.jpg'; Widths = @(800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'assets\images\domein5.jpg'; Widths = @(800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'assets\images\hemd_voorkant.jpg'; Widths = @(480, 800, 1200) },
  @{ Path = Join-Path $Root 'uploads\over-ons.jpg'; Widths = @(800, 1200, 1600) },
  @{ Path = Join-Path $Root 'uploads\kapoenenleiding.jpg'; Widths = @(480, 800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'uploads\welpenleiding.jpg'; Widths = @(480, 800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'uploads\jongverkennersleiding.jpg'; Widths = @(480, 800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'uploads\verkennersleiding.jpg'; Widths = @(480, 800, 1200, 1600, 2400) },
  @{ Path = Join-Path $Root 'uploads\jinsleiding.jpg'; Widths = @(480, 800, 1200, 1600, 2400) }
)

Get-ChildItem (Join-Path $Root 'uploads\news-*.jpg'), (Join-Path $Root 'uploads\agenda-*.jpg') -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notmatch '-w\d+' } |
  ForEach-Object {
    $jobs += @{ Path = $_.FullName; Widths = @(480, 800, 1200, 1600) }
  }

foreach ($job in $jobs) {
  New-VariantsForImage -SourcePath $job.Path -UseWidths $job.Widths
}

Write-Output 'Done. Originals were not modified.'
