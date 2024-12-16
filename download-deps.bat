@echo off
echo Baixando yt-dlp...
mkdir bin 2>nul

powershell -Command "& {Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile 'bin/yt-dlp.exe'}"

if exist "bin\yt-dlp.exe" (
    echo yt-dlp baixado com sucesso!
) else (
    echo Erro ao baixar yt-dlp
    exit /b 1
)

echo.
echo Todas as dependências foram baixadas!
echo Agora você pode executar start-servers.bat
pause
