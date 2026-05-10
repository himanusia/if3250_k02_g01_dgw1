import PDFDocument from "pdfkit";

import type { CampaignDetailRecord } from "./campaign-content";
import { getCampaignDetail } from "./campaign-content";

type PdfDocument = InstanceType<typeof PDFDocument>;

type ReportContentItem = {
  authorLabel: string;
  captionExcerpt: string;
  commentCount: number;
  contentUrl: string;
  engagementRate: string;
  likeCount: number;
  platform: string;
  postedAt: string;
  shareCount: number;
  syncStatus: string;
  syncedAt: string;
  viewCount: number;
};

type ReportKolGroup = {
  contentCount: number;
  contents: ReportContentItem[];
  displayName: string;
  handles: string[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  totalViews: number;
};

type CampaignReportData = {
  campaign: CampaignDetailRecord;
  generatedAt: string;
  groups: ReportKolGroup[];
  summary: {
    failedCount: number;
    pendingCount: number;
    successCount: number;
    totalComments: number;
    totalContents: number;
    totalKols: number;
    totalLikes: number;
    totalShares: number;
    totalViews: number;
  };
};

type TableColumn = {
  align?: "left" | "center" | "right";
  header: string;
  key: string;
  width: number;
};

type KeyValueRow = {
  label: string;
  value: string;
};

const REPORT_FONTS = {
  body: "Times-Roman",
  bodyBold: "Times-Bold",
  heading: "Times-Bold",
  italic: "Times-Italic",
} as const;

const PDF_COLORS = {
  background: "#FFFFFF",
  border: "#333333",
  borderSoft: "#A6A6A6",
  fill: "#F2F2F2",
  muted: "#444444",
  text: "#111111",
} as const;

const PDF_LAYOUT = {
  gap: 6,
  lineGap: 2,
  margin: 42,
  sectionGap: 8,
  smallGap: 4,
  tablePaddingX: 6,
  tablePaddingY: 4,
} as const;

function cleanPdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textOrFallback(value: string | null | undefined, fallback = "-") {
  const cleaned = value ? cleanPdfText(value) : "";

  return cleaned || fallback;
}

function formatNumber(value: number) {
  return value.toLocaleString("id-ID");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function streamPdfDocument(doc: PdfDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer | Uint8Array | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", (error) => {
      reject(error);
    });
  });
}

function buildReportData(campaign: CampaignDetailRecord): CampaignReportData {
  const groups = campaign.contentsByKol.map((group) => {
    const contents = group.contents.map((content) => {
      const captionSource = cleanPdfText(content.caption || content.title || "");

      return {
        authorLabel: textOrFallback(content.authorDisplayName || content.authorHandle),
        captionExcerpt: captionSource ? truncateText(captionSource, 220) : "-",
        commentCount: content.commentCount,
        contentUrl: textOrFallback(content.contentUrl),
        engagementRate: textOrFallback(content.engagementRate),
        likeCount: content.likeCount,
        platform: cleanPdfText(content.platform.toUpperCase()),
        postedAt: formatDateTime(content.postedAt),
        shareCount: content.shareCount,
        syncStatus: cleanPdfText(content.syncStatus).toUpperCase(),
        syncedAt: formatDateTime(content.syncedAt),
        viewCount: content.viewCount,
      } satisfies ReportContentItem;
    });

    const totals = contents.reduce(
      (accumulator, content) => {
        accumulator.commentCount += content.commentCount;
        accumulator.failedCount += content.syncStatus === "FAILED" ? 1 : 0;
        accumulator.likeCount += content.likeCount;
        accumulator.pendingCount += content.syncStatus === "PENDING" ? 1 : 0;
        accumulator.shareCount += content.shareCount;
        accumulator.successCount += content.syncStatus === "SUCCESS" ? 1 : 0;
        accumulator.totalViews += content.viewCount;

        return accumulator;
      },
      {
        commentCount: 0,
        failedCount: 0,
        likeCount: 0,
        pendingCount: 0,
        shareCount: 0,
        successCount: 0,
        totalViews: 0,
      },
    );

    return {
      contentCount: contents.length,
      contents,
      displayName: cleanPdfText(group.displayName),
      handles: group.handles.map((handle) => cleanPdfText(handle)),
      likeCount: totals.likeCount,
      commentCount: totals.commentCount,
      shareCount: totals.shareCount,
      successCount: totals.successCount,
      failedCount: totals.failedCount,
      pendingCount: totals.pendingCount,
      totalViews: totals.totalViews,
    } satisfies ReportKolGroup;
  });

  const summary = groups.reduce(
    (accumulator, group) => {
      accumulator.failedCount += group.failedCount;
      accumulator.pendingCount += group.pendingCount;
      accumulator.successCount += group.successCount;
      accumulator.totalComments += group.commentCount;
      accumulator.totalContents += group.contentCount;
      accumulator.totalKols += 1;
      accumulator.totalLikes += group.likeCount;
      accumulator.totalShares += group.shareCount;
      accumulator.totalViews += group.totalViews;

      return accumulator;
    },
    {
      failedCount: 0,
      pendingCount: 0,
      successCount: 0,
      totalComments: 0,
      totalContents: 0,
      totalKols: 0,
      totalLikes: 0,
      totalShares: 0,
      totalViews: 0,
    },
  );

  return {
    campaign,
    generatedAt: formatDateTime(new Date().toISOString()),
    groups,
    summary,
  };
}

function drawRule(doc: PdfDocument) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(PDF_COLORS.borderSoft).lineWidth(0.8).stroke();
  doc.moveDown(0.35);
}

function drawSectionTitle(doc: PdfDocument, title: string, subtitle?: string) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font(REPORT_FONTS.heading).fontSize(13).fillColor(PDF_COLORS.text).text(cleanPdfText(title), {
    width: pageWidth,
  });

  if (subtitle) {
    doc.moveDown(0.15);
    doc.font(REPORT_FONTS.body).fontSize(9).fillColor(PDF_COLORS.muted).text(cleanPdfText(subtitle), {
      width: pageWidth,
      lineGap: PDF_LAYOUT.lineGap,
    });
  }

  doc.moveDown(0.3);
  drawRule(doc);
  doc.moveDown(0.45);
}

function measureTextBlock(doc: PdfDocument, text: string, width: number, fontName: string, fontSize: number) {
  doc.font(fontName).fontSize(fontSize);

  const safeText = cleanPdfText(text);

  if (!safeText) {
    return 0;
  }

  return doc.heightOfString(safeText, {
    width,
    lineGap: PDF_LAYOUT.lineGap,
  });
}

function ensureSpace(doc: PdfDocument, requiredHeight: number) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  if (doc.y + requiredHeight > bottomLimit) {
    doc.addPage();
  }
}

function measureKeyValueTableHeight(doc: PdfDocument, rows: KeyValueRow[], labelWidth: number, valueWidth: number, labelFontSize: number, valueFontSize: number, minRowHeight: number) {
  const paddingY = PDF_LAYOUT.tablePaddingY;

  return rows.reduce((totalHeight, row) => {
    const labelHeight = measureTextBlock(doc, row.label.toUpperCase(), labelWidth - PDF_LAYOUT.tablePaddingX * 2, REPORT_FONTS.bodyBold, labelFontSize);
    const valueHeight = measureTextBlock(doc, row.value, valueWidth - PDF_LAYOUT.tablePaddingX * 2, REPORT_FONTS.body, valueFontSize);

    return totalHeight + Math.max(minRowHeight, Math.max(labelHeight, valueHeight) + paddingY * 2);
  }, 0);
}

function drawKeyValueTable(doc: PdfDocument, rows: KeyValueRow[], options?: {
  labelFontSize?: number;
  labelWidth?: number;
  minRowHeight?: number;
  valueFontSize?: number;
}) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;
  const labelWidth = options?.labelWidth ?? Math.round(pageWidth * 0.3);
  const valueWidth = pageWidth - labelWidth;
  const labelFontSize = options?.labelFontSize ?? 8;
  const valueFontSize = options?.valueFontSize ?? 9;
  const minRowHeight = options?.minRowHeight ?? 22;
  let currentY = doc.y;

  for (const row of rows) {
    const labelText = cleanPdfText(row.label).toUpperCase();
    const valueText = textOrFallback(row.value);
    const labelHeight = measureTextBlock(doc, labelText, labelWidth - PDF_LAYOUT.tablePaddingX * 2, REPORT_FONTS.bodyBold, labelFontSize);
    const valueHeight = measureTextBlock(doc, valueText, valueWidth - PDF_LAYOUT.tablePaddingX * 2, REPORT_FONTS.body, valueFontSize);
    const rowHeight = Math.max(minRowHeight, Math.max(labelHeight, valueHeight) + PDF_LAYOUT.tablePaddingY * 2);
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    if (currentY + rowHeight > bottomLimit) {
      doc.addPage();
      currentY = doc.y;
    }

    doc.save();
    doc.lineWidth(0.8).strokeColor(PDF_COLORS.borderSoft);
    doc.rect(startX, currentY, labelWidth, rowHeight).fillAndStroke(PDF_COLORS.fill, PDF_COLORS.borderSoft);
    doc.rect(startX + labelWidth, currentY, valueWidth, rowHeight).fillAndStroke(PDF_COLORS.background, PDF_COLORS.borderSoft);
    doc.restore();

    doc.font(REPORT_FONTS.bodyBold).fontSize(labelFontSize).fillColor(PDF_COLORS.text).text(labelText, startX + PDF_LAYOUT.tablePaddingX, currentY + PDF_LAYOUT.tablePaddingY, {
      width: labelWidth - PDF_LAYOUT.tablePaddingX * 2,
      lineGap: PDF_LAYOUT.lineGap,
    });
    doc.font(REPORT_FONTS.body).fontSize(valueFontSize).fillColor(PDF_COLORS.text).text(valueText, startX + labelWidth + PDF_LAYOUT.tablePaddingX, currentY + PDF_LAYOUT.tablePaddingY, {
      width: valueWidth - PDF_LAYOUT.tablePaddingX * 2,
      lineGap: PDF_LAYOUT.lineGap,
    });

    currentY += rowHeight;
  }

  doc.y = currentY;
}

function drawTable(doc: PdfDocument, columns: TableColumn[], rows: Array<Record<string, string>>, options?: {
  fontSize?: number;
  headerFontSize?: number;
  minRowHeight?: number;
  zebra?: boolean;
}) {
  const startX = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const scale = totalWidth > pageWidth ? pageWidth / totalWidth : 1;
  const scaledColumns = columns.map((column, index) => ({
    ...column,
    width: index === columns.length - 1 ? pageWidth - columns.slice(0, -1).reduce((sum, item) => sum + item.width * scale, 0) : column.width * scale,
  }));
  const fontSize = options?.fontSize ?? 8;
  const headerFontSize = options?.headerFontSize ?? 8;
  const minRowHeight = options?.minRowHeight ?? 20;
  const zebra = options?.zebra ?? true;
  let currentY = doc.y;

  const firstRowHeight = rows.length
    ? Math.max(
      minRowHeight,
      Math.max(
        ...scaledColumns.map((column) => {
          const value = textOrFallback(rows[0]?.[column.key]);
          return measureTextBlock(doc, value, column.width - PDF_LAYOUT.tablePaddingX * 2, REPORT_FONTS.body, fontSize);
        }),
      ) + PDF_LAYOUT.tablePaddingY * 2,
    )
    : 0;
  const headerHeight = 20;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  if (rows.length > 0 && currentY + headerHeight + firstRowHeight > bottomLimit) {
    doc.addPage();
    currentY = doc.y;
  }

  const drawHeader = () => {
    let currentX = startX;

    for (const column of scaledColumns) {
      doc.save();
      doc.lineWidth(0.8).strokeColor(PDF_COLORS.borderSoft);
      doc.rect(currentX, currentY, column.width, headerHeight).fillAndStroke(PDF_COLORS.fill, PDF_COLORS.borderSoft);
      doc.restore();

      doc.font(REPORT_FONTS.bodyBold).fontSize(headerFontSize).fillColor(PDF_COLORS.text).text(column.header, currentX + PDF_LAYOUT.tablePaddingX, currentY + PDF_LAYOUT.tablePaddingY, {
        align: column.align ?? "left",
        width: column.width - PDF_LAYOUT.tablePaddingX * 2,
        lineGap: PDF_LAYOUT.lineGap,
      });

      currentX += column.width;
    }

    currentY += headerHeight;
  };

  drawHeader();

  for (const [rowIndex, row] of rows.entries()) {
    const cellHeights = scaledColumns.map((column) => {
      const value = textOrFallback(row[column.key]);
      return measureTextBlock(doc, value, column.width - PDF_LAYOUT.tablePaddingX * 2, REPORT_FONTS.body, fontSize);
    });
    const rowHeight = Math.max(minRowHeight, Math.max(...cellHeights) + PDF_LAYOUT.tablePaddingY * 2);
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    if (currentY + rowHeight > bottomLimit) {
      doc.addPage();
      currentY = doc.y;
      drawHeader();
    }

    let currentX = startX;
    for (const column of scaledColumns) {
      const value = textOrFallback(row[column.key]);
      const fillColor = zebra && rowIndex % 2 === 1 ? "#F8F8F8" : PDF_COLORS.background;

      doc.save();
      doc.lineWidth(0.8).strokeColor(PDF_COLORS.borderSoft);
      doc.rect(currentX, currentY, column.width, rowHeight).fillAndStroke(fillColor, PDF_COLORS.borderSoft);
      doc.restore();

      doc.font(REPORT_FONTS.body).fontSize(fontSize).fillColor(PDF_COLORS.text).text(value, currentX + PDF_LAYOUT.tablePaddingX, currentY + PDF_LAYOUT.tablePaddingY, {
        align: column.align ?? "left",
        width: column.width - PDF_LAYOUT.tablePaddingX * 2,
        lineGap: PDF_LAYOUT.lineGap,
      });

      currentX += column.width;
    }

    currentY += rowHeight;
  }

  doc.y = currentY;
}

function buildContentDetailRows(content: ReportContentItem): KeyValueRow[] {
  return [
    { label: "Platform", value: content.platform },
    { label: "Link", value: content.contentUrl },
    { label: "Posted at", value: content.postedAt },
    { label: "Synced at", value: content.syncedAt },
    { label: "Author", value: content.authorLabel },
    { label: "Engagement rate", value: content.engagementRate },
    { label: "Views", value: formatNumber(content.viewCount) },
    { label: "Likes", value: formatNumber(content.likeCount) },
    { label: "Comments", value: formatNumber(content.commentCount) },
    { label: "Shares", value: formatNumber(content.shareCount) },
    { label: "Caption", value: content.captionExcerpt },
  ];
}

function renderHeader(doc: PdfDocument, campaign: CampaignDetailRecord, generatedAt: string) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font(REPORT_FONTS.heading).fontSize(22).fillColor(PDF_COLORS.text).text("Laporan Campaign", {
    align: "center",
    width: pageWidth,
  });
  doc.moveDown(0.1);
  doc.font(REPORT_FONTS.bodyBold).fontSize(14).fillColor(PDF_COLORS.text).text(cleanPdfText(campaign.name), {
    align: "center",
    width: pageWidth,
  });
  doc.moveDown(0.1);
  doc.font(REPORT_FONTS.body).fontSize(9.5).fillColor(PDF_COLORS.muted).text(
    cleanPdfText(`${campaign.brand} | ${campaign.status} | Dibuat ${generatedAt}`),
    {
      align: "center",
      width: pageWidth,
    },
  );

  doc.moveDown(0.45);
  drawRule(doc);
  doc.moveDown(0.35);
}

function renderCampaignInfo(doc: PdfDocument, campaign: CampaignDetailRecord) {
  drawSectionTitle(doc, "I. INFORMASI CAMPAIGN", "Ringkasan metadata campaign yang menjadi dasar laporan.");

  drawKeyValueTable(doc, [
    { label: "Brand", value: textOrFallback(campaign.brand) },
    { label: "Nama Campaign", value: textOrFallback(campaign.name) },
    { label: "Periode", value: cleanPdfText(`${campaign.periodStart} - ${campaign.periodEnd}`) },
    { label: "Status", value: textOrFallback(campaign.status) },
    { label: "Target KOL", value: formatNumber(campaign.targetKolCount) },
    { label: "Follower Tier", value: textOrFallback(campaign.targetFollowerTier) },
    { label: "Keywords", value: textOrFallback(campaign.keywords) },
    { label: "Objective", value: textOrFallback(campaign.objective) },
    { label: "Brief Campaign", value: textOrFallback(campaign.postBriefs, "-") },
    { label: "Created at", value: formatDateTime(campaign.createdAt) },
    { label: "Updated at", value: formatDateTime(campaign.updatedAt) },
  ], {
    labelFontSize: 8,
    labelWidth: 150,
    minRowHeight: 24,
    valueFontSize: 9,
  });

  doc.moveDown(0.25);
}

function renderExecutiveSummary(doc: PdfDocument, data: CampaignReportData) {
  drawSectionTitle(doc, "II. RINGKASAN EKSEKUTIF", "Ikhtisar angka utama campaign dan KOL dengan performa tertinggi.");

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const topByViews = data.groups.reduce<ReportKolGroup | null>((best, group) => {
    if (!best || group.totalViews > best.totalViews) {
      return group;
    }

    return best;
  }, null);
  const topByLikes = data.groups.reduce<ReportKolGroup | null>((best, group) => {
    if (!best || group.likeCount > best.likeCount) {
      return group;
    }

    return best;
  }, null);
  const topByContents = data.groups.reduce<ReportKolGroup | null>((best, group) => {
    if (!best || group.contentCount > best.contentCount) {
      return group;
    }

    return best;
  }, null);
  const uniqueHandleCount = new Set(data.groups.flatMap((group) => group.handles)).size;

  const summaryParagraph = cleanPdfText(
    `Campaign ini melibatkan ${formatNumber(data.summary.totalKols)} KOL dengan ${formatNumber(data.summary.totalContents)} konten. Total keseluruhan mencapai ${formatNumber(data.summary.totalViews)} views, ${formatNumber(data.summary.totalLikes)} likes, ${formatNumber(data.summary.totalComments)} comments, dan ${formatNumber(data.summary.totalShares)} shares.`,
  );

  doc.font(REPORT_FONTS.body).fontSize(10).fillColor(PDF_COLORS.text).text(summaryParagraph, {
    align: "justify",
    lineGap: PDF_LAYOUT.lineGap,
    width: pageWidth,
  });
  doc.moveDown(0.45);

  drawKeyValueTable(doc, [
    { label: "Total KOL", value: formatNumber(data.summary.totalKols) },
    { label: "Total Konten", value: formatNumber(data.summary.totalContents) },
    { label: "Total Views", value: formatNumber(data.summary.totalViews) },
    { label: "Total Likes", value: formatNumber(data.summary.totalLikes) },
    { label: "Total Comments", value: formatNumber(data.summary.totalComments) },
    { label: "Total Shares", value: formatNumber(data.summary.totalShares) },
    { label: "Handle Unik", value: formatNumber(uniqueHandleCount) },
    { label: "KOL Views Tertinggi", value: topByViews ? `${topByViews.displayName} (${formatNumber(topByViews.totalViews)})` : "-" },
    { label: "KOL Likes Tertinggi", value: topByLikes ? `${topByLikes.displayName} (${formatNumber(topByLikes.likeCount)})` : "-" },
    { label: "KOL Konten Terbanyak", value: topByContents ? `${topByContents.displayName} (${formatNumber(topByContents.contentCount)})` : "-" },
  ], {
    labelFontSize: 8,
    labelWidth: 175,
    minRowHeight: 24,
    valueFontSize: 9,
  });

  doc.moveDown(0.25);
}

function renderKolSummaryTable(doc: PdfDocument, groups: ReportKolGroup[]) {
  drawSectionTitle(doc, "III. RINGKASAN PER KOL", "Total keseluruhan tiap KOL berdasarkan seluruh konten yang tersimpan.");

  if (!groups.length) {
    doc.font(REPORT_FONTS.body).fontSize(10).fillColor(PDF_COLORS.muted).text("Belum ada KOL yang terhubung ke campaign ini.", {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
    doc.moveDown(0.25);
    return;
  }

  const columns: TableColumn[] = [
    { header: "KOL", key: "kol", width: 100 },
    { header: "Handle", key: "handle", width: 145 },
    { header: "Konten", key: "contentCount", width: 45, align: "right" },
    { header: "Views", key: "views", width: 60, align: "right" },
    { header: "Likes", key: "likes", width: 60, align: "right" },
    { header: "Comments", key: "comments", width: 61, align: "right" },
    { header: "Shares", key: "shares", width: 40, align: "right" },
  ];

  const rows = groups.map((group) => ({
    comments: formatNumber(group.commentCount),
    contentCount: formatNumber(group.contentCount),
    handle: group.handles.length ? group.handles.join(" / ") : "-",
    kol: group.displayName,
    likes: formatNumber(group.likeCount),
    shares: formatNumber(group.shareCount),
    views: formatNumber(group.totalViews),
  }));

  drawTable(doc, columns, rows, {
    fontSize: 8,
    headerFontSize: 8,
    minRowHeight: 22,
    zebra: true,
  });

  doc.moveDown(0.2);
  doc.moveDown(0.15);
}

function estimateContentCardHeight(doc: PdfDocument, content: ReportContentItem, innerWidth: number) {
  const headerHeight = measureTextBlock(doc, content.platform, innerWidth, REPORT_FONTS.bodyBold, 10);
  const urlHeight = measureTextBlock(doc, content.contentUrl, innerWidth, REPORT_FONTS.body, 8.5);
  const tableHeight = measureKeyValueTableHeight(doc, buildContentDetailRows(content), 118, innerWidth - 118, 8, 9, 20);

  return headerHeight + urlHeight + tableHeight + 24;
}

function renderContentCard(doc: PdfDocument, content: ReportContentItem) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font(REPORT_FONTS.bodyBold).fontSize(10).fillColor(PDF_COLORS.text).text(cleanPdfText(content.platform), {
    width: pageWidth,
  });
  doc.moveDown(0.05);
  doc.font(REPORT_FONTS.body).fontSize(8.5).fillColor(PDF_COLORS.muted).text(content.contentUrl, {
    width: pageWidth,
    lineGap: PDF_LAYOUT.lineGap,
  });
  doc.moveDown(0.15);

  drawKeyValueTable(doc, buildContentDetailRows(content), {
    labelFontSize: 8,
    labelWidth: 118,
    minRowHeight: 20,
    valueFontSize: 9,
  });

  doc.moveDown(0.15);
}

function renderKolGroup(doc: PdfDocument, group: ReportKolGroup) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  ensureSpace(doc, 96);

  doc.font(REPORT_FONTS.bodyBold).fontSize(12).fillColor(PDF_COLORS.text).text(group.displayName, {
    width: pageWidth,
  });
  doc.font(REPORT_FONTS.body).fontSize(9).fillColor(PDF_COLORS.muted).text(group.handles.length ? group.handles.join(" / ") : "Tidak ada handle yang tersimpan.", {
    width: pageWidth,
  });
  doc.font(REPORT_FONTS.body).fontSize(9).fillColor(PDF_COLORS.text).text(
    cleanPdfText(`Total konten ${formatNumber(group.contentCount)} | Total views ${formatNumber(group.totalViews)} | Likes ${formatNumber(group.likeCount)} | Comments ${formatNumber(group.commentCount)} | Shares ${formatNumber(group.shareCount)} | Sync ${group.successCount}/${group.failedCount}/${group.pendingCount}`),
    {
      width: pageWidth,
    },
  );

  doc.moveDown(0.2);
  drawRule(doc);

  if (!group.contents.length) {
    doc.font(REPORT_FONTS.body).fontSize(9.5).fillColor(PDF_COLORS.muted).text("Belum ada konten yang di-scrap untuk KOL ini.", {
      width: pageWidth,
    });
    doc.moveDown(0.25);
    return;
  }

  for (let index = 0; index < group.contents.length; index += 1) {
    const content = group.contents[index];

    if (!content) {
      continue;
    }

    const estimatedHeight = estimateContentCardHeight(doc, content, pageWidth);
    ensureSpace(doc, estimatedHeight + 10);
    renderContentCard(doc, content);

    if (index < group.contents.length - 1) {
      drawRule(doc);
    }
  }

  doc.moveDown(0.1);
}

export async function generateCampaignReportPdf(campaignId: number) {
  const campaign = await getCampaignDetail(campaignId);

  if (!campaign) {
    return null;
  }

  const report = buildReportData(campaign);
  const fileName = `campaign-${campaign.id}-report.pdf`;
  const doc = new PDFDocument({
    bufferPages: true,
    info: {
      Author: "DigiWonder",
      Subject: `Laporan campaign ${campaign.name}`,
      Title: `Laporan Campaign - ${campaign.name}`,
    },
    margin: PDF_LAYOUT.margin,
    size: "A4",
  });

  const pdfPromise = streamPdfDocument(doc);

  renderHeader(doc, report.campaign, report.generatedAt);
  renderCampaignInfo(doc, report.campaign);

  doc.addPage();
  renderExecutiveSummary(doc, report);

  doc.addPage();
  renderKolSummaryTable(doc, report.groups);

  if (report.groups.length > 0) {
    doc.addPage();
  }

  drawSectionTitle(doc, "IV. RINCIAN PER KOL", "Setiap KOL ditampilkan bersama rincian konten yang sudah di-scrap.");

  if (!report.groups.length) {
    doc.font(REPORT_FONTS.body).fontSize(10).fillColor(PDF_COLORS.muted).text("Belum ada konten yang di-scrap untuk campaign ini.", {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  } else {
    for (const group of report.groups) {
      renderKolGroup(doc, group);
      doc.moveDown(0.35);
    }
  }

  doc.end();

  const buffer = await pdfPromise;

  return {
    buffer,
    fileName,
  };
}