// Reads the job on the page you are viewing. It runs only when you press the Backchannel button.
// It collects the title, company, place and text of ONE posting and nothing else: no passwords, no other tabs.
function pageExtractor(doc, win) {
  doc = doc || document;
  win = win || window;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  // Keeps paragraph and bullet breaks, so the text stays readable.
  const tidy = (s) => String(s || "").replace(/\r/g, "").replace(/[ \t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const htmlToText = (h) => tidy(String(h || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<li[^>]*>/gi, "\n• ").replace(/<\/(p|div|li|h\d|ul|ol)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  const textOf = (el) => (el ? tidy(el.innerText || el.textContent || "") : "");
  const href = win.location.href;
  let url;
  try { url = new URL(href); } catch (e) { url = { hostname: "", pathname: "", searchParams: { get: () => null } }; }

  const selection = tidy(win.getSelection ? String(win.getSelection()) : "");

  // LinkedIn: a search page shows many jobs at once. Read only the one that is open on the right.
  if (/(^|\.)linkedin\.com$/.test(url.hostname)) {
    const view = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/);
    const isListPage = /\/jobs\/(search|collections|recommended)/.test(url.pathname);
    if (isListPage || view) {
      // 1. Known panel names; 2. otherwise the smallest block that holds both a company link and "About the job".
      const selectors = [".jobs-search__job-details--container", ".jobs-search__job-details--wrapper", ".scaffold-layout__detail", ".jobs-details", ".job-view-layout", "[class*='jobs-search__job-details']", "[class*='job-details']"];
      let pane = null;
      for (const sel of selectors) { const el = doc.querySelector(sel); if (el && textOf(el).length > 200) { pane = el; break; } }
      if (!pane) {
        let bestLen = Infinity;
        Array.from(doc.querySelectorAll("div, section, article, main")).forEach((el) => {
          const t = el.textContent || "";
          if (t.length < 400 || t.length > 40000 || t.length >= bestLen) return;
          if (!/about the job/i.test(t) || !el.querySelector("a[href*='/company/']")) return;
          pane = el; bestLen = t.length;
        });
      }
      // The job's number: from the address, else from a link inside the panel, else from the highlighted card.
      let id = view ? view[1] : url.searchParams.get("currentJobId");
      if (!id && pane) { const link = pane.querySelector("a[href*='/jobs/view/']"); const m = link && (link.getAttribute("href") || "").match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/); if (m) id = m[1]; }
      if (!id) { const card = doc.querySelector("[data-job-id].jobs-search-results-list__list-item--active, li[class*='--active'] [data-job-id], [aria-current='true'][data-job-id]"); if (card) id = card.getAttribute("data-job-id"); }
      if (pane) {
        const heading = pane.querySelector("h1, h2");
        const companyLink = pane.querySelector("a[href*='/company/']");
        const primary = pane.querySelector("[class*='primary-description']");
        let location = clean((textOf(primary) || "").split("·")[0]);
        if (!location) {
          // No named element: LinkedIn prints "Place · posted 2 days ago · applicants" a few lines under the title.
          const lines = textOf(pane).split("\n").map(clean).filter(Boolean).slice(0, 14);
          const hit = lines.find((l) => l.includes("·") && /ago|applicant|reposted|promoted|people clicked/i.test(l) && !/^\d/.test(l));
          location = hit ? clean(hit.split("·")[0]) : "";
        }
        return {
          source: "linkedin", url: id ? "https://www.linkedin.com/jobs/view/" + id + "/" : href, title: clean(heading && heading.innerText).slice(0, 200),
          company: clean(companyLink && companyLink.innerText).slice(0, 200), location: location.slice(0, 200), remote: /remote/i.test(location),
          text: textOf(pane).slice(0, 12000),
        };
      }
      // Nothing found. Text you selected yourself still works; otherwise say why.
      if (selection.length <= 200) return { source: "list", needsJobSelection: true, debug: "job number " + (id ? "found" : "not found") + ", job details not found", url: href, title: "", company: "", location: "", remote: false, text: "" };
    }
  }

  // 1. Structured data many job pages publish for search engines.
  let posting = null;
  const walk = (node) => {
    if (!node || posting) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object") return;
    const type = [].concat(node["@type"] || []);
    if (type.includes("JobPosting")) { posting = node; return; }
    if (node["@graph"]) walk(node["@graph"]);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { walk(JSON.parse(s.textContent)); } catch (e) { /* not valid JSON, skip */ } });

  const placeOf = (loc) => {
    const l = [].concat(loc || [])[0] || {};
    const a = l.address || {};
    return clean([a.addressLocality, a.addressRegion, typeof a.addressCountry === "object" ? a.addressCountry.name : a.addressCountry].filter(Boolean).join(", "));
  };

  if (posting) {
    const org = posting.hiringOrganization;
    return {
      source: "structured", url: href, title: clean(posting.title),
      company: clean(typeof org === "object" ? org && org.name : org),
      location: placeOf(posting.jobLocation) || (posting.jobLocationType === "TELECOMMUTE" ? "Remote" : ""),
      remote: posting.jobLocationType === "TELECOMMUTE",
      text: htmlToText(posting.description).slice(0, 12000),
    };
  }

  // 2. Otherwise what is on screen: the heading, the page title and the visible text (or what you selected).
  const meta = (n) => { const m = doc.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]'); return m ? clean(m.getAttribute("content")) : ""; };
  const h1 = doc.querySelector("h1");
  const body = selection.length > 200 ? selection : textOf(doc.querySelector("main") || doc.body);
  return {
    source: selection.length > 200 ? "selection" : "page", url: href,
    title: clean((h1 && h1.innerText) || meta("og:title") || doc.title).slice(0, 200),
    company: meta("og:site_name"), location: "", remote: false, text: body.slice(0, 12000),
  };
}
if (typeof module !== "undefined") module.exports = { pageExtractor };
