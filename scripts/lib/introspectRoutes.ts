import pino from "pino";

import type { Database } from "@dawajin/db";

import type { Env } from "../../apps/api/src/lib/env";

/**
 * يبني تطبيق Express الحقيقي (createApp) ويفحص شجرة توجيهه الداخلية
 * فعليًا — لا مطابقة نصية على أسماء متغيّرات أو مسارات. هذا يستبدل
 * الماسحين النصيين السابقين في duplicate-routes.ts وopenapi-coverage.ts،
 * اللذين أثبتنا أن `const r = Router()` يمرّ صامتًا من كليهما.
 *
 * **شرط:** كل موجّه فرعي يُركَّب بلا بادئة مسار (`app.use(router)` لا
 * `app.use("/api", router)`) — كل ملف مسار يكتب مساره الكامل بنفسه
 * ("/api/settings" لا "/settings"). هذا يُغني عن إعادة بناء بادئة من
 * layer.regexp الداخلي (تقنية هشّة تعتمد على تفاصيل تطبيق Express غير
 * موثَّقة رسميًا) — الفاحص يرفض بصوت عالٍ أي موجّه مركَّب بمسار بدل الفشل
 * الصامت إن خُولف هذا الشرط مستقبلًا.
 *
 * لا يحتاج اتصال قاعدة بيانات حقيقي — createApp يسجّل المسارات كدوال
 * إغلاق (closures) لا تُنفَّذ إلا عند وصول طلب فعلي، وهذا الفحص لا يُرسل
 * أي طلب.
 */

export interface RouteEntry {
  method: string;
  path: string;
  /**
   * **أدوار حارس `requireRole` على هذا المسار، أو `null` إن لم يُحرَس بدور**
   * (القرار 218).
   *
   * **مقروءةٌ من الشجرة لا من قائمة تُكتب بيد:** `requireRole` يُعلن أدواره
   * على الدالة التي يُرجعها (`RoleGuard.roles`)، **لأن الإغلاق لا يُقرأ من
   * خارجه واسم الدالة في الشجرة `<anonymous>`** — مقيسٌ لا مفترَض.
   */
  guardRoles: readonly string[] | null;
}

interface ExpressRoute {
  path: string;
  methods: Record<string, boolean>;
  stack?: { handle?: { roles?: readonly string[] } }[];
}

interface ExpressLayer {
  route?: ExpressRoute;
  name: string;
  handle: { stack?: ExpressLayer[] };
  regexp?: { fast_slash?: boolean };
}

function walk(stack: ExpressLayer[], routes: RouteEntry[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.entries(layer.route.methods)
        .filter(([, enabled]) => enabled)
        .map(([method]) => method.toUpperCase());
      const guard = (layer.route.stack ?? []).find((h) => Array.isArray(h.handle?.roles));
      const guardRoles = guard?.handle?.roles ?? null;
      for (const method of methods) {
        routes.push({ method, path: layer.route.path, guardRoles });
      }
    } else if (layer.name === "router" && layer.handle.stack) {
      if (!layer.regexp?.fast_slash) {
        throw new Error(
          "introspectRoutes: موجّه فرعي مركَّب بمسار بادئة (لا جذر) — غير مدعوم عمدًا. " +
            'اجعل كل مسار يكتب مساره الكامل بنفسه وركِّب الموجّه بلا بادئة (app.use(router) لا app.use("/x", router)).'
        );
      }
      walk(layer.handle.stack, routes);
    }
  }
}

export async function introspectRoutes(): Promise<RouteEntry[]> {
  const { createApp } = await import("../../apps/api/src/app");

  const fakeEnv: Env = {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_URL: "postgres://introspect-only",
    JWT_SECRET: "introspect-only",
    JWT_EXPIRES_IN: "30d",
    BCRYPT_ROUNDS: 10,
    LOG_LEVEL: "error",
    DEFAULT_COUNTRY_CODE: "+967",
  };
  // لا اتصال فعلي — لا مسار مسجَّل يُنفَّذ أثناء بناء التطبيق نفسه
  const fakeDb = {} as Database;
  const silentLogger = pino({ level: "silent" });

  const app = createApp(fakeDb, fakeEnv, silentLogger);
  const stack = (app as unknown as { _router: { stack: ExpressLayer[] } })._router.stack;

  const routes: RouteEntry[] = [];
  walk(stack, routes);
  return routes;
}
