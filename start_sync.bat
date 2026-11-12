@echo off
cd /d "%~dp0"
python sync_to_dashboard.py --watch
pause
