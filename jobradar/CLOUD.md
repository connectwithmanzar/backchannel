# Run the auto-apply robot in the cloud

This runs the same robot as on your Mac, but on a small server that is always on, so applications go out
with your laptop closed. Everything it will not do (CAPTCHAs, logins, guessing visa, salary or notice-period
answers, LinkedIn/Indeed/Naukri/Glassdoor) is unchanged: it stops and shows "Needs you" in Backchannel.

## What you need
- A host that runs a Docker container all the time. Any of these works: **Railway**, **Fly.io**, **Render (Background Worker)**.
  Expect roughly $5 a month. Pick one and make an account yourself.
- Your Backchannel address, for example `https://backchannel-eight.vercel.app`
- Your JobRadar key (the same one JobRadar on your Mac uses; it is the `JOBRADAR_SECRET` set in Vercel).

## Steps (Railway, the simplest)
1. In Railway, click **New Project → Deploy from GitHub repo** and choose `connectwithmanzar/backchannel`.
2. Open the service's **Settings** and set:
   - **Root Directory:** `jobradar`
   - **Dockerfile Path:** `Dockerfile.cloud`
3. Open **Variables** and add:
   - `BACKCHANNEL_URL` = your Backchannel address
   - `JOBRADAR_SECRET` = your JobRadar key
   - optional `APPLY_INTERVAL_S` = `300` (seconds between queue checks; never below 60)
4. Deploy. In the logs you should see `Cloud worker started. Checking the queue every 300 s.`
5. Turn **off** the robot on your Mac so the two do not compete: run `Uninstall JobRadar.command`, or in Terminal:
   `launchctl bootout gui/$(id -u)/com.jobradar.apply`
6. In Backchannel: Applied → Auto-apply → Settings, set auto-apply to **Practice** first. Tap Apply on a role on Swipe,
   then watch Applied → Tracker → Live activity. When the filled forms look right, switch to **Send applications**.

## Fly.io / Render
Same idea: build from the `jobradar` folder with `Dockerfile.cloud`, set the same two variables, run it as a
worker (no web port needed).

## Good to know
- The server keeps no passwords. Nothing is stored except short-lived screenshots inside the container.
- If the logs say `Missing settings`, a variable is not set. If they say `Connect Backchannel`, the address or key is wrong.
- Cloud servers' addresses are shared, so some company sites may block them more often than your home connection.
  Those applications show up as "Needs you" and you can finish them by hand.
