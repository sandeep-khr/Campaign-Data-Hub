# Submission and deployment checklist

## Final local verification

1. Make sure the working tree contains only intended changes: `git status`.
2. Run `make check`.
3. Run `docker compose up --build` and open <http://127.0.0.1:8000>.
4. Confirm <http://127.0.0.1:8000/api/health> returns `{"status":"ok"}`.
5. Click **Run ingestion** twice. The fingerprint, totals, and health counts must remain unchanged.
6. Exercise platform/date/campaign filters, spend and CTR sorting, source trace, health search, notifications, and one failed-delivery drill-down.
7. Stop the local container with `docker compose down`. The named database volume is retained. Use `docker compose down --volumes` only when a clean local database is deliberately required.

## Repository submission

1. Add the editable Excalidraw architecture file under `docs/` and export an SVG or PNG beside it.
2. Link the rendered diagram from the README. Keep the existing Mermaid diagram as a readable fallback or replace it if the Excalidraw export communicates the same implemented architecture.
3. Review the final diff and commit every intended file. Do not include `.venv`, `node_modules`, `dist`, caches, logs, or the SQLite database.
4. Create an empty repository on the selected Git host. Do not initialize it with another README or `.gitignore`.
5. Add it as `origin` and push `main`:

   ```bash
   git remote add origin <repository-url>
   git push -u origin main
   ```

6. Open the repository from a logged-out/private browser window. Confirm the README renders, the architecture diagram is visible, and every required source/input file is present.
7. Submit the repository URL and deployed application URL. Also provide `/docs` as an optional API review link.

## Local Docker run

The repository packages the compiled frontend and FastAPI API in one runtime container:

```bash
docker compose up --build
```

The startup script ingests the bundled source directory before Uvicorn starts. FastAPI serves the API and the compiled React application from the same origin on port 8000. The Compose file mounts `data/` and `config/` read-only so local changes are visible on the next ingestion, and stores SQLite in a named volume.

## Public deployment on Render

This assessment can run as one Docker web service because FastAPI already serves the compiled frontend.

1. Push the repository to GitHub or another Render-supported Git provider.
2. In Render, choose **New → Web Service** and connect the repository.
3. Select the Docker runtime. The root `Dockerfile` requires no custom build or start command.
4. Select the `main` branch and set the health-check path to `/api/health`.
5. Deploy. The entry point reads Render's `PORT` value, performs the initial ingestion, and binds Uvicorn to `0.0.0.0`.
6. When the service is live, check these URLs:
   - `/` — campaign application
   - `/api/health` — runtime/database health
   - `/docs` — generated FastAPI API documentation
7. Click **Run ingestion** twice and confirm identical totals. Open at least one campaign source trace and one failed delivery report from the public URL.

Render's default filesystem is ephemeral. That is acceptable for this demonstration because the immutable source files are packaged in the image and startup deterministically rebuilds SQLite. If the deployed application later accepts uploaded files or policy edits, attach a persistent disk at `/app/var` and store source objects in durable storage, or move the data model to managed PostgreSQL.

## Interview rehearsal

Be ready to explain and then modify one small part of each path:

- why adapters only translate source formats;
- why invalid individual metrics become unknown instead of zero;
- why unit detection does not authorize a correction;
- how exact-hash overrides preserve the policy boundary;
- how duplicate files and rows are handled differently;
- how the complete snapshot and one transaction provide idempotency;
- how CTR/CPC denominators are chosen;
- how a displayed total traces back to raw rows and transformation rules;
- why SQLite and synchronous ingestion fit this assessment, and when a queue, object storage, and PostgreSQL would become justified.
