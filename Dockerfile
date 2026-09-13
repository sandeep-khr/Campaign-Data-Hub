FROM node:20-bookworm-slim AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/backend/.venv/bin:$PATH" \
    HUB_DATABASE="/app/var/campaign_hub.sqlite"

RUN pip install --no-cache-dir uv==0.9.21

WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN cd backend && uv sync --frozen --no-dev

COPY backend/app/ ./backend/app/
COPY config/ ./config/
COPY data/ ./data/
COPY --from=frontend-build /build/frontend/dist/ ./frontend/dist/
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN useradd --system --uid 10001 --create-home appuser \
    && mkdir -p /app/var \
    && chown -R appuser:appuser /app/var \
    && chmod +x /app/docker/entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT', '8000') + '/api/health')"]

ENTRYPOINT ["/app/docker/entrypoint.sh"]
