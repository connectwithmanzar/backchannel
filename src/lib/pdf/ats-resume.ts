import PDFDocument from "pdfkit";

export interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
}

export interface ParsedSection {
  title: string;
  lines: {
    type: "header" | "subheader" | "bullet" | "paragraph";
    text: string;
    subtext?: string;
  }[];
}

/**
 * Parses CV markdown or plain text into structured sections suitable for ATS rendering.
 */
export function parseCvText(rawCv: string, fallbackContact?: ContactInfo): { contact: ContactInfo; sections: ParsedSection[] } {
  const lines = rawCv.split(/\r?\n/).map((l) => l.trimEnd());
  const contact: ContactInfo = { ...fallbackContact, name: fallbackContact?.name || "" };

  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let nameFound = !!contact.name;

  const COMMON_SECTION_HEADINGS = /^(experience|work experience|professional experience|employment history|education|skills|technical skills|tools|core competencies|summary|professional summary|certifications|projects|achievements)$/i;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // 1. Detect candidate name & contact details before the first section
    if (sections.length === 0 && !rawLine.startsWith("-")) {
      const h1Match = rawLine.match(/^#\s+(.+)$/);
      if (h1Match && !contact.name) {
        contact.name = h1Match[1].trim();
        nameFound = true;
        continue;
      }

      if (!nameFound && rawLine.length < 50 && !rawLine.includes("@") && !rawLine.includes("http")) {
        contact.name = rawLine.replace(/^#+\s*/, "");
        nameFound = true;
        continue;
      }

      if (rawLine.includes("@") || rawLine.includes("linkedin") || rawLine.includes("+") || /\d{3}/.test(rawLine)) {
        // Line containing contact links
        const parts = rawLine.split(/\s*\|\s*|\s*•\s*|\s*·\s*/);
        for (const p of parts) {
          const part = p.trim();
          if (part.includes("@") && !contact.email) contact.email = part;
          else if (/linkedin\.com/i.test(part) && !contact.linkedin) contact.linkedin = part;
          else if (/github\.com|https?:\/\//i.test(part) && !contact.website) contact.website = part;
          else if (/[+\d()-\s]{7,}/.test(part) && !contact.phone) contact.phone = part;
          else if (!contact.location && !part.startsWith("http")) contact.location = part;
        }
        continue;
      }
    }

    // 2. Check for Markdown headers: # or ## or ALL CAPS section headers
    const h1Match = rawLine.match(/^#\s+(.+)$/);
    const h2Match = rawLine.match(/^##\s+(.+)$/);
    const isAllCapsHeading = rawLine.length < 40 && COMMON_SECTION_HEADINGS.test(rawLine.replace(/[:#]/g, "").trim());

    if (h1Match && !contact.name) {
      contact.name = h1Match[1].trim();
      nameFound = true;
      continue;
    }

    if (h2Match || isAllCapsHeading) {
      const title = (h2Match ? h2Match[1] : rawLine).replace(/[:#]/g, "").trim();
      currentSection = { title: title.toUpperCase(), lines: [] };
      sections.push(currentSection);
      continue;
    }

    // 3. Sub-headers inside sections (e.g., ### Role | Company | Dates)
    const h3Match = rawLine.match(/^###\s+(.+)$/);
    if (h3Match) {
      if (!currentSection) {
        currentSection = { title: "EXPERIENCE", lines: [] };
        sections.push(currentSection);
      }
      currentSection.lines.push({ type: "subheader", text: h3Match[1].trim() });
      continue;
    }

    // 4. Bullet points: -, *, •, or numbered
    const bulletMatch = rawLine.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (!currentSection) {
        currentSection = { title: "EXPERIENCE", lines: [] };
        sections.push(currentSection);
      }
      currentSection.lines.push({ type: "bullet", text: bulletMatch[1].trim() });
      continue;
    }

    // 5. Normal paragraphs or role title lines (e.g. "Senior Account Executive | Supabase | 2022 – Present")
    if (rawLine.includes("|") && rawLine.length < 120) {
      if (!currentSection) {
        currentSection = { title: "EXPERIENCE", lines: [] };
        sections.push(currentSection);
      }
      currentSection.lines.push({ type: "subheader", text: rawLine.replace(/\*\*/g, "") });
      continue;
    }

    if (!currentSection) {
      currentSection = { title: "SUMMARY", lines: [] };
      sections.push(currentSection);
    }
    currentSection.lines.push({ type: "paragraph", text: rawLine.replace(/\*\*/g, "") });
  }

  return { contact, sections };
}

/**
 * Compiles an ATS-optimized, single-column PDF resume directly to a Buffer.
 * - Margin: 36pt (0.5 in)
 * - Fonts: Standard PDF Helvetica / Helvetica-Bold
 * - Selectable text stream
 * - Clean section dividing lines
 */
export async function compileAtsResumePdf(rawCv: string, contactFallback?: ContactInfo): Promise<Buffer> {
  const { contact, sections } = parseCvText(rawCv, contactFallback);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 36, bottom: 36, left: 40, right: 40 },
      autoFirstPage: true,
      info: {
        Title: `${contact.name || "Candidate"} - Resume`,
        Author: contact.name || "Candidate",
        Creator: "Backchannel ATS PDF Engine",
      },
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", (err: Error) => reject(err));

    const printableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // --- Header Section ---
    const name = contact.name || "Sales Candidate";
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(name.toUpperCase(), { align: "center", characterSpacing: 0.5 });
    doc.moveDown(0.25);

    // Contact Subline: Phone | Email | Location | LinkedIn | Website
    const contactParts = [
      contact.phone,
      contact.email,
      contact.location,
      contact.linkedin ? contact.linkedin.replace(/^https?:\/\/(www\.)?/, "") : undefined,
      contact.website ? contact.website.replace(/^https?:\/\/(www\.)?/, "") : undefined,
    ].filter(Boolean);

    if (contactParts.length > 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#4B5563").text(contactParts.join("   |   "), { align: "center" });
    }
    doc.moveDown(0.6);

    // Divider under header
    const currentY = doc.y;
    doc.strokeColor("#D1D5DB").lineWidth(0.75).moveTo(doc.page.margins.left, currentY).lineTo(doc.page.margins.left + printableWidth, currentY).stroke();
    doc.moveDown(0.6);

    // --- Body Sections ---
    for (const sec of sections) {
      // Avoid orphan section headers near page bottom
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
      }

      // Section Title
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#0F172A").text(sec.title, { characterSpacing: 0.6 });
      doc.moveDown(0.15);

      // Section Accent Line
      const lineY = doc.y;
      doc.strokeColor("#94A3B8").lineWidth(0.5).moveTo(doc.page.margins.left, lineY).lineTo(doc.page.margins.left + printableWidth, lineY).stroke();
      doc.moveDown(0.35);

      for (const item of sec.lines) {
        if (doc.y > doc.page.height - 45) {
          doc.addPage();
        }

        if (item.type === "subheader") {
          doc.moveDown(0.25);
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#1E293B").text(item.text, { width: printableWidth });
          doc.moveDown(0.15);
        } else if (item.type === "bullet") {
          const bulletIndent = 12;
          const bulletText = item.text.replace(/\*\*/g, "");
          const bulletY = doc.y;

          doc.font("Helvetica").fontSize(8.75).fillColor("#334155").text("•", doc.page.margins.left + 2, bulletY, { width: 10, lineGap: 1.5 });
          doc.font("Helvetica").fontSize(8.75).fillColor("#334155").text(bulletText, doc.page.margins.left + bulletIndent, bulletY, {
            width: printableWidth - bulletIndent,
            lineGap: 1.5,
          });
          doc.moveDown(0.15);
        } else if (item.type === "paragraph") {
          doc.font("Helvetica").fontSize(8.75).fillColor("#334155").text(item.text, {
            width: printableWidth,
            lineGap: 2,
          });
          doc.moveDown(0.3);
        }
      }

      doc.moveDown(0.6);
    }

    doc.end();
  });
}
