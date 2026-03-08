import { env } from "@if3250_k02_g01_dgw1/env/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const sql = neon(env.DATABASE_URL);

export const db = drizzle({ client: sql, schema });
