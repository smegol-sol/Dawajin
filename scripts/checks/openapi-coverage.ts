import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص تغطية OpenAPI — يفشل البناء عند مسار غير موثّق (backend-technical-
 * spec.md §21). مقارنة ثنائية الاتجاه فعلية بين مسارات apps/api/src/routes
 * الحقيقية (Express) وعقد apps/api/src/openapi/spec.json:
 *   - مسار مسجَّل في Express بلا توثيق في العقد ← فشل
 *   - مسار موثَّق في العقد بلا مسار Express حقيقي يخدمه ← فشل أيضًا
 *
 * الاصطلاح: كل ملف في routes/ عدا health.ts (علني، خارج عقد /api — راجع
 * backend-technical-spec.md §4.4 مقابل §17) يُركَّب تحت بادئة /api كما في
 * app.ts فعليًا.
 */

const ROUTES_DIR = join(process.cwd(), "apps/api/src/routes");
const SPEC_PATH = join(process.cwd(), "apps/api/src/openapi/spec.json");
const METHOD_CALL = /\brouter\.(get|post|patch|put|delete)\(\s*["'`]([^"'`]+)["'`]/g;
const EXEMPT_FILES = new Set(["health.ts"]);

interface RouteEntry {
  method: string;
  path: string;
  file: string;
}

function collectExpressRoutes(): RouteEntry[] {
  if (!existsSync(ROUTES_DIR)) return [];
  const routes: RouteEntry[] = [];

  for (const entry of readdirSync(ROUTES_DIR)) {
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts") || EXEMPT_FILES.has(entry)) continue;
    const content = readFileSync(join(ROUTES_DIR, entry), "utf8");
    for (const match of content.matchAll(METHOD_CALL)) {
      const [, method, routePath] = match;
      routes.push({ method: method.toUpperCase(), path: `/api${routePath}`, file: entry });
    }
  }
  return routes;
}

interface SpecEntry {
  method: string;
  path: string;
}

function collectSpecPaths(spec: unknown): SpecEntry[] {
  const entries: SpecEntry[] = [];
  const paths = (spec as { paths?: Record<string, Record<string, unknown>> }).paths ?? {};
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of Object.keys(methods)) {
      entries.push({ method: method.toUpperCase(), path });
    }
  }
  return entries;
}

export function checkOpenApiCoverage(): { ok: boolean; message: string } {
  if (!existsSync(SPEC_PATH)) {
    return { ok: false, message: `عقد OpenAPI غير موجود في ${SPEC_PATH}` };
  }

  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  const expressRoutes = collectExpressRoutes();
  const specRoutes = collectSpecPaths(spec);

  const expressKeys = new Set(expressRoutes.map((r) => `${r.method} ${r.path}`));
  const specKeys = new Set(specRoutes.map((r) => `${r.method} ${r.path}`));

  const undocumented = expressRoutes.filter((r) => !specKeys.has(`${r.method} ${r.path}`));
  const phantom = specRoutes.filter((r) => !expressKeys.has(`${r.method} ${r.path}`));

  if (undocumented.length > 0 || phantom.length > 0) {
    const lines: string[] = [];
    for (const r of undocumented) {
      lines.push(`${r.method} ${r.path} (${r.file}) — مسجَّل في Express بلا توثيق في العقد`);
    }
    for (const r of phantom) {
      lines.push(`${r.method} ${r.path} — موثَّق في العقد بلا مسار Express حقيقي يخدمه`);
    }
    return { ok: false, message: `فرق بين المسارات الفعلية والعقد:\n  - ${lines.join("\n  - ")}` };
  }

  return { ok: true, message: `${expressRoutes.length} مسار — متطابق تمامًا مع عقد OpenAPI` };
}
