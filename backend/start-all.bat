@echo off
echo Starting PopcornView Backends...
start "User Server" cmd /k "cd user && node server.js"
timeout /t 2
start "Movie Server" cmd /k "cd movie && node serverReview.js"
timeout /t 2
start "Main Backend" cmd /k "cd ..\backend && node server.js"
echo All servers started!