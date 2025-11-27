# find-akari-model.ps1
# Script to find Akari model

Write-Host "Searching for Akari model..." -ForegroundColor Cyan
Write-Host ""

$found = $false

# Search paths
$searchPaths = @(
    "$env:APPDATA\VTubeStudio\Live2DModels",
    "$env:LOCALAPPDATA\VTubeStudio\Live2DModels",
    "$env:USERPROFILE\Documents\VTubeStudio\Live2DModels",
    "$env:USERPROFILE\Documents\Live2DModels",
    "C:\Users\$env:USERNAME\AppData\Roaming\VTubeStudio\Live2DModels",
    "C:\Users\$env:USERNAME\AppData\Local\VTubeStudio\Live2DModels",
    "D:\SteamLibrary\steamapps\common\VTube Studio\VTube Studio_Data\StreamingAssets",
    "D:\SteamLibrary\steamapps\common\VTube Studio\VTube Studio_Data\Resources"
)

Write-Host "Checking these paths:" -ForegroundColor Yellow
foreach ($path in $searchPaths) {
    Write-Host "   - $path" -ForegroundColor Gray
}
Write-Host ""

# Search each path
foreach ($basePath in $searchPaths) {
    if (Test-Path $basePath) {
        Write-Host "Found folder: $basePath" -ForegroundColor Green
        
        # Find folders with "Akari" in name
        $directories = Get-ChildItem -Path $basePath -Directory -ErrorAction SilentlyContinue
        
        foreach ($dir in $directories) {
            $dirName = $dir.Name
            if ($dirName -like "*Akari*" -or $dirName -like "*akari*") {
                Write-Host ""
                Write-Host "Found model: $dirName" -ForegroundColor Green
                Write-Host "   Path: $($dir.FullName)" -ForegroundColor Cyan
                
                # Check for .model3.json file
                $modelFiles = Get-ChildItem -Path $dir.FullName -Filter "*.model3.json" -ErrorAction SilentlyContinue
                if ($modelFiles) {
                    Write-Host "   Has model file: $($modelFiles[0].Name)" -ForegroundColor Green
                    $found = $true
                    
                    Write-Host ""
                    Write-Host "Next steps:" -ForegroundColor Yellow
                    Write-Host "   1. Copy this folder:" -ForegroundColor White
                    Write-Host "      $($dir.FullName)" -ForegroundColor Cyan
                    Write-Host "   2. Paste to:" -ForegroundColor White
                    Write-Host "      D:\LunaAI_v10_Project\public\models\$dirName" -ForegroundColor Cyan
                    Write-Host ""
                    Write-Host "Or use this command:" -ForegroundColor Yellow
                    Write-Host "   Copy-Item '$($dir.FullName)' -Destination 'D:\LunaAI_v10_Project\public\models\$dirName' -Recurse" -ForegroundColor Cyan
                } else {
                    Write-Host "   Warning: No .model3.json file found" -ForegroundColor Yellow
                }
            }
        }
        
        # If Akari not found, show all models
        if (-not $found) {
            Write-Host ""
            Write-Host "All models in this folder:" -ForegroundColor Yellow
            $allModels = Get-ChildItem -Path $basePath -Directory -ErrorAction SilentlyContinue
            foreach ($model in $allModels) {
                $hasModelFile = (Get-ChildItem -Path $model.FullName -Filter "*.model3.json" -ErrorAction SilentlyContinue)
                if ($hasModelFile) {
                    Write-Host "   - $($model.Name)" -ForegroundColor White
                }
            }
        }
    }
}

Write-Host ""

if (-not $found) {
    Write-Host "Akari model not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Tips:" -ForegroundColor Yellow
    Write-Host "   1. Open VTube Studio" -ForegroundColor White
    Write-Host "   2. Go to Settings -> Models" -ForegroundColor White
    Write-Host "   3. Right-click on Akari model" -ForegroundColor White
    Write-Host "   4. Select 'Open Model Folder' or 'Show in Explorer'" -ForegroundColor White
    Write-Host "   5. It will open the model folder automatically" -ForegroundColor White
} else {
    Write-Host "Model found! See info above" -ForegroundColor Green
}

Write-Host ""
Write-Host "Press Enter to close..."
$null = Read-Host
