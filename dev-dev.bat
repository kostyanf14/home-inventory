@echo off
setlocal
cd /d "%~dp0"
echo Starting Home Inventory Development Environment...

if not exist "apps\api\.env" (
    echo Creating apps\api\.env from template...
    echo ENVIRONMENT=development > apps\api\.env
    echo DATABASE_URL=sqlite+aiosqlite:///./home_inventory.db >> apps\api\.env
    rem SECRET_KEY stays empty in local dev; production sets its own (apps/api/.env.example).
)

echo Installing dependencies...
python -m pip install -r apps\api\requirements-dev.txt
call npm --prefix apps\web install

echo Starting API at http://localhost:8000 ...
start "Home Inventory API" /D "%~dp0apps\api" cmd /k start-dev.bat

echo API Docs available at http://localhost:8000/docs
echo Starting web app at http://localhost:5173 ...
call npm --prefix apps\web run dev -- --host 127.0.0.1
