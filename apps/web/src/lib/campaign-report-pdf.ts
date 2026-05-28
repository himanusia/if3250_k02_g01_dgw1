import type { CampaignDashboardRecord, CampaignDetailRecord } from "./app-types";
import { formatObjectiveDetails } from "./campaign-objective";

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
  const kolSummaries = campaign.contentsByKol
    .map((group) => ({
      name: group.displayName,
      handles: group.handles,
      views: group.contents.reduce((sum, content) => sum + content.viewCount, 0),
      likes: group.contents.reduce((sum, content) => sum + content.likeCount, 0),
      comments: group.contents.reduce((sum, content) => sum + content.commentCount, 0),
      shares: group.contents.reduce((sum, content) => sum + content.shareCount, 0),
      contentCount: group.contents.length,
    }));
  const topKolByViews = [...kolSummaries].sort((left, right) => right.views - left.views || right.contentCount - left.contentCount)[0];
  const topKolByLikes = [...kolSummaries].sort((left, right) => right.likes - left.likes || right.contentCount - left.contentCount)[0];
  const topKolByContents = [...kolSummaries].sort((left, right) => right.contentCount - left.contentCount || right.views - left.views)[0];
  const totals = contents.reduce(
    (accumulator, content) => ({
      comments: accumulator.comments + content.commentCount,
      failed: accumulator.failed + (content.syncStatus === "failed" ? 1 : 0),
      likes: accumulator.likes + content.likeCount,
      pending: accumulator.pending + (content.syncStatus === "pending" ? 1 : 0),
      post: accumulator.post + (content.contentType === "post" ? 1 : 0),
      reel: accumulator.reel + (content.contentType === "reel" ? 1 : 0),
      shares: accumulator.shares + content.shareCount,
      story: accumulator.story + (content.contentType === "story" ? 1 : 0),
      success: accumulator.success + (content.syncStatus === "success" ? 1 : 0),
      views: accumulator.views + content.viewCount,
    }),
    { comments: 0, failed: 0, likes: 0, pending: 0, post: 0, reel: 0, shares: 0, story: 0, success: 0, views: 0 },
  );
  const uniqueHandleCount = new Set(campaign.contentsByKol.flatMap((group) => group.handles)).size;
  const totalBudgetUsed = progress?.budgetUsedIdr ?? contents.reduce((sum, content) => sum + (content.budgetIdr ?? 0), 0);
  const actualContentCount = progress?.contentCount ?? contents.length;
  const actualViewCount = progress?.viewCount ?? totals.views;
  const actualLikeCount = progress?.likeCount ?? totals.likes;
  const actualCommentCount = progress?.commentCount ?? totals.comments;
  const actualShareCount = progress?.shareCount ?? totals.shares;

  const lines: PdfLine[] = [
    { size: 18, text: "Laporan Campaign" },
    { size: 15, text: campaign.name },
    { text: `Brand: ${campaign.brand}` },
    { text: `Status: ${campaign.status}` },
    { text: `Periode: ${campaign.periodStart} - ${campaign.periodEnd}` },
    { text: `Generated: ${formatDate(new Date().toISOString())}` },
    { text: "" },
    { size: 13, text: "I. Informasi Campaign" },
    { text: `Target KOL: ${formatNumber(campaign.targetKolCount)} | KOL terhubung: ${formatNumber(campaign.kols.length)} | Handle unik: ${formatNumber(uniqueHandleCount)}` },
    { text: `Target konten: ${formatNumber(campaign.targetContentCount)} | Aktual konten: ${formatNumber(actualContentCount)} (post ${formatNumber(progress?.postCount ?? totals.post)}, reels ${formatNumber(progress?.reelCount ?? totals.reel)}, story ${formatNumber(progress?.storyCount ?? totals.story)})` },
    { text: `Budget campaign: Rp${formatNumber(campaign.budgetIdr)} | Budget digunakan: Rp${formatNumber(totalBudgetUsed)}` },
    { text: `Keyword: ${campaign.keywords || "-"}` },
    { text: "" },
    { size: 13, text: "II. Ringkasan Eksekutif" },
    { text: `Total Views: ${formatNumber(actualViewCount)}` },
    { text: `Total Likes: ${formatNumber(actualLikeCount)}` },
    { text: `Total Comments: ${formatNumber(actualCommentCount)}` },
    { text: `Total Shares: ${formatNumber(actualShareCount)}` },
    { text: `Status sync: ${formatNumber(progress?.syncedContentCount ?? totals.success)} sukses, ${formatNumber(progress?.failedSyncCount ?? totals.failed)} gagal, ${formatNumber(progress?.pendingSyncCount ?? totals.pending)} pending` },
    { text: `Top KOL by views: ${topKolByViews ? `${topKolByViews.name} (${formatNumber(topKolByViews.views)} views)` : "-"}` },
    { text: `Top KOL by likes: ${topKolByLikes ? `${topKolByLikes.name} (${formatNumber(topKolByLikes.likes)} likes)` : "-"}` },
    { text: `KOL konten terbanyak: ${topKolByContents ? `${topKolByContents.name} (${formatNumber(topKolByContents.contentCount)} konten)` : "-"}` },
    { text: "" },
    { size: 13, text: "III. Objective" },
  ];

  lines.push(...wrapText(formatObjectiveDetails(campaign.objective)).map((text) => ({ text })));
  lines.push({ text: "" }, { size: 13, text: "IV. Deskripsi dan Brief" });
  lines.push(...wrapText(campaign.description).map((text) => ({ text })));
  lines.push(...wrapText(campaign.postBriefs).map((text) => ({ text: `Brief: ${text}` })));

  lines.push({ text: "" }, { size: 13, text: "V. Ringkasan Per KOL" });
  if (!kolSummaries.length) {
    lines.push({ text: "Belum ada KOL yang terhubung ke campaign ini." });
  }
  for (const kol of kolSummaries) {
    lines.push({
      text: `${kol.name} | ${kol.handles.length ? kol.handles.join(" / ") : "-"} | ${formatNumber(kol.contentCount)} konten | ${formatNumber(kol.views)} views | ${formatNumber(kol.likes)} likes | ${formatNumber(kol.comments)} comments | ${formatNumber(kol.shares)} shares`,
    });
  }

  lines.push({ text: "" }, { size: 13, text: "VI. Rincian Konten Per KOL" });

  for (const group of campaign.contentsByKol) {
    lines.push({ text: "" }, { size: 13, text: `KOL: ${group.displayName}` });
    lines.push({ text: group.handles.length ? group.handles.join(" / ") : "Handle belum tersimpan" });

    for (const content of group.contents) {
      lines.push({ text: `- ${content.contentType.toUpperCase()} ${content.platform.toUpperCase()} | ${content.syncStatus} | ${formatDate(content.postedAt)}` });
      lines.push({ text: `  Actual: ${formatNumber(content.viewCount)} views, ${formatNumber(content.likeCount)} likes, ${formatNumber(content.commentCount)} comments, ${formatNumber(content.shareCount)} shares` });
      lines.push({ text: `  Estimasi: ${formatNumber(content.estimatedViewCount)} views, ${formatNumber(content.estimatedLikeCount)} likes, ${formatNumber(content.estimatedCommentCount)} comments, ${formatNumber(content.estimatedShareCount)} shares` });
      lines.push({ text: `  Budget: Rp${formatNumber(content.budgetIdr ?? 0)} | FYP: ${content.isFyp === null ? "-" : content.isFyp ? "Ya" : "Tidak"} | Author: ${content.authorDisplayName || content.authorHandle || "-"}` });
      if (!content.contentUrl.startsWith("manual://")) {
        lines.push(...wrapText(content.contentUrl, 96).map((text) => ({ text: `  ${text}` })));
      }
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
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
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
  const safeCampaignName = cleanPdfText(campaign.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `campaign-${campaign.id}`;

  anchor.href = url;
  anchor.download = `${safeCampaignName}-report.pdf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
