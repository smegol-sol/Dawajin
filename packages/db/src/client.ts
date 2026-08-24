import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index";

/**
 * ينشئ اتصال Postgres (pool) وعميل Drizzle مربوطًا بالمخطط الكامل.
 * @returns `{ pool, db }` — `pool` يُغلَق صراحة (`pool.end()`) عند إيقاف الخادم/الاختبار
 */
export function createDbClient(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

export type Database = ReturnType<typeof createDbClient>["db"];
