@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -B web_pdf_exporter.py
) else (
  python -B web_pdf_exporter.py
)

endlocal
