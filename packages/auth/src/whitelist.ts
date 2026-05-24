import { db } from "@if3250_k02_g01_dgw1/db";
import { whitelistEmail, type AppRole } from "@if3250_k02_g01_dgw1/db/schema/whitelist";
import { env } from "@if3250_k02_g01_dgw1/env/server";
import { and, eq } from "drizzle-orm";

export type WhitelistState = {
  email: string;
  role: AppRole;
  source: "bootstrap" | "whitelist";
} | null;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getBootstrapAdminEmails() {
  return new Set(
    env.ADMIN_EMAILS.split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  );
}

export async function getWhitelistForEmail(email?: string | null): Promise<WhitelistState> {
  if (!email) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);

  if (getBootstrapAdminEmails().has(normalizedEmail)) {
    return {
      email: normalizedEmail,
      role: "admin",
      source: "bootstrap",
    };
  }

  const [record] = await db
    .select({
      email: whitelistEmail.email,
      role: whitelistEmail.role,
    })
    .from(whitelistEmail)
    .where(and(eq(whitelistEmail.email, normalizedEmail), eq(whitelistEmail.isActive, true)))
    .limit(1);

  if (!record) {
    return null;
  }

  return {
    email: record.email,
    role: record.role,
    source: "whitelist",
  };
}
