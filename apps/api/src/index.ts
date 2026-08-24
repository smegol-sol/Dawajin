import { createDbClient } from "@dawajin/db";
import pino from "pino";

import { createApp } from "./app";
import { loadEnv } from "./lib/env";

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });
const { pool, db } = createDbClient(env.DATABASE_URL);

const app = createApp(db, env, logger);

app.listen(env.PORT, () => {
  logger.info(
    { environment: env.NODE_ENV, port: env.PORT },
    `[api] الخادم يعمل على المنفذ ${env.PORT} (${env.NODE_ENV})`
  );
});

process.on("SIGTERM", async () => {
  logger.info("[api] إيقاف تدريجي...");
  await pool.end();
  process.exit(0);
});
