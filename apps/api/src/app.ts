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
import { noStore } from "./middleware/noStore";
import { requestId } from "./middleware/requestId";
import { requireTenant } from "./middleware/tenant";
import { authProtectedRouter } from "./routes/authProtected";
import { authPublicRouter } from "./routes/authPublic";
import { chickShipmentsRouter } from "./routes/chickShipments";
import { farmsRouter } from "./routes/farms";
import { healthRouter } from "./routes/health";
import { housesRouter } from "./routes/houses";
import { inventoryRouter } from "./routes/inventory";
import { inventoryTransferRouter } from "./routes/inventoryTransfer";
import { platformAuthRouter } from "./routes/platformAuth";
import { prepCycleRouter } from "./routes/prepCycle";
import { settingsRouter } from "./routes/settings";
import { sitesRouter } from "./routes/sites";
import { userAssignmentsRouter } from "./routes/userAssignments";
import { usersRouter } from "./routes/users";

/**
 * يبني تطبيق Express كاملًا: الفرض المركزي الثلاثي (المبدأ #1 و#7)، كل
 * مسارات المرحلة 1، ومعالج الأخطاء. لا يستمع لمنفذ (index.ts يفعل ذلك) —
 * هذا يسمح بفحص شجرة التوجيه برمجيًا (scripts/lib/introspectRoutes.ts) بلا
 * اتصال قاعدة بيانات حقيقي.
 * @returns تطبيق Express جاهز — لم يُستدعَ عليه `.listen()` بعد
 */
/**
 * أنماط المسارات التي تحمل معرّف كيان في الرابط — كل نمط يُركَّب عليه
 * `enforceEntityAccess`. `batchId` يُضاف مع مسارات الدفعات (المرحلة 2).
 *
 * **وكل مسار سرد جديد يُضاف هنا** — لا يكفي أن تفلتر الخدمة نتائجه: الفرض
 * يقرّر «هل يصل هذه المزرعة أصلًا» والفلترة تقرّر «ماذا يرى داخلها»
 * (`CLAUDE.md` — قاعدة السرد، القرار #129).
 */
export const ENTITY_ID_PATH_PATTERNS = [
  "/api/houses/:houseId",
  "/api/batches/:batchId",
  // خطوة التجهيز معرّفٌ مشتق — `resolveHouseId` يحلّها لعنبرها (القرار 221)
  "/api/prep-steps/:stepId",
  // أمر التحويل — معرّفٌ في الرابط، والفرض المركزي يراه بنمطه
  "/api/inventory/transfers/:transferId",
  // نمط واحد يغطي `/api/farms/:farmId` و`/api/farms/:farmId/houses` معًا —
  // `api.use(pattern)` يطابق البادئة لا المسار الكامل، **كما في نمط الموقع
  // أدناه** (القرار #131). وكان النمط هنا **للسرد وحده**، فمرّت قراءة
  // المزرعة نفسها بلا فحص إسناد إطلاقًا (§7-ب البند 43، والقرار 191).
  "/api/farms/:farmId",
  // نمط واحد يغطي `/api/sites/:siteId` و`/api/sites/:siteId/farms` معًا —
  // `api.use(pattern)` يطابق البادئة لا المسار الكامل (القرار #131).
  "/api/sites/:siteId",
  // المستخدم المستهدَف — `assertUserAccess` يحلّه بـ`visibleUserCondition`
  // (القرار 251). **ونمطٌ بلا محلِّل فرضٌ صوريّ** (القرار 229)، فأُضيفا معًا.
  "/api/users/:userId",
  // **شحنةُ الكتاكيت — وجودٌ داخل المستأجر لا إسناد** (القرار 275).
  // **ولا نطاقَ إسنادٍ لها قبل توزيعها** (لا مزرعة ولا عنبر)، **والقيد يقع
  // على العنابر في الجسم** — يفرضه المسحُ العميق في `enforceEntityAccess`.
  // **ومحلِّلُه `assertChickShipmentExists` أُضيف معه** فلا نمطَ بلا محلِّل
  // (القرار 229).
  "/api/chick-shipments/:shipmentId",
] as const;

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
  // مقصور على مسارات المصادقة وحدها — لا سياسة تخزين عامة للـAPI.
  // بادئة مسار لا تركيب على الموجّه: كل ملف مسار يكتب مساره الكامل.
  app.use("/api/auth", noStore);
  app.use(authPublicRouter(db, env));

  // **مسار مدير المنصة — خارج سلسلة `/api` كلها** (القرار #147 والقرار 195):
  // عنوان مختلف وحارس مختلف (`requirePlatformAdmin`) وجدول مختلف. **ويُركَّب
  // هنا قبل موجّه `api` لا داخله** — دخوله في السلسلة يعيد الخلط الذي مُنع.
  app.use("/platform", noStore);
  app.use(platformAuthRouter(db, env));

  // كل شيء تحت /api يمر بالفرض المركزي الثلاثي (المبدأ #1 و#7).
  // يُركَّب هنا بلا بادئة مسار عمدًا (app.use(api) لا app.use("/api", api))
  // — كل ملف مسار يكتب مساره الكامل ("/api/settings" لا "/settings").
  // هذا يجعل شجرة توجيه Express قابلة للفحص البرمجي المباشر بلا حاجة
  // لإعادة بناء بادئة من regexp داخلي (scripts/lib/introspectRoutes.ts) —
  // لا اعتماد على اسم متغيّر ولا مطابقة نصية تفوّت مسارًا بالخطأ.

  // **رد الإنشاء يحمل كلمة مرور مؤقتة** (القرار 245) — فلا يُخزَّن في وسيط
  // ولا في ذاكرة متصفح. نفس علّة `/api/auth` و`/platform` أعلاه، ولا سياسة
  // تخزين عامة للـAPI.
  app.use("/api/users", noStore);

  const api = express.Router();
  api.use(
    requireAuth(env.JWT_SECRET),
    // بعد requireAuth مباشرة: يعيد قراءة is_active و must_change_password من
    // القاعدة بقراءة واحدة، فلا يمر طلب على رمز لحساب عُطِّل أو بكلمة مؤقتة
    // لم تُغيَّر (القرار #99)
    requireLiveSession(db),
    requireTenant,
    // يمسح query+body عن معرّفات الكيانات
    enforceEntityAccess(db)
  );

  // ومعرّفات **الرابط** تحتاج تركيبًا بنمط مسار: Express لا يملأ `req.params`
  // في middleware مركَّب بلا نمط، فكان الحارس أعمى تجاهها (القرار #124).
  // يبقى هنا لا داخل الموجّهات — الفرض مركزي في موضع واحد (المبدأ #1)، وإضافة
  // نمط جديد سطر واحد بجوار أخواته لا بحثٌ في كل ملف مسار.
  for (const pattern of ENTITY_ID_PATH_PATTERNS) {
    api.use(pattern, enforceEntityAccess(db));
  }
  api.use(authProtectedRouter(db, env));
  api.use(usersRouter(db, env));
  api.use(userAssignmentsRouter(db));
  api.use(settingsRouter(db));
  api.use(sitesRouter(db));
  api.use(farmsRouter(db));
  api.use(housesRouter(db));
  api.use(prepCycleRouter(db));
  api.use(inventoryRouter(db));
  api.use(inventoryTransferRouter(db));
  api.use(chickShipmentsRouter(db));
  app.use(api);

  app.use(errorHandler(logger));

  return app;
}
