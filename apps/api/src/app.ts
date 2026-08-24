import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import type { Logger } from "pino";
import type { Database } from "@dawajin/db";
import type { Env } from "./lib/env";
import { healthRouter } from "./routes/health";
import { authPublicRouter } from "./routes/authPublic";
import { authProtectedRouter } from "./routes/authProtected";
import { settingsRouter } from "./routes/settings";
import { errorHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import { requireAuth } from "./middleware/auth";
import { requireTenant } from "./middleware/tenant";
import { enforceEntityAccess } from "./middleware/entityAccess";

export function createApp(db: Database, env: Env, logger: Logger): Express {
  const app = express();

  // أول middleware على الإطلاق — pino و/api/* والتدقيق كلها تعتمد على معرّف
  // الطلب الذي يولّده (backend-technical-spec.md §24).
  app.use(requestId);

  app.use(helmet());
  app.use(
    cors({
      origin: env.NODE_ENV === "production" ? [] : true,
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId!,
    })
  );

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // علني بلا مصادقة — مراقبة النشر
  app.use(healthRouter(db, env));

  // علني بلا مصادقة عمدًا — POST /auth/login لا يملك توكن مسبقًا ليدخل
  // سلسلة requireAuth (backend-technical-spec.md §17).
  app.use(authPublicRouter(db, env));

  // كل شيء تحت /api يمر بالفرض المركزي الثلاثي (المبدأ #1 و#7).
  // يُركَّب هنا بلا بادئة مسار عمدًا (app.use(api) لا app.use("/api", api))
  // — كل ملف مسار يكتب مساره الكامل ("/api/settings" لا "/settings").
  // هذا يجعل شجرة توجيه Express قابلة للفحص البرمجي المباشر بلا حاجة
  // لإعادة بناء بادئة من regexp داخلي (scripts/lib/introspectRoutes.ts) —
  // لا اعتماد على اسم متغيّر ولا مطابقة نصية تفوّت مسارًا بالخطأ.
  const api = express.Router();
  api.use(requireAuth(env.JWT_SECRET), requireTenant, enforceEntityAccess(db));
  api.use(authProtectedRouter(db, env));
  api.use(settingsRouter(db));
  app.use(api);

  app.use(errorHandler(logger));

  return app;
}
