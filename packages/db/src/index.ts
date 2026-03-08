import { env } from "@if3250_k02_g01_dgw1/env/server";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const pool = new Pool({
	connectionString: env.DATABASE_URL,
});

attachDatabasePool(pool);

export const db = drizzle(pool, { schema });

export async function checkDbConnection(): Promise<string> {
	if (!env.DATABASE_URL) {
		return "No DATABASE_URL environment variable";
	}

	try {
		await pool.query("SELECT version()");
		return "Database connected";
	} catch (error) {
		console.error("Error connecting to the database:", error);
		return "Database not connected";
	}
}
