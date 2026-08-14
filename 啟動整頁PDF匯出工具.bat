@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 web_pdf_exporter.py
) else (
  python web_pdf_exporter.py
)

endlocal
