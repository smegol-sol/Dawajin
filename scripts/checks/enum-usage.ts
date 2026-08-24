import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص صحة enum — يمنع قيمة بلا مسار API يكتبها (backend-technical-spec.md §21 و§8).
 * في المرحلة 0 لا مسارات أعمال بعد (health فقط) — الفحص يُصبح صارمًا فعليًا
 * فور تسجيل أول مسار حقيقي في apps/api/src/routes.
 */

const ROUTES_DIR = join(process.cwd(), "apps/api/src/routes");
const SHARED_ENUMS_FILE = join(process.cwd(), "packages/shared/src/enums.ts");

function listRouteFiles(): string[] {
  if (!existsSync(ROUTES_DIR)) return [];
  return readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, files);
    } else if (full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

export function checkEnumUsage(): { ok: boolean; message: string } {
  const routeFiles = listRouteFiles().filter((f) => f !== "health.ts");
  if (routeFiles.length === 0) {
    return {
      ok: true,
      message: "لا مسارات أعمال بعد (health فقط) — الفحص الصارم يبدأ في المرحلة 1 (TODO)",
    };
  }

  const enumsSource = readFileSync(SHARED_ENUMS_FILE, "utf8");
  const enumNames = [...enumsSource.matchAll(/export const ([A-Z_]+) = \[/g)].map((m) => m[1]);

  const apiDir = join(process.cwd(), "apps/api/src");
  const apiSource = walk(apiDir)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const unused = enumNames.filter((name) => !apiSource.includes(name));

  if (unused.length > 0) {
    return {
      ok: false,
      message: `أنواع enum غير مستخدمة في أي مسار API:\n  - ${unused.join("\n  - ")}`,
    };
  }
  return { ok: true, message: `كل أنواع enum (${enumNames.length}) مستخدمة في apps/api` };
}
