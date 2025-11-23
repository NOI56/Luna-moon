# download-libs.ps1
# Script to download pixi-live2d-display library

Write-Host "Downloading pixi-live2d-display library..." -ForegroundColor Cyan

$libsDir = "public\libs"
if (-not (Test-Path $libsDir)) {
    New-Item -ItemType Directory -Path $libsDir -Force | Out-Null
}

$urls = @(
    @{
        Name = "pixi-live2d-display"
        Url = "https://unpkg.com/pixi-live2d-display@0.5.0/dist/index.min.js"
        File = "pixi-live2d-display.min.js"
    }
)

foreach ($lib in $urls) {
    $filePath = Join-Path $libsDir $lib.File
    Write-Host "Downloading $($lib.Name)..." -ForegroundColor Yellow
    
    try {
        Invoke-WebRequest -Uri $lib.Url -OutFile $filePath -UseBasicParsing
        Write-Host "  Success: $filePath" -ForegroundColor Green
    } catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Trying alternative CDN..." -ForegroundColor Yellow
        
        # Try jsdelivr
        try {
            $altUrl = "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.5.0/dist/index.min.js"
            Invoke-WebRequest -Uri $altUrl -OutFile $filePath -UseBasicParsing
            Write-Host "  Success (alternative): $filePath" -ForegroundColor Green
        } catch {
            Write-Host "  All CDNs failed. Please download manually." -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green






