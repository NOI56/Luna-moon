@echo off
chcp 65001 >nul
echo ========================================
echo   Luna AI - Copy Model from VTube Studio
echo ========================================
echo.

REM หา path ของ VTube Studio
set "VTS_PATH=%APPDATA%\VTubeStudio\Live2DModels"

echo 🔍 กำลังหาโมเดลใน VTube Studio...
echo.

if not exist "%VTS_PATH%" (
    echo ❌ ไม่พบโฟลเดอร์ VTube Studio!
    echo.
    echo 📝 โปรดตรวจสอบว่า VTube Studio ติดตั้งแล้ว
    echo    Path ที่ตรวจสอบ: %VTS_PATH%
    echo.
    pause
    exit /b 1
)

echo ✅ พบโฟลเดอร์ VTube Studio!
echo    Path: %VTS_PATH%
echo.

REM แสดงรายการโมเดลทั้งหมด
echo 📋 โมเดลที่มีใน VTube Studio:
echo.
set /a count=0
for /d %%d in ("%VTS_PATH%\*") do (
    set /a count+=1
    for %%f in ("%%d\*.model3.json") do (
        setlocal enabledelayedexpansion
        set "folder=%%~nd"
        echo    !count!. !folder!
        endlocal
        goto :next
    )
    :next
)

if %count%==0 (
    echo    ❌ ไม่พบโมเดล!
    pause
    exit /b 1
)

echo.
echo ========================================
echo.

REM ถ้ามี argument ให้คัดลอกโมเดลนั้น
if "%~1"=="" (
    echo 💡 วิธีใช้งาน:
    echo    copy-model.bat [ชื่อโมเดล]
    echo.
    echo 📝 ตัวอย่าง:
    echo    copy-model.bat Luna
    echo.
    echo 💡 หรือคัดลอกทั้งหมด:
    echo    copy-model.bat all
    echo.
    pause
    exit /b 0
)

set "MODEL_NAME=%~1"
set "DEST_PATH=%~dp0public\models"

REM สร้างโฟลเดอร์ปลายทาง
if not exist "%DEST_PATH%" (
    mkdir "%DEST_PATH%"
    echo ✅ สร้างโฟลเดอร์: %DEST_PATH%
)

if /i "%MODEL_NAME%"=="all" (
    echo 📦 กำลังคัดลอกโมเดลทั้งหมด...
    echo.
    for /d %%d in ("%VTS_PATH%\*") do (
        for %%f in ("%%d\*.model3.json") do (
            setlocal enabledelayedexpansion
            set "folder=%%~nd"
            set "source=%%d"
            set "dest=!DEST_PATH!\!folder!"
            
            echo 📦 คัดลอก: !folder!
            xcopy "!source!" "!dest!" /E /I /Y >nul
            if !errorlevel!==0 (
                echo    ✅ สำเร็จ!
            ) else (
                echo    ❌ ล้มเหลว!
            )
            endlocal
        )
    )
    echo.
    echo ✅ คัดลอกเสร็จแล้ว!
) else (
    REM คัดลอกโมเดลเดียว
    set "SOURCE_PATH=%VTS_PATH%\%MODEL_NAME%"
    
    if not exist "%SOURCE_PATH%" (
        echo ❌ ไม่พบโมเดล: %MODEL_NAME%
        echo.
        echo 💡 โปรดตรวจสอบชื่อโมเดลให้ถูกต้อง
        pause
        exit /b 1
    )
    
    set "DEST_MODEL=%DEST_PATH%\%MODEL_NAME%"
    
    echo 📦 กำลังคัดลอกโมเดล: %MODEL_NAME%
    echo    จาก: %SOURCE_PATH%
    echo    ไปที่: %DEST_MODEL%
    echo.
    
    xcopy "%SOURCE_PATH%" "%DEST_MODEL%" /E /I /Y
    
    if %errorlevel%==0 (
        echo.
        echo ✅ คัดลอกสำเร็จ!
        echo.
        echo 📝 ขั้นตอนต่อไป:
        echo    1. เปิด: http://localhost:8787/luna-character?model=%MODEL_NAME%
        echo    2. หรือใช้ใน OBS Browser Source
        echo.
    ) else (
        echo.
        echo ❌ คัดลอกล้มเหลว!
        echo.
    )
)

pause






