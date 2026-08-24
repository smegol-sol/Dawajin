import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * فاحص تغطية التنقّل — يمنع شاشة خارج مكدّس تبويب وبلا زر رجوع
 * (backend-technical-spec.md §21). يتحقق أن كل شاشة في مجموعة دور
 * ((farmer)، (supervisor)، (vet)، (owner)، platform) مسجَّلة فعليًا في
 * Tabs.Screen بتخطيط المجموعة.
 */

const APP_DIR = join(process.cwd(), "apps/mobile/app");
const TAB_GROUPS = ["(farmer)", "(supervisor)", "(vet)", "(owner)", "platform"];

export function checkNavCoverage(): { ok: boolean; message: string } {
  const violations: string[] = [];

  for (const group of TAB_GROUPS) {
    const groupDir = join(APP_DIR, group);
    let entries: string[];
    try {
      entries = readdirSync(groupDir);
    } catch {
      violations.push(`${group}: المجلد غير موجود`);
      continue;
    }

    const layoutPath = join(groupDir, "_layout.tsx");
    let layoutContent: string;
    try {
      layoutContent = readFileSync(layoutPath, "utf8");
    } catch {
      violations.push(`${group}: _layout.tsx غير موجود`);
      continue;
    }

    const registeredNames = new Set(
      [...layoutContent.matchAll(/Tabs\.Screen\s+name=["'`]([^"'`]+)["'`]/g)].map((m) => m[1])
    );

    for (const entry of entries) {
      if (entry === "_layout.tsx" || !entry.endsWith(".tsx")) continue;
      const stat = statSync(join(groupDir, entry));
      if (stat.isDirectory()) continue;
      const screenName = entry.replace(/\.tsx$/, "");
      if (!registeredNames.has(screenName)) {
        violations.push(`${group}/${entry}: غير مسجَّلة في Tabs.Screen بـ _layout.tsx`);
      }
    }
  }

  if (violations.length > 0) {
    return { ok: false, message: `مخالفات تغطية التنقّل:\n  - ${violations.join("\n  - ")}` };
  }
  return { ok: true, message: "كل الشاشات مسجَّلة في مكدّس تبويب دورها" };
}
