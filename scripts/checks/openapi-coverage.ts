import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { introspectRoutes } from "../lib/introspectRoutes";

/**
 * فاحص تغطية OpenAPI — يفشل البناء عند مسار غير موثّق (backend-technical-
 * spec.md §21). مقارنة ثنائية الاتجاه فعلية بين شجرة توجيه Express الحقيقية
 * (introspectRoutes — لا مطابقة نصية) وعقد apps/api/src/openapi/spec.json:
 *   - مسار مسجَّل في Express فعليًا بلا توثيق في العقد ← فشل
 *   - مسار موثَّق في العقد بلا مسار Express حقيقي يخدمه ← فشل أيضًا
 *
 * /health و /ready مستثنيان عمدًا — علنيان خارج عقد /api التجاري
 * (backend-technical-spec.md §4.4 مقابل §17).
 */

const SPEC_PATH = join(process.cwd(), "apps/api/src/openapi/spec.json");
const EXEMPT_PATHS = new Set(["/health", "/ready"]);

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

export async function checkOpenApiCoverage(): Promise<{ ok: boolean; message: string }> {
  if (!existsSync(SPEC_PATH)) {
    return { ok: false, message: `عقد OpenAPI غير موجود في ${SPEC_PATH}` };
  }

  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  const expressRoutes = (await introspectRoutes()).filter((r) => !EXEMPT_PATHS.has(r.path));
  const specRoutes = collectSpecPaths(spec);

  const expressKeys = new Set(expressRoutes.map((r) => `${r.method} ${r.path}`));
  const specKeys = new Set(specRoutes.map((r) => `${r.method} ${r.path}`));

  const undocumented = expressRoutes.filter((r) => !specKeys.has(`${r.method} ${r.path}`));
  const phantom = specRoutes.filter((r) => !expressKeys.has(`${r.method} ${r.path}`));

  if (undocumented.length > 0 || phantom.length > 0) {
    const lines: string[] = [];
    for (const r of undocumented) {
      lines.push(`${r.method} ${r.path} — مسجَّل في Express فعليًا بلا توثيق في العقد`);
    }
    for (const r of phantom) {
      lines.push(`${r.method} ${r.path} — موثَّق في العقد بلا مسار Express حقيقي يخدمه`);
    }
    return { ok: false, message: `فرق بين المسارات الفعلية والعقد:\n  - ${lines.join("\n  - ")}` };
  }

  return { ok: true, message: `${expressRoutes.length} مسار — متطابق تمامًا مع عقد OpenAPI` };
}
