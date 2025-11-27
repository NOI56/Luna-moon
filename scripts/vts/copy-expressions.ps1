$source = "d:\SteamLibrary\steamapps\common\VTube Studio\VTube Studio_Data\StreamingAssets\Live2DModels\shuangsheng-full\shuangsheng"
$dest = "d:\SteamLibrary\steamapps\common\VTube Studio\VTube Studio_Data\StreamingAssets\Live2DModels\akari_vts\expressions"

$files = Get-ChildItem "$source\*.exp3.json"

Write-Host "กำลังคัดลอก expressions จาก shuangsheng ไปยัง akari_vts..." -ForegroundColor Cyan
Write-Host ""

foreach ($file in $files) {
    Copy-Item $file.FullName -Destination "$dest\$($file.Name)" -Force
    Write-Host "คัดลอก: $($file.Name)" -ForegroundColor Green
}

Write-Host ""
Write-Host "เสร็จแล้ว! คัดลอก $($files.Count) ไฟล์" -ForegroundColor Cyan





