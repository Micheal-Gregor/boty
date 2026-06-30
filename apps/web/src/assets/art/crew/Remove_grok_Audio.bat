@echo off
echo ========================================
echo Grok Video Audio Remover
echo ========================================

:: === CHANGE THIS IF YOUR FFMPEG IS INSTALLED ELSEWHERE ===
set "FFMPEG_PATH=C:\Program Files\ffmpeg\bin\ffmpeg.exe"

:: Create output folder
mkdir "no_audio" 2>nul

echo Processing all videos in this folder...
echo Output will be in the "no_audio" subfolder.
echo.

for %%f in (*.mp4 *.mov *.mkv *.webm) do (
    echo Processing: %%f
    "%FFMPEG_PATH%" -n -i "%%f" -c:v copy -an -movflags +faststart "no_audio\%%~nf_noaudio%%~xf"
    if errorlevel 1 echo    ERROR processing %%f
)

echo.
echo ========================================
echo All done! Check the "no_audio" folder.
echo Original files were NOT modified.
pause