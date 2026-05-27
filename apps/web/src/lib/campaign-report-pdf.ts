import type { CampaignDashboardRecord, CampaignDetailRecord } from "./app-types";

type PdfLine = {
  size?: number;
  text: string;
};

const PAGE = {
  height: 842,
  margin: 42,
  width: 595,
};

function cleanPdfText(value: string | number | null | undefined) {
  return String(value ?? "-")
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatNumber(value: number) {
  return value.toLocaleString("id-ID");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function wrapText(text: string, maxChars = 88) {
  const words = cleanPdfText(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : ["-"];
}

function buildLines(campaign: CampaignDetailRecord, progress?: CampaignDashboardRecord): PdfLine[] {
  const contents = campaign.contentsByKol.flatMap((group) => group.contents);
  const totals = contents.reduce(
    (accumulator, content) => ({
      comments: accumulator.comments + content.commentCount,
      likes: accumulator.likes + content.likeCount,
      shares: accumulator.shares + content.shareCount,
      views: accumulator.views + content.viewCount,
    }),
    { comments: 0, likes: 0, shares: 0, views: 0 },
  );

  const lines: PdfLine[] = [
    { size: 18, text: `Laporan Campaign: ${campaign.name}` },
    { text: `Brand: ${campaign.brand}` },
    { text: `Status: ${campaign.status}` },
    { text: `Periode: ${campaign.periodStart} - ${campaign.periodEnd}` },
    { text: `Generated: ${formatDate(new Date().toISOString())}` },
    { text: "" },
    { size: 13, text: "Ringkasan" },
    { text: `KOL: ${campaign.kols.length}` },
    { text: `Konten: ${contents.length}` },
    { text: `Views: ${formatNumber(progress?.viewCount ?? totals.views)}` },
    { text: `Likes: ${formatNumber(progress?.likeCount ?? totals.likes)}` },
    { text: `Comments: ${formatNumber(progress?.commentCount ?? totals.comments)}` },
    { text: `Shares: ${formatNumber(progress?.shareCount ?? totals.shares)}` },
    { text: "" },
    { size: 13, text: "Objective" },
  ];

  lines.push(...wrapText(campaign.objective).map((text) => ({ text })));
  lines.push({ text: "" }, { size: 13, text: "Deskripsi" });
  lines.push(...wrapText(campaign.description).map((text) => ({ text })));

  for (const group of campaign.contentsByKol) {
    lines.push({ text: "" }, { size: 13, text: `KOL: ${group.displayName}` });
    lines.push({ text: group.handles.length ? group.handles.join(" / ") : "Handle belum tersimpan" });

    for (const content of group.contents) {
      lines.push({ text: `- ${content.platform.toUpperCase()} | ${content.syncStatus} | ${formatDate(content.postedAt)}` });
      lines.push({ text: `  Metrics: ${formatNumber(content.viewCount)} views, ${formatNumber(content.likeCount)} likes, ${formatNumber(content.commentCount)} comments, ${formatNumber(content.shareCount)} shares` });
      lines.push(...wrapText(content.contentUrl, 96).map((text) => ({ text: `  ${text}` })));
      if (content.caption || content.title) {
        lines.push(...wrapText(content.caption || content.title, 92).slice(0, 3).map((text) => ({ text: `  ${text}` })));
      }
    }
  }

  return lines;
}

function renderPages(lines: PdfLine[]) {
  const pages: string[] = [];
  let cursorY = PAGE.height - PAGE.margin;
  let pageCommands: string[] = ["BT", "/F1 11 Tf"];

  function addPage() {
    pageCommands.push("ET");
    pages.push(pageCommands.join("\n"));
    cursorY = PAGE.height - PAGE.margin;
    pageCommands = ["BT", "/F1 11 Tf"];
  }

  for (const line of lines) {
    const size = line.size ?? 10;
    const lineHeight = size + 5;

    if (cursorY - lineHeight < PAGE.margin) {
      addPage();
    }

    if (!line.text) {
      cursorY -= lineHeight;
      continue;
    }

    pageCommands.push(`/F1 ${size} Tf`);
    pageCommands.push(`1 0 0 1 ${PAGE.margin} ${cursorY} Tm`);
    pageCommands.push(`(${escapePdfText(cleanPdfText(line.text))}) Tj`);
    cursorY -= lineHeight;
  }

  addPage();
  return pages;
}

function buildPdfBytes(pages: string[]) {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids ${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")} /Count ${pages.length} >>`,
  ];

  pages.forEach((commands, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`);
  });

  let body = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([body], { type: "application/pdf" });
}

export function downloadCampaignReportPdf(campaign: CampaignDetailRecord, progress?: CampaignDashboardRecord) {
  const blob = buildPdfBytes(renderPages(buildLines(campaign, progress)));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `campaign-${campaign.id}-report.pdf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
