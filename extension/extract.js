// Reads the job on the page you are viewing. It runs only when you press the Backchannel button.
// It collects the title, company, place and text of the posting and nothing else: no passwords, no other tabs.
function pageExtractor(doc, win) {
  doc = doc || document;
  win = win || window;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const htmlToText = (h) => clean(String(h || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|div|li|h\d|br)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&"));

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

  const selection = clean(win.getSelection ? String(win.getSelection()) : "");
  if (posting) {
    const org = posting.hiringOrganization;
    return {
      source: "structured", url: win.location.href, title: clean(posting.title),
      company: clean(typeof org === "object" ? org && org.name : org),
      location: placeOf(posting.jobLocation) || (posting.jobLocationType === "TELECOMMUTE" ? "Remote" : ""),
      remote: posting.jobLocationType === "TELECOMMUTE",
      text: htmlToText(posting.description).slice(0, 12000),
    };
  }

  // 2. Otherwise what is on screen: the heading, the page title and the visible text (or what you selected).
  const meta = (n) => { const m = doc.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]'); return m ? clean(m.getAttribute("content")) : ""; };
  const h1 = doc.querySelector("h1");
  const body = selection.length > 200 ? selection : clean((doc.querySelector("main") || doc.body || {}).innerText || "");
  return {
    source: selection.length > 200 ? "selection" : "page", url: win.location.href,
    title: clean((h1 && h1.innerText) || meta("og:title") || doc.title).slice(0, 200),
    company: meta("og:site_name"), location: "", remote: false, text: body.slice(0, 12000),
  };
}
if (typeof module !== "undefined") module.exports = { pageExtractor };
