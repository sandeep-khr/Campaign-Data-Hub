.PHONY: setup ingest build run dev-api dev-web check docker-up docker-down

setup:
	cd backend && uv sync
	cd frontend && npm ci

ingest:
	cd backend && .venv/bin/python -m app.cli

build:
	cd frontend && npm run build

run: build
	cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

dev-api:
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-web:
	cd frontend && npm run dev

check:
	cd backend && .venv/bin/ruff check .
	cd backend && .venv/bin/pytest -q
	cd frontend && npm run format:check
	cd frontend && npm run lint
	cd frontend && npm run build

docker-up:
	docker compose up --build

docker-down:
	docker compose down
