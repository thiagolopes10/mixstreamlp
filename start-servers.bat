@echo off
echo Starting MixStream Servers...

:: Start the video server (server.js) on port 3000
start "Video Server" cmd /k "node server.js"

:: Start the audio server (test-server.js) on port 3002
start "Audio Server" cmd /k "node test-server.js"

:: Wait a moment for servers to start
timeout /t 3 /nobreak

:: Open the launcher page
start "" "launcher.html"

echo Servers started! Opening launcher...
