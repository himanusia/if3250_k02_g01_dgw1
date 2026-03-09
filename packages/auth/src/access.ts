import { db } from "@if3250_k02_g01_dgw1/db";
import { allowedEmail, type AppRole } from "@if3250_k02_g01_dgw1/db/schema/access";
import { env } from "@if3250_k02_g01_dgw1/env/server";
import { and, eq } from "drizzle-orm";

export type AccessState = {
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

export async function getAccessForEmail(email?: string | null): Promise<AccessState> {
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
      email: allowedEmail.email,
      role: allowedEmail.role,
    })
    .from(allowedEmail)
    .where(and(eq(allowedEmail.email, normalizedEmail), eq(allowedEmail.isActive, true)))
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
