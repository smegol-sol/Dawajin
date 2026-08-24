import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص المسارات المكررة — يمنع تسجيل نفس (method, path) مرتين
 * (backend-technical-spec.md §21).
 */

const ROUTES_DIR = join(process.cwd(), "apps/api/src");
const METHOD_CALL = /\b(?:router|app)\.(get|post|patch|put|delete)\(\s*["'`]([^"'`]+)["'`]/g;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.endsWith(".test.ts")) continue;
      walk(full, files);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

export function checkDuplicateRoutes(): { ok: boolean; message: string } {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  for (const file of walk(ROUTES_DIR)) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(METHOD_CALL)) {
      const [, method, path] = match;
      const key = `${method.toUpperCase()} ${path}`;
      if (seen.has(key) && seen.get(key) !== file) {
        duplicates.push(`${key} — مسجَّل في ${seen.get(key)} و ${file}`);
      } else {
        seen.set(key, file);
      }
    }
  }

  if (duplicates.length > 0) {
    return { ok: false, message: `مسارات مكررة:\n  - ${duplicates.join("\n  - ")}` };
  }
  return { ok: true, message: `لا تكرار — ${seen.size} مسار مفحوص` };
}
