# confess — anonymous message links (NGL-style)

A small NGL-style app: create a username, share your link, and receive anonymous messages.
You can customize your profile (display name, avatar, bio) that shows on your link page.
Backend is Python (Flask + Supabase), frontend is plain HTML/CSS/JS.

## Project structure

```
app.py            # Flask app (routes, rate limiting, Supabase client)
schema.sql        # run this in the Supabase SQL editor (idempotent)
requirements.txt
public/           # static frontend (index, send, inbox, profile, style, app)
```

## Setup

### 1. Supabase

1. Create a project at https://supabase.com.
2. Open **SQL Editor** and paste the contents of `schema.sql`, then run it (safe to re-run).
3. In **Project Settings > API**, copy:
   - `Project URL`
   - `service_role` key (keep it secret — server side only)

### 2. Local development

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

Create a `.env` file:

```
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_KEY=your_service_role_key
```

Run:

```bash
python app.py
```

Open http://localhost:5000, create a username, share the link, and check your inbox.

## Deploy to Render

1. Push this repo to GitHub.
2. On Render, create a **Web Service** from the repo.
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
6. Deploy. Open your `https://<service>.onrender.com` URL.

## Notes

- The service uses the `service_role` key server-side; it is never exposed to the browser.
- Rate limiting is stored in memory, so it resets on restart — fine for a demo.
- Usernames are 3–20 characters (letters, numbers, underscore).
- Profile fields: display name (max 30), avatar URL (http/https, max 500), bio (max 160).