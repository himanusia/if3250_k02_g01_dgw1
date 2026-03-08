import { env } from "@if3250_k02_g01_dgw1/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function shouldUseSsl(databaseUrl: string) {
	return !/(localhost|127\.0\.0\.1)/i.test(databaseUrl);
}

const client = postgres(env.DATABASE_URL, {
	connect_timeout: 10,
	idle_timeout: 30,
	max: 10,
	prepare: false,
	ssl: shouldUseSsl(env.DATABASE_URL) ? "require" : false,
});

export const db = drizzle(client, { schema });

export async function checkDbConnection(): Promise<string> {
	if (!env.DATABASE_URL) {
		return "No DATABASE_URL environment variable";
	}

	try {
		await client`SELECT version()`;
		return "Database connected";
	} catch (error) {
		console.error("Error connecting to the database:", error);
		return "Database not connected";
	}
}
