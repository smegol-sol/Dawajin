import { randomUUID } from "node:crypto";

import type { Database } from "@dawajin/db";
import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Logger } from "pino";
import pinoHttp from "pino-http";

import type { Env } from "./lib/env";
import { requireAuth } from "./middleware/auth";
import { enforceEntityAccess } from "./middleware/entityAccess";
import { errorHandler } from "./middleware/errorHandler";
import { requireLiveSession } from "./middleware/liveSession";
import { requestId } from "./middleware/requestId";
import { requireTenant } from "./middleware/tenant";
import { authProtectedRouter } from "./routes/authProtected";
import { authPublicRouter } from "./routes/authPublic";
import { farmsRouter } from "./routes/farms";
import { healthRouter } from "./routes/health";
import { housesRouter } from "./routes/houses";
import { settingsRouter } from "./routes/settings";
import { sitesRouter } from "./routes/sites";

/**
 * يبني تطبيق Express كاملًا: الفرض المركزي الثلاثي (المبدأ #1 و#7)، كل
 * مسارات المرحلة 1، ومعالج الأخطاء. لا يستمع لمنفذ (index.ts يفعل ذلك) —
 * هذا يسمح بفحص شجرة التوجيه برمجيًا (scripts/lib/introspectRoutes.ts) بلا
 * اتصال قاعدة بيانات حقيقي.
 * @returns تطبيق Express جاهز — لم يُستدعَ عليه `.listen()` بعد
 */
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
      // requestId middleware مركَّب قبل هذا دائمًا ويضبط الحقل بلا شرط —
      // البديل هنا احتياطي دفاعي بحت لا مسار تنفيذ متوقَّع (لا !).
      genReqId: (req) => (req as express.Request).requestId ?? randomUUID(),
    })
  );

  app.use(
    // سياسة حماية منصة ثابتة، لا إعداد تشغيلي للمستأجر — القيم غير مأخوذة
    // من عمود tenants (§11 لا يربطها بإعدادات المستأجر).
    rateLimit({
      // eslint-disable-next-line dawajin/no-magic-config-number
      windowMs: 60_000,
      // eslint-disable-next-line dawajin/no-magic-config-number
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
  api.use(
    requireAuth(env.JWT_SECRET),
    // بعد requireAuth مباشرة: يعيد قراءة is_active و must_change_password من
    // القاعدة بقراءة واحدة، فلا يمر طلب على رمز لحساب عُطِّل أو بكلمة مؤقتة
    // لم تُغيَّر (القرار #99)
    requireLiveSession(db),
    requireTenant,
    enforceEntityAccess(db)
  );
  api.use(authProtectedRouter(db, env));
  api.use(settingsRouter(db));
  api.use(sitesRouter(db));
  api.use(farmsRouter(db));
  api.use(housesRouter(db));
  app.use(api);

  app.use(errorHandler(logger));

  return app;
}
