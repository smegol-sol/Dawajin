import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import type { Logger } from "pino";
import type { Database } from "@dawajin/db";
import type { Env } from "./lib/env";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middleware/errorHandler";

export function createApp(db: Database, env: Env, logger: Logger): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.NODE_ENV === "production" ? [] : true,
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(pinoHttp({ logger }));

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use(healthRouter(db, env));

  app.use(errorHandler(logger));

  return app;
}
