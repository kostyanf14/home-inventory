@echo off
setlocal
cd /d "%~dp0"
set PYTHONPATH=.
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
