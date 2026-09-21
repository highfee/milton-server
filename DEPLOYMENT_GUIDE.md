# Milton Server – Free Long-Term Hosting Migration Guide

This guide details how to host `milton-server` on top free-tier alternatives with fast wakeups and zero or near-instant cold starts.

---

## 1. Option A: Koyeb (Recommended – Easiest & Most Reliable Free Tier)
**Why Koyeb?**
- Dedicated **Free "Eco" Dyno** (512MB RAM, 0.1 vCPU).
- **Near-instant wakeups** (much faster than Render).
- Direct GitHub auto-deployment whenever you push to `main`.
- Built-in HTTPS with custom domain support.

### Setup Steps:
1. Go to [koyeb.com](https://www.koyeb.com/) and create a free account (sign in with GitHub).
2. Click **"Create Service"** -> Choose **GitHub**.
3. Select the repository: `highfee/milton-server`, branch: `main`.
4. Choose **Dockerfile** as the build method (or buildpack if preferred).
5. Add Environment Variables (from your `.env`):
   - `DATABASE_URL` = *(Your Supabase connection string)*
   - `DIRECT_URL` = *(Your Supabase direct connection string)*
   - `JWT_SECRET` = `milton_college_super_secret_jwt_key_2026`
   - `JWT_EXPIRES_IN` = `7d`
   - `CLIENT_ORIGIN` = `https://www.milton-college.com.ng`
   - `PORT` = `8000` (Koyeb default port is usually 8000)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`
6. Click **Deploy**. Your service will be live at `https://<your-app-name>.koyeb.app`.

---

## 2. Option B: Fly.io (Fastest Wakeup – 1 to 2 Seconds)
**Why Fly.io?**
- Free microVMs with edge routing.
- MicroVM cold starts take only 1–2 seconds.
- `fly.toml` is already pre-configured in this repository.

### Setup Steps:
1. Install Fly CLI (PowerShell):
   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   ```
2. Authenticate:
   ```bash
   fly auth login
   ```
3. Set secrets:
   ```bash
   fly secrets set DATABASE_URL="..." JWT_SECRET="..." CLIENT_ORIGIN="https://www.milton-college.com.ng"
   ```
4. Deploy:
   ```bash
   fly deploy
   ```

---

## 3. Option C: Hugging Face Spaces (Generous 16GB RAM Free Tier)
You already have a Hugging Face Space configured (`Hercules14/milton-college`).
- Uses the included `Dockerfile` running on port `7860`.
- To push updates directly to HF:
  ```bash
  git push hf main
  ```
- Add your environment variables in the HF Space Settings -> **Repository secrets**.

---

## 4. Updating the Frontend to Point to the New URL
Once your new backend URL is live (e.g. `https://milton-server.koyeb.app/api` or `https://milton-server.fly.dev/api`):

1. Open `miltoncollegeportal--1-/.env.production` (or `src/api/apiClient.js`).
2. Set:
   ```env
   VITE_API_URL=https://<your-new-backend-domain>/api
   ```
3. Commit and push the frontend repository.
