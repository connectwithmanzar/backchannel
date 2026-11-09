# Backchannel: go-live checklist

Do these once, in order. Each takes a few minutes.

## 1. Update the database (Supabase)
1. Open supabase.com → your Backchannel project → **SQL Editor** → **New query**.
2. Open `supabase/migrations/0006_full_product.sql` from this folder, copy everything, paste it in, click **Run**.
3. You should see "Success. No rows returned". It's safe to run again if unsure.

## 2. Check your settings in Vercel
Vercel → your project → **Settings** → **Environment Variables**. Make sure these exist:

| Name | What it's for |
|---|---|
| `OPENROUTER_API_KEY` **or** `ANTHROPIC_API_KEY` | All AI features (CV reading, applications, emails, chat). One is enough. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Database (already set) |
| `NEXT_PUBLIC_OWNER_EMAIL` | Your email, unlocks Run now and Sources |
| `CRON_SECRET` | Any long random text. Needed for the daily automatic runs |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sending email from your Gmail |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Morning alerts (optional) |

## 3. Let Google send email for you (one time)
1. console.cloud.google.com → pick the project that owns your `GOOGLE_CLIENT_ID`.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen**: keep it in **Testing**, and under **Test users** add your personal Gmail.
4. **APIs & Services → Credentials** → click your OAuth client → under **Authorized redirect URIs** add:
   `https://backchannel-eight.vercel.app/api/gmail/callback`
   (and `http://localhost:3000/api/gmail/callback` if you run it on your Mac) → **Save**.

## 4. Publish the new version
In Terminal:
```
cd ~/Desktop/backchannel
git push
```
Vercel deploys automatically in about 2 minutes.

## 5. First run (in the app)
1. **My profile → Upload CV**, confirm. This is what applications and emails are built from.
2. **Roles → Run now** (about 2–4 minutes the first time). Then **Score now**.
3. **Sources**: see which company boards work. Broken ones are auto-repaired; click **Auto-fix** on any still broken. Add any company by name.
4. **Great companies → Curate**. AI also finds their job boards so their roles show up.
5. **Outreach → Connect Gmail.** Google will warn the app is unverified (it's yours, in testing): click **Continue**.
6. **Autopilot → Settings**: fill your saved answers (visa, salary, notice period). Turn on "Prepare automatically every morning" if you want.

From then on, every morning: new roles are collected (06:00 IST), scored, applications prepared, follow-up emails sent, and a Telegram alert goes out (07:15 IST).
