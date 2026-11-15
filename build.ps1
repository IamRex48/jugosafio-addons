$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force -Path 'release' | Out-Null
    Add-Type -AssemblyName System.Drawing
    New-Item -ItemType Directory -Force -Path 'branding\textures\ui\client' | Out-Null
    $bitmap = New-Object System.Drawing.Bitmap(1024, 256)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $font = New-Object System.Drawing.Font('Segoe UI', 104, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rectangle = New-Object System.Drawing.RectangleF(0, 0, 1024, 256)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(171, 239, 87))
    $graphics.DrawString('JUGOSAFIO', $font, $brush, $rectangle, $format)
    $bitmap.Save((Join-Path $PSScriptRoot 'branding\textures\ui\client\logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose(); $format.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
    & $compiler /nologo /target:winexe /optimize+ /out:release\Jugosafio.exe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll Launcher.cs SelfTest.cs
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    Copy-Item config.json release\config.json -Force
    Copy-Item README.md release\README.md -Force
} finally { Pop-Location }
