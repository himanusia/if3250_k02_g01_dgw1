export type CampaignObjectiveTargets = {
  targetComments: number;
  targetLikes: number;
  targetShares: number;
  targetViews: number;
};

export type CampaignObjective = CampaignObjectiveTargets & {
  legacyText: string;
};

export const EMPTY_CAMPAIGN_OBJECTIVE: CampaignObjective = {
  legacyText: "",
  targetComments: 0,
  targetLikes: 0,
  targetShares: 0,
  targetViews: 0,
};

const OBJECTIVE_VERSION = 1;

type StoredCampaignObjective = CampaignObjectiveTargets & {
  kind: "campaign_objective";
  note?: string;
  version: typeof OBJECTIVE_VERSION;
};

function toNonNegativeInteger(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Math.round(numeric);
}

export function getTargetInteractions(objective: Pick<CampaignObjective, "targetComments" | "targetLikes" | "targetShares">) {
  return objective.targetLikes + objective.targetComments + objective.targetShares;
}

export function encodeCampaignObjective(objective: CampaignObjective) {
  const stored: StoredCampaignObjective = {
    kind: "campaign_objective",
    note: objective.legacyText.trim() || undefined,
    targetComments: toNonNegativeInteger(objective.targetComments),
    targetLikes: toNonNegativeInteger(objective.targetLikes),
    targetShares: toNonNegativeInteger(objective.targetShares),
    targetViews: toNonNegativeInteger(objective.targetViews),
    version: OBJECTIVE_VERSION,
  };

  return JSON.stringify(stored);
}

export function parseCampaignObjective(rawObjective: string | null | undefined): CampaignObjective {
  if (!rawObjective) {
    return { ...EMPTY_CAMPAIGN_OBJECTIVE };
  }

  try {
    const parsed = JSON.parse(rawObjective) as Partial<StoredCampaignObjective> | null;

    if (parsed?.kind === "campaign_objective") {
      return {
        legacyText: typeof parsed.note === "string" ? parsed.note : "",
        targetComments: toNonNegativeInteger(parsed.targetComments),
        targetLikes: toNonNegativeInteger(parsed.targetLikes),
        targetShares: toNonNegativeInteger(parsed.targetShares),
        targetViews: toNonNegativeInteger(parsed.targetViews),
      };
    }
  } catch {
    // Legacy objectives were free-text. Keep them readable but do not invent targets.
  }

  return {
    ...EMPTY_CAMPAIGN_OBJECTIVE,
    legacyText: rawObjective.trim(),
  };
}

export function formatObjectiveSummary(rawObjective: string | null | undefined) {
  const objective = parseCampaignObjective(rawObjective);
  const targetInteractions = getTargetInteractions(objective);
  const parts: string[] = [];

  if (objective.targetViews > 0) {
    parts.push(`${objective.targetViews.toLocaleString("id-ID")} views`);
  }

  if (targetInteractions > 0) {
    parts.push(`${targetInteractions.toLocaleString("id-ID")} interaksi`);
  }

  if (parts.length) {
    return parts.join(" • ");
  }

  return objective.legacyText || "Target belum diisi";
}

export function getProgressPercent(actual: number, target: number) {
  if (target <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((actual / target) * 100));
}
