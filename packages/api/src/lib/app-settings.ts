import { db } from "@if3250_k02_g01_dgw1/db";
import { appSettings } from "@if3250_k02_g01_dgw1/db/schema/whitelist";
import { eq } from "drizzle-orm";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);

  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value },
    });
}

export async function getSettingNumber(key: string, fallback: number) {
  const existing = await getSetting(key);

  if (existing !== null) {
    const parsed = Number(existing);
    if (Number.isFinite(parsed)) return parsed;
  }

  await db
    .insert(appSettings)
    .values({
      key,
      value: String(fallback),
    })
    .onConflictDoNothing();

  return fallback;
}

export async function getSettingJson<T>(key: string, fallback: T): Promise<T> {
  const existing = await getSetting(key);

  if (existing) {
    try {
      return JSON.parse(existing) as T;
    } catch {
      return fallback;
    }
  }

  await setSetting(key, JSON.stringify(fallback));
  return fallback;
}
