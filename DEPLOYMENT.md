Render + Vercel deployment
=========================

This document describes step-by-step how to deploy the backend (Render) and frontend (Vercel) for this repository.

Backend (Render)
-----------------

1. Sign in to Render and connect your GitHub account.
2. Create a new Web Service and select this repository. Set the "Root Directory" to the repo root (backend is the root in this monorepo).
3. Build Command: npm ci && npm run build --prefix frontend
4. Start Command: npm start
5. Add Environment Variables in the Render service settings:
   - DATABASE_URL (Render will provide a connection string after you create a DB)
   - FRONTEND_URL (example: https://your-frontend.vercel.app)
   - OPENAI_KEY (your OpenAI API key)

6. Create a Postgres instance in Render: New -> Postgres Database. Copy the DATABASE_URL and paste into the service env.
7. Deploy the service. The build command above will build the frontend into `frontend/build` during deploy. After the service is running, open the Render console and run migrations:
   - In Render Shell: npm run migrate

8. Verify the /health endpoint: https://your-backend.onrender.com/health

Frontend (Vercel)
------------------

1. Sign in to Vercel and connect your GitHub account.
2. Import Project -> select this repository. Set the Project Root to `frontend`.
3. Framework Preset: Create React App. Build Command: `npm ci && npm run build`. Output Directory: `build`.
4. Add Environment Variables in Vercel (Project Settings -> Environment Variables):
   - REACT_APP_API_URL = https://your-backend.onrender.com

5. Deploy. After deployment, copy the Vercel URL and add it to Render's FRONTEND_URL env and redeploy backend (or restart).

Option B — Serve frontend from the same Render service (single deploy)
--------------------------------------------------------------------

If you prefer to serve the built frontend from the same Render backend (so the Render URL serves the SPA), use the Build Command above and ensure the server serves static files from `frontend/build` (this repo's `index.js` already serves that path). After deploy the Render URL will serve the frontend.

Notes:
- This approach builds frontend on each backend deploy and serves it from the same service.
- Vercel provides better CDN and static hosting; use Option B only if you want a single service.

Automating migrations via GitHub Actions
---------------------------------------

You can automatically run migrations after pushes to `main` by adding a GitHub Actions workflow. This repo includes `.github/workflows/run-migrations.yml` which runs `npm run migrate` on push to `main` or via manual dispatch.

Before using this workflow, add a repository secret named `RENDER_DATABASE_URL` with your Render Postgres connection string (the action injects it into `DATABASE_URL`).

To enable:
1. Go to your GitHub repo -> Settings -> Secrets -> Actions -> New repository secret
2. Name: `RENDER_DATABASE_URL`
3. Value: the DATABASE_URL from Render Postgres
4. Save. The workflow will pick it up on the next push to `main`.

Local development notes
-----------------------

- Copy `.env.example` to `.env` and adjust values for local development.
- To run backend locally:
  - npm ci
  - npm run migrate
  - npm run dev
- To run frontend locally:
  - cd frontend
  - npm ci
  - npm start
