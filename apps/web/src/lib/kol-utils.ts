export function getAvatarSrc(url: string) {
  if (!url) {
    return "";
  }

  if (url.startsWith("/api/avatar?url=")) {
    return url;
  }

  if (!/^https?:\/\//i.test(url)) {
    return url;
  }

  try {
    const hostname = new URL(url).hostname;
    const shouldProxy = /(^|\.)fbcdn\.net$/i.test(hostname) || /\.cdninstagram\.com$/i.test(hostname);

    if (!shouldProxy) {
      return url;
    }
  } catch {
    return url;
  }

  return `/api/avatar?url=${encodeURIComponent(url)}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }

  return 0;
}

export function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/gi, "&")
    .replace(/&#x26;/gi, "&");
}

export function asUrlText(value: unknown) {
  const text = asText(value);

  return text ? decodeHtmlEntities(text) : "";
}

export function getValue(record: Record<string, unknown> | null, ...keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }

    if (key.includes(".")) {
      const value = key.split(".").reduce<unknown>((current, part) => {
        if (typeof current === "object" && current !== null && part in (current as Record<string, unknown>)) {
          return (current as Record<string, unknown>)[part];
        }

        return undefined;
      }, record);

      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

export function getAccountMetadata(metadata: Record<string, unknown> | null) {
  if (!isRecord(metadata)) {
    return null;
  }

  const avatarUrl =
    asUrlText(
      getValue(
        metadata,
        "profilePicUrlHD",
        "profilePicUrlHd",
        "profilePicUrl",
        "avatarUrl",
        "avatarUrlHD",
        "profile_pic_url_hd",
        "profile_pic_url",
        "authorMeta.avatar",
        "authorMeta.originalAvatarUrl",
      ),
    ) || null;
  const category =
    asText(getValue(metadata, "businessCategoryName", "category", "authorMeta.commerceUserInfo.category")) || null;
  const website =
    asText(getValue(metadata, "externalUrl", "authorMeta.bioLink")) ||
    (Array.isArray(metadata.externalUrls)
      ? asText(
          (
            metadata.externalUrls.find((item) => isRecord(item) && asText(item.url)) as
              | Record<string, unknown>
              | undefined
          )?.url,
        )
      : "") ||
    null;

  return {
    avatarUrl,
    category,
    fullName: asText(getValue(metadata, "fullName", "authorMeta.nickName", "authorMeta.name")) || null,
    followingCount: asNumber(getValue(metadata, "followsCount", "followingCount", "authorMeta.following")),
    isBusinessAccount: asBoolean(getValue(metadata, "isBusinessAccount", "authorMeta.commerceUserInfo.commerceUser")),
    isPrivate: asBoolean(getValue(metadata, "private", "isPrivate", "authorMeta.privateAccount")),
    postsCount: asNumber(getValue(metadata, "postsCount", "authorMeta.video")),
    verified: asBoolean(getValue(metadata, "verified", "authorMeta.verified")),
    website,
  };
}

export function formatNumber(value: number) {
  return value.toLocaleString("id-ID");
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
