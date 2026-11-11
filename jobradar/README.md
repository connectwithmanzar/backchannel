# JobRadar

Your personal job search for India and the Gulf. It searches LinkedIn, Indeed, Naukri, Glassdoor and Bayt in one go, removes duplicates, and marks the jobs you haven't seen before. It runs on your own Mac and is powered by the open-source [JobSpy](https://github.com/speedyapply/JobSpy) (MIT license).

## Easiest: install it once (recommended)

In Terminal, run:
`cd ~/Desktop/backchannel/jobradar && bash "Install JobRadar.command"`

This sets up three things:
- A **JobRadar icon in your Dock**. Click it any time to open the app, with no Terminal needed.
- JobRadar **runs quietly in the background** and starts when your Mac starts.
- A **daily 8:00 run**. In the app, go to the **Daily auto-run** tab and click "Save sidebar search as my daily search". Every morning the new jobs go to Backchannel by themselves.

The code lives in the Backchannel project (`backchannel/jobradar`); the installer copies it to `~/JobRadar`, where it runs and keeps your data (`~/JobRadar/data`, never in Git). Run the installer again after any change. To remove it all, run `bash ~/JobRadar/"Uninstall JobRadar.command"`.

## Start it by hand (Mac)

1. Put the `jobradar` folder somewhere permanent, e.g. Documents.
2. Right-click **Start JobRadar.command** and choose **Open**. Click **Open** again if macOS warns you. You only need to right-click the first time.
   - If nothing happens, open Terminal, paste the line below and press Enter:
     `cd ~/Documents/jobradar && chmod +x "Start JobRadar.command" && ./"Start JobRadar.command"`
3. The first run installs everything, which takes 2–3 minutes. After that it opens straight away at http://localhost:8501.
4. Keep the Terminal window open while you use it. Close it to stop JobRadar.

## Use it

- Enter job titles (one per line), pick markets and, if you want, a city for each market, then press **Search jobs**.
- **NEW** marks jobs you have never been shown before. Every job you've been shown is saved in `data/jobs_history.csv`.
- Download the results as Excel or CSV.
- The **Run log** tab shows what each site returned. If a site shows 0 with an error, it is limiting requests for a while. Lower "Results per site" and try again later.

## Send jobs to Backchannel

1. In the sidebar, open **Backchannel connection**, paste the `JOBRADAR_SECRET` you set in Vercel and click **Save connection**.
2. After a search, tick the jobs you want (or **Tick all shown jobs**) and click **Send to Backchannel**.
3. The jobs appear in Backchannel under Roles → Added by you, already scored. If you keep "Also add their companies to Backchannel Sources" ticked, Backchannel also starts checking each company's official careers page every day, when it can find one.

## Extra sites through Apify (Instahyre, NaukriGulf, Foundit, GulfTalent)

1. Make a free account at apify.com. The free plan includes $5 of credit a month.
2. Go to console.apify.com → Settings → API & Integrations and copy your **Personal API token**.
3. In JobRadar's sidebar, open **Apify**, paste the token, set **Max spend per search** (default $0.50), and click Save.
4. The four sites now appear under Sites, marked "(Apify)". These sites cost about $1–2.50 per 1,000 jobs.

## The tabs

| Tab | What it does |
|---|---|
| Results | Your search, with red flags, employee rating and how many people you know at each company |
| Great companies | Jobs at your Backchannel great companies, a health badge per company, and a name search (also weekly by itself) |
| Signals | Hidden-job signals: hiring surge, new market entry, new sales leader, AEs but no SDRs |
| Referrals | Import your LinkedIn connections, then see who you know per job, LinkedIn search links, and one-click referral asks into Backchannel |
| Market view | Companies to target, India vs Gulf, which sites work best, hiring seasons |
| Scorecard | Applications sent (your north star), referrals asked, replies and interviews per week; what's working; lookalike companies; network keeper |
| Ask | Ask questions about your job market |
| Get found | Phrases recruiters use per market vs your headline, headline suggestions, Gulf profile checklist, Gulf-style CV |
| Side work | Contract and freelance searches (check your employment contract first) |

Several tabs use Backchannel, so keep it connected in the sidebar.

## Free official feeds on trial (Adzuna, Working Nomads)

- **Adzuna** (India): get a free key at developer.adzuna.com, then paste the App ID and App Key under **Adzuna** in the sidebar.
- **Working Nomads** (remote sales roles open to India): needs nothing; it appears under Sites for India.
- **Market view → Source uniqueness** shows what share of each source's jobs no other source found. After two weeks, switch off any source under 10%.

## Which sites work in which market

| Market | Free (JobSpy) | Apify (paid) |
|---|---|---|
| India | LinkedIn, Indeed, Naukri, Glassdoor, Adzuna, Working Nomads (remote) | Instahyre, Foundit |
| UAE, Saudi Arabia, Qatar, Kuwait, Oman, Bahrain | LinkedIn, Indeed, Bayt | NaukriGulf, Foundit, GulfTalent |

## Good to know

- JobSpy reads public job pages and never uses your logins. Keep your searches modest, because LinkedIn in particular blocks heavy use for a while.
- Sites change their pages from time to time. If one stops working, update JobSpy by running `uv cache clean python-jobspy` once, then start JobRadar again.
- For personal use only.

## For Claude (developing JobRadar)

- Source of truth: `backchannel/jobradar/`. Never commit `data/` (keys, connections, history).
- Offline test: `uv run --python 3.12 --with-requirements jobradar/requirements.txt python jobradar/tests/smoke_test.py`
- After changes, the owner runs the installer to update `~/JobRadar`.
