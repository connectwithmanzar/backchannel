// The popup: reads the page you are on, asks Backchannel how well it fits, and saves it when you press Save.
const BASE = "https://backchannel-eight.vercel.app";
const view = document.getElementById("view");
let job = null;
let saved = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const open = (path) => chrome.tabs.create({ url: BASE + path });

async function api(path, body) {
  const res = await fetch(BASE + path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  // Not signed in: the site sends you to its sign-in page instead of answering.
  if (res.redirected && new URL(res.url).pathname.startsWith("/login")) return { signedOut: true };
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function render(result) {
  const fit = result.score >= 75 ? "Strong fit" : result.score >= 60 ? "Good fit" : result.score >= 45 ? "Possible" : "Weak fit";
  const color = result.score >= 60 ? "var(--accent)" : result.score >= 45 ? "var(--warn)" : "var(--muted)";
  const parts = result.parts.map((p) => `<span>${esc(p.label)}</span><div class="bar"><i style="width:${Math.max(2, p.value)}%"></i></div><b>${Math.round(p.value)}</b>`).join("");
  const v = (result.india && result.india.verdict) || (result.openToIndia ? "yes" : "unclear");
  const why = result.india && result.india.reason ? ` ${esc(result.india.reason)}` : "";
  const india = v === "yes" ? `<div class="good"><b>Open to India.</b>${why}</div>`
    : v === "no" ? `<div class="note"><b>Probably not open to India.</b>${why} Check the posting before you apply.</div>`
    : `<div class="note"><b>Could not tell if this is open to India.</b>${why} Check the posting.</div>`;
  const bullets = (title, items) => items && items.length ? `<div><b>${title}</b><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const reading = result.byAi ? `${bullets("Why it fits", result.fits)}${bullets("What is missing", result.gaps)}` : `<p class="muted">${esc(result.explanation)}</p>`;
  view.innerHTML = `
    <div class="card"><div class="ring" style="background:conic-gradient(${color} 0 ${result.score}%, var(--line) 0)"><span>${result.score}</span></div>
      <div><b>${fit}</b><div class="muted">${esc(job.company || "Company not found")}${job.location ? " · " + esc(job.location) : ""}</div></div></div>
    <div class="parts">${parts}</div>
    ${india}
    ${reading}
    <div class="btns" id="btns">
      ${saved ? `<p class="ok">${result.saved ? "Already in Backchannel ✓" : "Saved to Backchannel ✓"}</p><button class="primary" id="open">Open it in Backchannel</button><button id="tailor">Tailor my CV to this role</button>`
              : `<button class="primary" id="save">Save to Backchannel</button>`}
      ${job.company ? `<button id="addco">Add ${esc(job.company)} to my companies</button><button id="more">See more roles at ${esc(job.company)}</button>` : ""}
      <button id="people">Find people at ${esc(job.company || "this company")}</button>
    </div>
    <p class="err" id="err" hidden></p>
    <details><summary>Fix the details</summary>
      <label>Job title<input id="f-title" value="${esc(job.title)}"></label>
      <label>Company<input id="f-company" value="${esc(job.company)}"></label>
      <label>Location<input id="f-location" value="${esc(job.location)}"></label>
      <button id="rescore" style="margin-top:8px">Score again</button>
    </details>`;
  const $ = (id) => document.getElementById(id);
  const fail = (m) => { const e = $("err"); e.textContent = m; e.hidden = false; };
  if ($("save")) $("save").onclick = async () => {
    $("save").disabled = true; $("save").textContent = "Saving…";
    const r = await api("/api/jobs/paste", { url: job.url, title: job.title, company: job.company, location: job.location, text: job.text });
    if (r.signedOut) return showSignIn();
    if (!r.ok) { $("save").disabled = false; $("save").textContent = "Save to Backchannel"; return fail(r.data.error || "Couldn't save that."); }
    saved = r.data; render(result);
  };
  if ($("open")) $("open").onclick = () => open(`/roles/${saved.job_id}`);
  if ($("tailor")) $("tailor").onclick = () => open(`/roles/${saved.job_id}`);
  $("people").onclick = () => open(`/referrals?company=${encodeURIComponent(job.company || "")}`);
  if ($("more")) $("more").onclick = () => open(`/companies?find=${encodeURIComponent(job.company)}`);
  if ($("addco")) $("addco").onclick = async () => {
    $("addco").disabled = true; $("addco").textContent = "Adding…";
    const r = await api("/api/sources/import", { companies: [{ name: job.company, domain: null }] });
    if (r.signedOut) return showSignIn();
    const o = r.ok && r.data.outcomes && r.data.outcomes[0];
    if (!o) { $("addco").disabled = false; $("addco").textContent = `Add ${job.company} to my companies`; return fail(r.data.error || "Couldn't add that company."); }
    $("addco").textContent = o.status === "added" ? `Added ✓ ${o.roles ? o.roles + " roles found" : ""}` : o.status === "no_feed" ? "Added ✓ (scanned each morning)" : o.status === "already_there" ? "Already in your companies ✓" : "Skipped: on your stealth list";
  };
  $("rescore").onclick = () => { job = { ...job, title: $("f-title").value.trim(), company: $("f-company").value.trim(), location: $("f-location").value.trim() }; score(); };
}

function showSignIn() {
  view.innerHTML = `<p>You are not signed in to Backchannel in this browser.</p><div class="btns"><button class="primary" id="login">Open Backchannel to sign in</button><button id="again">I have signed in, try again</button></div>`;
  document.getElementById("login").onclick = () => open("/login");
  document.getElementById("again").onclick = () => start();
}

async function score() {
  view.innerHTML = `<p class="muted">Scoring this role against your profile…</p>`;
  const r = await api("/api/extension/preview", { url: job.url, title: job.title, company: job.company, location: job.location, remote: job.remote, text: job.text });
  if (r.signedOut) return showSignIn();
  if (!r.ok) {
    view.innerHTML = `<p class="err">${esc(r.data.error || "Couldn't score this page.")}</p>
      <label>Job title<input id="f-title" value="${esc(job.title)}"></label>
      <label>Company<input id="f-company" value="${esc(job.company)}"></label>
      <label>Location<input id="f-location" value="${esc(job.location)}"></label>
      <button class="primary" id="rescore" style="margin-top:8px">Score this</button>`;
    document.getElementById("rescore").onclick = () => { job = { ...job, title: document.getElementById("f-title").value.trim(), company: document.getElementById("f-company").value.trim(), location: document.getElementById("f-location").value.trim() }; score(); };
    return;
  }
  if (r.data.saved && !saved) saved = { job_id: r.data.saved.job_id };
  render(r.data);
}

async function start() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || "")) { view.innerHTML = `<p class="muted">Open a job page first, then press the Backchannel button.</p>`; return; }
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageExtractor });
    job = result;
    if (job && job.needsJobSelection) { view.innerHTML = `<p><b>This is a list of jobs.</b></p><p class="muted">I could not find an open job on this page. Click a job so its details show on the right, then press the button again. If it still fails, drag to select the job description text on the right and press the button again.</p><p class="muted" style="font-size:11px">${esc(job.debug || "")}</p>`; return; }
    if (!job || (job.text || "").length < 80) { view.innerHTML = `<p class="muted">This page has too little text to score. Select the job description on the page and press the button again.</p>`; return; }
    await score();
  } catch (e) {
    view.innerHTML = `<p class="err">Couldn't read this page: ${esc(e && e.message ? e.message : e)}</p>`;
  }
}
start();
