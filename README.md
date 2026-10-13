A fresh starter for PocketSmart AI with a responsive frontend, API Worker, D1 database, registration/login, per-user saved plans, three planners, Gemini integration, and a demo fallback.

## Important before public launch
This is a starter project, not yet deployed. You must create your own Cloudflare account, database, secrets, and deployment. Review the security notes below before using real customer data. This starter hashes passwords using SHA-256 with a server-side pepper for simplicity; for production, replace this with a password hashing scheme specifically designed for passwords (Argon2id/scrypt/PBKDF2 with appropriate parameters) and add rate limiting, email verification, and account recovery. Do not store sensitive personal information.

## Free global hosting architecture
- Frontend: Cloudflare Pages (static files, globally distributed).
- API: Cloudflare Workers.
- Database: Cloudflare D1.
- AI: Gemini API if a key is configured; demo plans work without it.

Cloudflare's static asset hosting has a $0 Free plan, with published limits. See https://developers.cloudflare.com/pages/platform/limits/ and https://developers.cloudflare.com/workers/platform/pricing/.

## 1. Create the database
1. Install Node.js LTS from https://nodejs.org/.
2. Open a terminal in the `worker` folder.
3. Run: `npm install -g wrangler`
4. Run: `wrangler login`
5. Create a database: `wrangler d1 create pocketsmart-ai-db`
6. Copy the returned database ID into `worker/wrangler.toml` replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
7. Apply the schema: `wrangler d1 execute pocketsmart-ai-db --remote --file=./schema.sql`

## 2. Set secure API secrets and deploy
From the `worker` folder, run each command and enter a long, unique value when prompted:
- `wrangler secret put JWT_SECRET`
- `wrangler secret put PASSWORD_PEPPER`
- Optional AI: `wrangler secret put GEMINI_API_KEY`

Use a strong random secret for JWT_SECRET and PASSWORD_PEPPER; do not reuse your account password. Then deploy:
- `wrangler deploy`

Copy the deployed Worker URL, such as `https://pocketsmart-ai-api.<your-subdomain>.workers.dev`.

## 3. Connect the frontend
Open `frontend/app.js` and change the first line to:
`const API_BASE = "https://YOUR-WORKER-URL";`
Use the exact Worker URL from your deployment. Save the file.

## 4. Deploy the frontend to Cloudflare Pages
1. Push this project to a GitHub repository.
2. In Cloudflare Dashboard, open Workers & Pages → Create → Pages → Connect to Git.
3. Select your repository.
4. Set the root directory to `frontend`.
5. Since this is plain HTML/CSS/JS, use no build command and set output directory to `.` (the frontend folder).
6. Deploy. Your public `*.pages.dev` link will be shown in the dashboard.

## 5. Test the app
- Open the Pages URL.
- Register with a test email and password (at least 8 characters).
- Log in, open one of the planners, enter a goal and budget, then generate a plan.
- Without GEMINI_API_KEY, the demo fallback should still generate a plan.
- With the key configured, the Worker attempts Gemini and falls back to the demo plan if the AI request fails.

## Current starter limitations
- The visible UI includes the planner forms and generated plan result. The `/api/history` endpoint is implemented, but the history page UI is not yet added.
- Product/vendor links and live pricing are intentionally not fabricated; the app returns planning suggestions, not live shopping results.
- CORS is open for ease of first deployment. Before production, restrict `Access-Control-Allow-Origin` to your exact Pages domain.
- Add rate limiting and stronger password hashing before public production use.
- Keep all API keys in Worker secrets. Never put Gemini keys in frontend code or GitHub.
