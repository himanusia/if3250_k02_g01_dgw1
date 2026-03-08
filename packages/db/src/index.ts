import { env } from "@if3250_k02_g01_dgw1/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function shouldUseSsl(databaseUrl: string) {
	return !/(localhost|127\.0\.0\.1)/i.test(databaseUrl);
}

const pool = new Pool({
	connectionString: env.DATABASE_URL,
	connectionTimeoutMillis: 10_000,
	idleTimeoutMillis: 30_000,
	max: 10,
	ssl: shouldUseSsl(env.DATABASE_URL)
		? {
				rejectUnauthorized: false,
			}
		: undefined,
});

export const db = drizzle(pool, { schema });
