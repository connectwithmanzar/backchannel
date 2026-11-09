# Prototype Brief: Referral-First Funnel

## Goal and the metric it must prove
Prove that Backchannel can produce **5 to 10 interviews a week** without applying on 100 portals and without taking below-average pay. Metric: interviews booked per week, with the funnel behind it (asks sent, replies, referrals, interviews).

Arithmetic (assumptions, not data): 75 referral asks a week x 6% become interviews = 4.5; 100 emails x 1.5% = 1.5; 50 applications x 3% = 1.5. Total about 7.5. If referral asks do not convert at roughly 5%, the goal is not reachable and we stop.

## Who it's for
One person: an SDR with 6 years' experience, interviewing from India, open to any country, who dislikes portals, likes referral asks and target-company lists, and wants maximum automation with a pay floor.

## The daily loop
- **Morning (automatic):** the daily run refreshes one ranked target list (AI proposals, owner imports, live hiring signals), scored by fit, company quality (funding stage, hiring growth, reputation) and pay against the owner's minimum OTE for each market.
- **Auto-send:** about 20 emails to high-fit roles go out inside the send window, using templates the owner approved. Replies stop the sequence.
- **Owner, 20 minutes:** reviews about 15 referral asks (best person per company, drafted ask, copy button, paste into LinkedIn himself) and about 10 prepared applications. Sensitive questions wait for him.
- **Anytime:** sees a job on any site, uses "Save from my own screen" or pastes the text; it is scored and queued.
- **Evening:** Telegram summary: sent, replies, interviews, tomorrow's queue. Replies trigger interview prep.
- **Two tracks:** fast (Gulf, India) and stretch (US/UK/EU remote), each with its own daily target.

## Prototype scope IN (smallest first)
1. One ranked target list with the pay and company-quality score, and a minimum OTE per market.
2. Two-track daily targets on the Today screen, with the weekly funnel (asks, replies, interviews).
3. Best person per target company from licensed data, plus a drafted referral ask with a copy button.
4. The same person emailed through the existing Gmail outreach, inside the cap.
5. Auto-send of high-fit emails from approved templates, only when Autopilot is switched on.
6. Paste-a-job box (text or link) that feeds the ranked list and prepared applications.
7. Interview prep per role, and offer comparison.

## Out of scope
Anything for hiring companies (test by hand with 3 startups later), the LinkedIn pre-fill extension, the screen-capture extension, raising the email cap, auto-submitting applications, public signup.

## Rule conflicts and how we resolve them
- **LinkedIn message-box pre-fill extension vs rule 1.** It acts inside LinkedIn, which rule 1 forbids and LinkedIn's terms discourage; the risk is a restricted account on the owner's main network. Resolution: the **copy button is the default and ships first**. The extension is a CTO and legal review item and stays off until cleared.
- **"Save from my own screen" vs rule 2.** Naukri, LinkedIn and others forbid scraping in their terms. One page the owner is already viewing, saved by his click, is lower risk than server scraping, but it is not risk-free. Resolution: ship paste text or link first. Extension capture comes after legal review, never on LinkedIn, never in bulk, never from our servers.
- **Auto-send vs rule 7.** Allowed only because rule 7 permits autopilot when switched on. Conditions: off by default, approved templates only, high-fit roles only, first week every email approved, applications and sensitive questions always wait.
- **Raising the 20/day cap vs rule 6.** The rule says "to start", so raising is allowed. Deferred until the warm-up shows low bounces and complaints. Referral emails share the same cap. Stop-on-reply, opt-out, send window and stealth blocklist never change.
- **Finding contacts.** Licensed data only, never LinkedIn scraping, and the current-employer blocklist applies.

## Success metrics and kill criteria
- Week 1: 45 touches a day sent or queued, owner time under 30 minutes a day.
- Referral ask reply rate: 20% or higher. Kill the referral path if it is under 10% after 150 asks.
- Interviews: 3 a week by week 3, 5 by week 6. Under 3 a week at week 4 means stop and rethink.
- Email: under 2% bounce, zero spam complaints; pause auto-send otherwise.
- Quality: at least 80% of interviews at or above the owner's minimum OTE.

## Open questions for the CTO
- **Feasibility:** can auto-send of 20 a day and daily runs fit Vercel Hobby crons, or do we need a paid plan?
- **Extension:** can a simple Chrome extension save the text of the page the owner is viewing, with no LinkedIn pre-fill? Effort in days?
- **Contact data:** which licensed source gives the right person and verified email for India, Gulf and EU startups, and does its licence allow this use?
- **Company signals:** which licensed feed gives funding, hiring growth and reputation without scraping?
- **Cost:** monthly cost for data, AI and email at 45 touches a day; is it under what one interview is worth?
- **Deliverability:** will a personal Gmail survive 20+ cold emails a day?
