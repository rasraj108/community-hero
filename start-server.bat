@echo off
echo Starting CivicPulse server...
start http://localhost:3000
py -m http.server 3000 --directory D:\community-hero
pause
