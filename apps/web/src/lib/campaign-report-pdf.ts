import type { CampaignDashboardRecord, CampaignDetailRecord, KolRecord } from "./app-types";
import { getTargetInteractions, parseCampaignObjective } from "./campaign-objective";

type PdfPage = {
  commands: string[];
  cursorY: number;
};

type TableColumn<T> = {
  align?: "left" | "right";
  header: string;
  render: (row: T) => string | number | null | undefined;
  width: number;
};

const PAGE = {
  height: 842,
  margin: 36,
  width: 595,
};

const COLORS = {
  blue: [0.69, 0.81, 0.92],
  border: [0.1, 0.1, 0.1],
  dark: [0.12, 0.08, 0.09],
  lightBlue: [0.91, 0.96, 1],
  muted: [0.38, 0.38, 0.38],
  rose: [0.7, 0.24, 0.22],
  softRose: [1, 0.96, 0.97],
  white: [1, 1, 1],
} as const;

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

function formatNumber(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("id-ID");
}

function formatCurrency(value: number | null | undefined) {
  if (!value) return "-";
  return `Rp${formatNumber(value)}`;
}

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

function wrapText(text: string | number | null | undefined, maxChars = 54) {
  const words = cleanPdfText(text).split(/\s+/).filter(Boolean);
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

  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function setFill(color: readonly number[]) {
  return `${color[0]} ${color[1]} ${color[2]} rg`;
}

function setStroke(color: readonly number[]) {
  return `${color[0]} ${color[1]} ${color[2]} RG`;
}

function rect(x: number, y: number, width: number, height: number, mode: "B" | "S" | "f") {
  return `${x} ${y} ${width} ${height} re ${mode}`;
}

function textCommand(text: string | number | null | undefined, x: number, y: number, size = 10, font = "F1", color: readonly number[] = COLORS.dark) {
  return [
    "BT",
    setFill(color),
    `/${font} ${size} Tf`,
    `1 0 0 1 ${x} ${y} Tm`,
    `(${escapePdfText(cleanPdfText(text))}) Tj`,
    "ET",
  ].join("\n");
}

function rightTextCommand(text: string | number | null | undefined, rightX: number, y: number, size = 10, font = "F1", color: readonly number[] = COLORS.dark) {
  const width = cleanPdfText(text).length * size * 0.48;
  return textCommand(text, rightX - width, y, size, font, color);
}

function createPage(): PdfPage {
  return { commands: [], cursorY: PAGE.height - PAGE.margin };
}

function addPage(pages: PdfPage[]) {
  const page = createPage();
  pages.push(page);
  return page;
}

function ensureSpace(pages: PdfPage[], page: PdfPage, height: number) {
  if (page.cursorY - height < PAGE.margin) {
    return addPage(pages);
  }
  return page;
}

function getStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    active: "Berjalan",
    archived: "Selesai",
    completed: "Selesai",
    draft: "Belum mulai",
    failed: "Gagal",
    pending: "Drafting",
    success: "Published",
  };
  return labels[status ?? ""] ?? cleanPdfText(status);
}

function parseTargetKolTiers(value: string | null | undefined) {
  const tiers = new Map([
    ["nano", 0],
    ["micro", 0],
    ["macro", 0],
    ["mega", 0],
  ]);
  const text = value?.trim() ?? "";

  for (const part of text.split(/[\n,;]+/)) {
    const match = part.trim().match(/^([a-zA-Z]+)\s*[:=]?\s*(\d+)/);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const count = Number(match[2]);
    if (tiers.has(key) && Number.isFinite(count)) {
      tiers.set(key, Math.max(0, Math.round(count)));
    }
  }

  if (![...tiers.values()].some(Boolean)) {
    tiers.set("nano", 15);
    tiers.set("micro", 5);
  }

  return [
    { key: "nano", label: "Nano", target: tiers.get("nano") ?? 0 },
    { key: "micro", label: "Micro", target: tiers.get("micro") ?? 0 },
    { key: "macro", label: "Macro", target: tiers.get("macro") ?? 0 },
    { key: "mega", label: "Mega", target: tiers.get("mega") ?? 0 },
  ];
}

function drawHeader(page: PdfPage, campaign: CampaignDetailRecord) {
  const y = page.cursorY;
  drawFaviconMark(page, PAGE.margin, y - 32, 32);
  page.commands.push(textCommand("Laporan Campaign", PAGE.margin + 42, y - 10, 18, "F2"));
  page.commands.push(textCommand(campaign.name, PAGE.margin + 42, y - 28, 12, "F2", COLORS.rose));
  page.commands.push(rightTextCommand(`Generated ${formatDate(new Date().toISOString(), true)}`, PAGE.width - PAGE.margin, y - 10, 8, "F1", COLORS.muted));
  page.commands.push(setStroke(COLORS.rose), `${PAGE.margin} ${y - 44} m ${PAGE.width - PAGE.margin} ${y - 44} l S`);
  page.cursorY = y - 62;
}

function drawFaviconMark(page: PdfPage, x: number, y: number, size: number) {
  const center = x + size / 2;
  const middle = y + size / 2;
  const radius = size / 2;
  const c = radius * 0.5522847498;
  page.commands.push(setFill(COLORS.white), setStroke(COLORS.rose));
  page.commands.push(`${center + radius} ${middle} m`);
  page.commands.push(`${center + radius} ${middle + c} ${center + c} ${middle + radius} ${center} ${middle + radius} c`);
  page.commands.push(`${center - c} ${middle + radius} ${center - radius} ${middle + c} ${center - radius} ${middle} c`);
  page.commands.push(`${center - radius} ${middle - c} ${center - c} ${middle - radius} ${center} ${middle - radius} c`);
  page.commands.push(`${center + c} ${middle - radius} ${center + radius} ${middle - c} ${center + radius} ${middle} c B`);
  page.commands.push(setStroke(COLORS.rose), "3 w");
  page.commands.push(`${x + 4} ${middle} m`);
  page.commands.push(`${x + 11} ${middle} l`);
  page.commands.push(`${x + 16} ${y + 25} l`);
  page.commands.push(`${x + 21} ${y + 7} l`);
  page.commands.push(`${x + 26} ${middle + 1} l`);
  page.commands.push(`${x + 29} ${middle + 1} l S`);
  page.commands.push("1 w");
}

function drawSectionTitle(page: PdfPage, title: string) {
  page.commands.push(textCommand(title, PAGE.margin, page.cursorY, 13, "F2", COLORS.rose));
  page.cursorY -= 18;
}

function drawKeyValueGrid(pages: PdfPage[], page: PdfPage, rows: Array<[string, string]>) {
  let current = ensureSpace(pages, page, Math.ceil(rows.length / 2) * 40);
  const colWidth = (PAGE.width - PAGE.margin * 2 - 12) / 2;

  rows.forEach(([label, value], index) => {
    const col = index % 2;
    if (col === 0 && index > 0) current.cursorY -= 40;
    const x = PAGE.margin + col * (colWidth + 12);
    const y = current.cursorY - 28;
    current.commands.push(setFill(COLORS.softRose), setStroke(COLORS.rose), rect(x, y, colWidth, 32, "B"));
    current.commands.push(textCommand(label.toUpperCase(), x + 8, y + 19, 7, "F2", COLORS.rose));
    current.commands.push(textCommand(value, x + 8, y + 7, 9, "F2"));
  });

  current.cursorY -= Math.ceil(rows.length / 2) * 40;
  return current;
}

function drawSummaryTable(pages: PdfPage[], page: PdfPage, title: string, rows: Array<[string, string]>) {
  let current = ensureSpace(pages, page, rows.length * 22 + 34);
  drawSectionTitle(current, title);

  const tableWidth = PAGE.width - PAGE.margin * 2;
  const labelWidth = 236;
  const valueWidth = tableWidth - labelWidth;
  const rowHeight = 22;
  const x = PAGE.margin;

  rows.forEach(([label, value], index) => {
    if (current.cursorY - rowHeight < PAGE.margin) {
      current = addPage(pages);
    }

    const y = current.cursorY - rowHeight;
    current.commands.push(setFill(COLORS.blue), setStroke(COLORS.border), rect(x, y, labelWidth, rowHeight, "B"));
    current.commands.push(setFill(COLORS.white), setStroke(COLORS.border), rect(x + labelWidth, y, valueWidth, rowHeight, "B"));
    current.commands.push(textCommand(label, x + 7, y + 7, 10, "F2"));

    const valueLines = wrapText(value, 42).slice(0, 2);
    if (valueLines.length === 1) {
      current.commands.push(rightTextCommand(valueLines[0], x + tableWidth - 8, y + 7, 10, index <= 6 ? "F2" : "F1"));
    } else {
      current.commands.push(textCommand(valueLines[0], x + labelWidth + 8, y + 11, 8, "F1"));
      current.commands.push(textCommand(valueLines[1], x + labelWidth + 8, y + 3, 8, "F1"));
    }
    current.cursorY -= rowHeight;
  });

  current.cursorY -= 18;
  return current;
}

function drawParagraph(pages: PdfPage[], page: PdfPage, title: string, body: string | null | undefined) {
  let current = ensureSpace(pages, page, 54);
  drawSectionTitle(current, title);
  for (const line of wrapText(body, 92)) {
    if (current.cursorY - 14 < PAGE.margin) current = addPage(pages);
    current.commands.push(textCommand(line, PAGE.margin, current.cursorY, 9, "F1", COLORS.dark));
    current.cursorY -= 13;
  }
  current.cursorY -= 10;
  return current;
}

function drawObjectiveProgress(pages: PdfPage[], page: PdfPage, campaign: CampaignDetailRecord, progress: CampaignDashboardRecord | undefined, totals: { comments: number; likes: number; shares: number; views: number }) {
  const objective = parseCampaignObjective(campaign.objective);
  const actualInteractions = (progress?.likeCount ?? totals.likes) + (progress?.commentCount ?? totals.comments) + (progress?.shareCount ?? totals.shares);
  const targetInteractions = getTargetInteractions(objective);
  const rows: Array<[string, string]> = [
    ["Konten", `${formatNumber(progress?.contentCount ?? campaign.contentsByKol.flatMap((group) => group.contents).length)} / ${formatNumber(campaign.targetContentCount)}`],
    ["Views", `${formatNumber(progress?.viewCount ?? totals.views)} / ${objective.targetViews ? formatNumber(objective.targetViews) : "-"}`],
    ["Likes", `${formatNumber(progress?.likeCount ?? totals.likes)} / ${objective.targetLikes ? formatNumber(objective.targetLikes) : "-"}`],
    ["Comments", `${formatNumber(progress?.commentCount ?? totals.comments)} / ${objective.targetComments ? formatNumber(objective.targetComments) : "-"}`],
    ["Shares", `${formatNumber(progress?.shareCount ?? totals.shares)} / ${objective.targetShares ? formatNumber(objective.targetShares) : "-"}`],
    ["Interaksi", `${formatNumber(actualInteractions)} / ${targetInteractions ? formatNumber(targetInteractions) : "-"}`],
  ];

  return drawSummaryTable(pages, page, "Progress Objective", rows);
}

function getDescriptionText(campaign: CampaignDetailRecord) {
  const candidates = [campaign.description, campaign.postBriefs, parseCampaignObjective(campaign.objective).legacyText]
    .map((value) => cleanPdfText(value))
    .filter((value) => value && value !== "-");
  return candidates[0] ?? "";
}

function drawTable<T>(pages: PdfPage[], page: PdfPage, title: string, columns: TableColumn<T>[], rows: T[], emptyText: string) {
  let current = ensureSpace(pages, page, 64);
  drawSectionTitle(current, title);

  const x = PAGE.margin;
  const rowHeight = 24;
  const maxTableWidth = PAGE.width - PAGE.margin * 2;
  const rawTableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const scale = rawTableWidth > maxTableWidth ? maxTableWidth / rawTableWidth : 1;
  const fittedColumns = columns.map((column) => ({ ...column, width: Math.floor(column.width * scale) }));
  const tableWidth = fittedColumns.reduce((sum, column) => sum + column.width, 0);

  function drawHeaderRow(target: PdfPage) {
    const y = target.cursorY - rowHeight;
    let cursorX = x;
    fittedColumns.forEach((column) => {
      target.commands.push(setFill(COLORS.rose), setStroke(COLORS.border), rect(cursorX, y, column.width, rowHeight, "B"));
      target.commands.push(textCommand(wrapText(column.header, Math.max(8, Math.floor(column.width / 5)))[0], cursorX + 4, y + 8, 7, "F2", COLORS.white));
      cursorX += column.width;
    });
    target.cursorY -= rowHeight;
  }

  drawHeaderRow(current);

  if (!rows.length) {
    const y = current.cursorY - rowHeight;
    current.commands.push(setFill(COLORS.white), setStroke(COLORS.border), rect(x, y, tableWidth, rowHeight, "B"));
    current.commands.push(textCommand(emptyText, x + 8, y + 8, 9, "F1", COLORS.muted));
    current.cursorY -= rowHeight + 18;
    return current;
  }

  rows.forEach((row, rowIndex) => {
    if (current.cursorY - rowHeight < PAGE.margin) {
      current = addPage(pages);
      drawHeaderRow(current);
    }

    const y = current.cursorY - rowHeight;
    let cursorX = x;
    fittedColumns.forEach((column) => {
      const rawValue = column.render(row);
      const value = cleanPdfText(rawValue);
      current.commands.push(setFill(rowIndex % 2 === 0 ? COLORS.white : COLORS.lightBlue), setStroke(COLORS.border), rect(cursorX, y, column.width, rowHeight, "B"));
      if (column.align === "right") {
        current.commands.push(rightTextCommand(value, cursorX + column.width - 4, y + 8, 7));
      } else {
        current.commands.push(textCommand(wrapText(value, Math.max(8, Math.floor(column.width / 5)))[0], cursorX + 4, y + 8, 7));
      }
      cursorX += column.width;
    });
    current.cursorY -= rowHeight;
  });

  current.cursorY -= 18;
  return current;
}

function buildReportPages(campaign: CampaignDetailRecord, progress?: CampaignDashboardRecord, kolCatalog: KolRecord[] = []) {
  const pages = [createPage()];
  let page = pages[0]!;
  const contents = campaign.contentsByKol.flatMap((group) => group.contents);
  const kolSummaries = campaign.contentsByKol.map((group) => {
    const views = group.contents.reduce((sum, content) => sum + content.viewCount, 0);
    const likes = group.contents.reduce((sum, content) => sum + content.likeCount, 0);
    const comments = group.contents.reduce((sum, content) => sum + content.commentCount, 0);
    const shares = group.contents.reduce((sum, content) => sum + content.shareCount, 0);
    const fypCount = group.contents.filter((content) => content.isFyp).length;
    const catalogKol = kolCatalog.find((kol) => kol.id === group.kolId);
    return {
      comments,
      contentCount: group.contents.length,
      fypCount,
      handles: group.handles.join(" / ") || "-",
      likes,
      name: group.displayName,
      shares,
      tier: catalogKol?.followerTier ?? "unknown",
      views,
    };
  });
  const topKols = [...kolSummaries]
    .sort((left, right) => right.views - left.views || right.contentCount - left.contentCount)
    .slice(0, 3)
    .map((kol) => kol.name)
    .join(", ") || "-";
  const tierTargets = parseTargetKolTiers(campaign.targetFollowerTier);
  const tierCounts = new Map(tierTargets.map((tier) => [tier.key, 0]));

  campaign.kols.forEach((campaignKol) => {
    const tier = kolCatalog.find((kol) => kol.id === campaignKol.id)?.followerTier;
    if (tier) {
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
    }
  });

  const totals = contents.reduce(
    (accumulator, content) => ({
      comments: accumulator.comments + content.commentCount,
      failed: accumulator.failed + (content.syncStatus === "failed" ? 1 : 0),
      fyp: accumulator.fyp + (content.isFyp ? 1 : 0),
      likes: accumulator.likes + content.likeCount,
      pending: accumulator.pending + (content.syncStatus === "pending" ? 1 : 0),
      post: accumulator.post + (content.contentType === "post" ? 1 : 0),
      reel: accumulator.reel + (content.contentType === "reel" ? 1 : 0),
      shares: accumulator.shares + content.shareCount,
      story: accumulator.story + (content.contentType === "story" ? 1 : 0),
      success: accumulator.success + (content.syncStatus === "success" ? 1 : 0),
      views: accumulator.views + content.viewCount,
    }),
    { comments: 0, failed: 0, fyp: 0, likes: 0, pending: 0, post: 0, reel: 0, shares: 0, story: 0, success: 0, views: 0 },
  );
  const totalBudgetUsed = progress?.budgetUsedIdr ?? contents.reduce((sum, content) => sum + (content.budgetIdr ?? 0), 0);
  const uniqueHandleCount = new Set(campaign.contentsByKol.flatMap((group) => group.handles)).size;
  const summaryRows: Array<[string, string]> = [
    ...tierTargets.map((tier) => [`KOL ${tier.label}`, `${formatNumber(tierCounts.get(tier.key))} / ${formatNumber(tier.target)}`] as [string, string]),
    ["Total KOL", `${formatNumber(campaign.kols.length)} / ${formatNumber(campaign.targetKolCount)}`],
    ["Total Video", `${formatNumber(progress?.contentCount ?? contents.length)} / ${formatNumber(campaign.targetContentCount)}`],
    ["Total Post", `${formatNumber(progress?.postCount ?? totals.post)} / ${formatNumber(campaign.targetPostCount)}`],
    ["Total Reels", `${formatNumber(progress?.reelCount ?? totals.reel)} / ${formatNumber(campaign.targetReelCount)}`],
    ["Total Story", `${formatNumber(progress?.storyCount ?? totals.story)} / ${formatNumber(campaign.targetStoryCount)}`],
    ["Total Published", formatNumber(progress?.syncedContentCount ?? totals.success)],
    ["Total Masih Drafting", formatNumber(progress?.pendingSyncCount ?? totals.pending)],
    ["Yang masih belum acc", formatNumber(progress?.failedSyncCount ?? totals.failed)],
    ["TOP KOL", topKols],
    ["Total Views", formatNumber(progress?.viewCount ?? totals.views)],
    ["Total Likes", formatNumber(progress?.likeCount ?? totals.likes)],
    ["Total Comments", formatNumber(progress?.commentCount ?? totals.comments)],
    ["Total Shares", formatNumber(progress?.shareCount ?? totals.shares)],
    ["Unique KOL", formatNumber(uniqueHandleCount || campaign.kols.length)],
    ["Jumlah FYP", formatNumber(totals.fyp)],
    ["Budget", `${formatCurrency(totalBudgetUsed)} / ${formatCurrency(campaign.budgetIdr)}`],
  ];

  drawHeader(page, campaign);
  page = drawKeyValueGrid(pages, page, [
    ["Brand", campaign.brand],
    ["Status", getStatusLabel(campaign.status)],
    ["Periode", `${formatDate(campaign.periodStart)} - ${formatDate(campaign.periodEnd)}`],
    ["Keyword", campaign.keywords || "-"],
  ]);
  page = drawSummaryTable(pages, page, `Summary KOL ${campaign.brand}`, summaryRows);
  page = drawObjectiveProgress(pages, page, campaign, progress, totals);
  const descriptionText = getDescriptionText(campaign);
  if (descriptionText) {
    page = drawParagraph(pages, page, "Deskripsi", descriptionText);
  }
  page = drawTable(
    pages,
    page,
    "Ringkasan Per KOL",
    [
      { header: "KOL", render: (row) => row.name, width: 110 },
      { header: "Handle", render: (row) => row.handles, width: 92 },
      { align: "right", header: "Konten", render: (row) => row.contentCount, width: 42 },
      { align: "right", header: "Views", render: (row) => formatNumber(row.views), width: 62 },
      { align: "right", header: "Likes", render: (row) => formatNumber(row.likes), width: 52 },
      { align: "right", header: "Comments", render: (row) => formatNumber(row.comments), width: 62 },
      { align: "right", header: "Shares", render: (row) => formatNumber(row.shares), width: 52 },
      { align: "right", header: "FYP", render: (row) => row.fypCount, width: 34 },
    ],
    kolSummaries,
    "Belum ada KOL yang terhubung.",
  );
  page = drawTable(
    pages,
    page,
    "Rincian Konten",
    [
      { header: "KOL", render: (row) => row.kolDisplayName || row.authorDisplayName || "-", width: 82 },
      { header: "Platform", render: (row) => row.platform, width: 50 },
      { header: "Tipe", render: (row) => row.contentType, width: 38 },
      { header: "Status", render: (row) => getStatusLabel(row.syncStatus), width: 52 },
      { align: "right", header: "Views", render: (row) => formatNumber(row.viewCount), width: 58 },
      { align: "right", header: "Likes", render: (row) => formatNumber(row.likeCount), width: 50 },
      { align: "right", header: "Comments", render: (row) => formatNumber(row.commentCount), width: 60 },
      { align: "right", header: "FYP", render: (row) => (row.isFyp ? "Ya" : "Tidak"), width: 34 },
      { align: "right", header: "Budget", render: (row) => formatCurrency(row.budgetIdr), width: 72 },
    ],
    contents,
    "Belum ada konten campaign.",
  );

  return pages;
}

function buildPdfBytes(pages: PdfPage[]) {
  const pageStreams = pages.map((page) => page.commands.join("\n"));
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageStreams.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`,
  ];

  pageStreams.forEach((commands, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectId} 0 R >>`);
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

export function downloadCampaignReportPdf(campaign: CampaignDetailRecord, progress?: CampaignDashboardRecord, kolCatalog: KolRecord[] = []) {
  const blob = buildPdfBytes(buildReportPages(campaign, progress, kolCatalog));
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
