@echo off
setlocal
cd /d "%~dp0"

python -m ruff format --check apps\api\app apps\api\tests apps\api\alembic
python -m ruff check apps\api\app apps\api\tests apps\api\alembic
pushd apps\api
python -m pylint app tests
popd

call npm --prefix apps\web run format:check
call npm --prefix apps\web run lint
