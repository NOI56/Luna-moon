# Script to update model configuration in .env file
# This script will:
# 1. Keep existing OPENROUTER_KEY or OPENAI_KEY
# 2. Update SIMPLE_MODEL, COMPLEX_MODEL, FALLBACK_MODEL with correct prefixes
# 3. Remove PRIMARY_MODEL (not used in code)

$envFile = ".env"
$backupFile = ".env.backup"

# Create backup
if (Test-Path $envFile) {
    Copy-Item $envFile $backupFile -Force
    Write-Host "✅ Created backup: $backupFile" -ForegroundColor Green
}

# Read current .env file
$content = Get-Content $envFile -Raw

# Check if using OpenRouter or OpenAI
$hasOpenRouter = $content -match "OPENROUTER_KEY\s*=\s*[^\s#]+" -and ($content -notmatch "OPENAI_KEY\s*=\s*[^\s#]+" -or $content -match "OPENAI_KEY\s*=\s*your_openai_api_key_here")
$usingOpenRouter = $hasOpenRouter

Write-Host "`n=== Updating Model Configuration ===" -ForegroundColor Cyan
Write-Host "Using OpenRouter: $usingOpenRouter" -ForegroundColor Yellow

# Remove PRIMARY_MODEL (not used)
if ($content -match "(?m)^PRIMARY_MODEL=.*$") {
    $content = $content -replace "(?m)^PRIMARY_MODEL=.*$", ""
    Write-Host "  ✓ Removed PRIMARY_MODEL (not used in code)" -ForegroundColor Green
}

# Update model configurations
if ($usingOpenRouter) {
    Write-Host "`nUpdating for OpenRouter..." -ForegroundColor Yellow
    
    # Update SIMPLE_MODEL - add prefix if not present
    if ($content -match "SIMPLE_MODEL\s*=\s*([^`r`n#]+)") {
        $currentModel = $matches[1].Trim()
        if ($currentModel -notmatch "^openai/|^anthropic/|^google/|^meta-llama/") {
            $newModel = "openai/$currentModel"
            $content = $content -replace "(?m)^SIMPLE_MODEL\s*=\s*.*$", "SIMPLE_MODEL=$newModel"
            Write-Host "  ✓ SIMPLE_MODEL: $currentModel → $newModel" -ForegroundColor Green
        } else {
            Write-Host "  ✓ SIMPLE_MODEL: $currentModel (already has prefix)" -ForegroundColor Green
        }
    } else {
        if ($content -notmatch "(?m)^SIMPLE_MODEL=") {
            $content = $content + "`nSIMPLE_MODEL=openai/gpt-4o-mini"
        }
        Write-Host "  ✓ SIMPLE_MODEL: Set to openai/gpt-4o-mini" -ForegroundColor Green
    }
    
    # Update COMPLEX_MODEL - ensure it has prefix
    if ($content -match "COMPLEX_MODEL\s*=\s*([^`r`n#]+)") {
        $currentModel = $matches[1].Trim()
        if ($currentModel -notmatch "^openai/|^anthropic/|^google/|^meta-llama/") {
            # If it's claude-3-opus or similar, add anthropic/ prefix
            if ($currentModel -match "claude") {
                $newModel = "anthropic/$currentModel"
            } else {
                $newModel = "openai/$currentModel"
            }
            $content = $content -replace "(?m)^COMPLEX_MODEL\s*=\s*.*$", "COMPLEX_MODEL=$newModel"
            Write-Host "  ✓ COMPLEX_MODEL: $currentModel → $newModel" -ForegroundColor Green
        } else {
            Write-Host "  ✓ COMPLEX_MODEL: $currentModel (already has prefix)" -ForegroundColor Green
        }
    } else {
        if ($content -notmatch "(?m)^COMPLEX_MODEL=") {
            $content = $content + "`nCOMPLEX_MODEL=anthropic/claude-3-opus"
        }
        Write-Host "  ✓ COMPLEX_MODEL: Set to anthropic/claude-3-opus" -ForegroundColor Green
    }
    
    # Update FALLBACK_MODEL - add prefix if not present
    if ($content -match "FALLBACK_MODEL\s*=\s*([^`r`n#]+)") {
        $currentModel = $matches[1].Trim()
        if ($currentModel -notmatch "^openai/|^anthropic/|^google/|^meta-llama/") {
            $newModel = "openai/$currentModel"
            $content = $content -replace "(?m)^FALLBACK_MODEL\s*=\s*.*$", "FALLBACK_MODEL=$newModel"
            Write-Host "  ✓ FALLBACK_MODEL: $currentModel → $newModel" -ForegroundColor Green
        } else {
            Write-Host "  ✓ FALLBACK_MODEL: $currentModel (already has prefix)" -ForegroundColor Green
        }
    } else {
        if ($content -notmatch "(?m)^FALLBACK_MODEL=") {
            $content = $content + "`nFALLBACK_MODEL=openai/gpt-4o-mini"
        }
        Write-Host "  ✓ FALLBACK_MODEL: Set to openai/gpt-4o-mini" -ForegroundColor Green
    }
} else {
    Write-Host "`nUsing OpenAI API - models don't need prefix" -ForegroundColor Yellow
    
    # For OpenAI, remove prefixes if present
    $content = $content -replace "(?m)^SIMPLE_MODEL\s*=\s*openai/(.+)$", "SIMPLE_MODEL=`$1"
    $content = $content -replace "(?m)^COMPLEX_MODEL\s*=\s*anthropic/(.+)$", "COMPLEX_MODEL=`$1"
    $content = $content -replace "(?m)^FALLBACK_MODEL\s*=\s*openai/(.+)$", "FALLBACK_MODEL=`$1"
    
    Write-Host "  ✓ Models updated for OpenAI API" -ForegroundColor Green
}

# Write updated content
Set-Content -Path $envFile -Value $content -NoNewline

Write-Host "`n✅ .env file updated successfully!" -ForegroundColor Green
Write-Host "📝 Backup saved to: $backupFile" -ForegroundColor Cyan
Write-Host "`nPlease verify the changes and restart the server." -ForegroundColor Yellow
