@echo off
echo Starting PopcornView Backends...
start "User Server" cmd /k "cd user && node server.js"
timeout /t 2
start "Movie Server" cmd /k "cd movie && node serverReview.js"
echo All servers started!