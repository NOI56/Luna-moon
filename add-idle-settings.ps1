$envFile = ".env"

if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    
    # ตรวจสอบและเพิ่ม IDLE_MONOLOGUE_ENABLED
    if ($content -notmatch "IDLE_MONOLOGUE_ENABLED") {
        Add-Content $envFile ""
        Add-Content $envFile "# Idle Monologue: Luna พูดเองตอนเงียบ (ทุก 60 วินาที)"
        Add-Content $envFile "IDLE_MONOLOGUE_ENABLED=true"
        Write-Host '[OK] เพิ่ม IDLE_MONOLOGUE_ENABLED=true แล้ว' -ForegroundColor Green
    } else {
        # ถ้ามีอยู่แล้ว ให้แก้ไขเป็น true
        $lines = Get-Content $envFile
        $newLines = @()
        foreach ($line in $lines) {
            if ($line -match "^IDLE_MONOLOGUE_ENABLED\s*=") {
                $newLines += "IDLE_MONOLOGUE_ENABLED=true"
            } else {
                $newLines += $line
            }
        }
        Set-Content $envFile $newLines
        Write-Host '[OK] อัปเดต IDLE_MONOLOGUE_ENABLED=true แล้ว' -ForegroundColor Green
    }
    
    # ตรวจสอบและเพิ่ม AMBIENT_MURMUR_ENABLED
    $content = Get-Content $envFile -Raw
    if ($content -notmatch "AMBIENT_MURMUR_ENABLED") {
        Add-Content $envFile ""
        Add-Content $envFile "# Ambient Murmur: Luna พึมพำเองเป็นระยะ (ทุก 3-5 นาที)"
        Add-Content $envFile "AMBIENT_MURMUR_ENABLED=true"
        Write-Host '[OK] เพิ่ม AMBIENT_MURMUR_ENABLED=true แล้ว' -ForegroundColor Green
    } else {
        # ถ้ามีอยู่แล้ว ให้แก้ไขเป็น true
        $lines = Get-Content $envFile
        $newLines = @()
        foreach ($line in $lines) {
            if ($line -match "^AMBIENT_MURMUR_ENABLED\s*=") {
                $newLines += "AMBIENT_MURMUR_ENABLED=true"
            } else {
                $newLines += $line
            }
        }
        Set-Content $envFile $newLines
        Write-Host '[OK] อัปเดต AMBIENT_MURMUR_ENABLED=true แล้ว' -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "คำเตือน: การเปิดการพูดเองจะใช้ API calls มาก!" -ForegroundColor Yellow
    Write-Host "แนะนำให้เปิด TTS_ENABLED=true ด้วย (ถ้ายังไม่ได้เปิด)" -ForegroundColor Cyan
} else {
    Write-Host '[ERROR] ไม่พบไฟล์ .env' -ForegroundColor Red
}
