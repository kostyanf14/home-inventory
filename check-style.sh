#!/usr/bin/env bash
set -e

python3 -m ruff format --check apps/api/app apps/api/tests
python3 -m ruff check apps/api/app apps/api/tests
(
  cd apps/api
  python3 -m pylint app tests
)
npm --prefix apps/web run format:check
npm --prefix apps/web run lint
