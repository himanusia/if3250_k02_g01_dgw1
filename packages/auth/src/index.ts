import { db } from "@if3250_k02_g01_dgw1/db";
import * as schema from "@if3250_k02_g01_dgw1/db/schema/auth";
import { env } from "@if3250_k02_g01_dgw1/env/server";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";

import { getAccessForEmail, normalizeEmail } from "./access";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",

    schema: schema,
  }),
  trustedOrigins: [env.CORS_ORIGIN],
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const access = await getAccessForEmail(user.email);

          if (!access) {
            throw new APIError("BAD_REQUEST", {
              message: "Email ini belum masuk whitelist aplikasi.",
            });
          }

          return {
            data: {
              ...user,
              email: normalizeEmail(user.email),
            },
          };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const [existingUser] = await db
            .select({ email: schema.user.email })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId))
            .limit(1);

          const access = await getAccessForEmail(existingUser?.email);

          if (!access) {
            throw new APIError("BAD_REQUEST", {
              message: "Akses aplikasi untuk email ini sudah tidak aktif.",
            });
          }
        },
      },
    },
  },
  plugins: [tanstackStartCookies()],
});
