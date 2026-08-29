@echo off
setlocal
cd /d "%~dp0"
echo Starting Home Inventory Development Environment...

if not exist "apps\api\.env" (
    echo Creating apps\api\.env from template...
    echo DATABASE_URL=sqlite+aiosqlite:///./home_inventory.db > apps\api\.env
    echo SECRET_KEY=dev_secret_key_change_in_production_1234567890 >> apps\api\.env
)

echo Installing dependencies...
python -m pip install -r apps\api\requirements-dev.txt
call npm --prefix apps\web install

echo Starting API at http://localhost:8000 ...
start "Home Inventory API" /D "%~dp0apps\api" cmd /k start-dev.bat

echo API Docs available at http://localhost:8000/docs
echo Starting web app at http://localhost:5173 ...
call npm --prefix apps\web run dev -- --host 127.0.0.1
