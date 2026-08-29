@echo off
setlocal
cd /d "%~dp0"

python -m ruff format --check apps\api\app apps\api\tests
python -m ruff check apps\api\app apps\api\tests
pushd apps\api
python -m pylint app tests
popd

call npm --prefix apps\web run format:check
call npm --prefix apps\web run lint
