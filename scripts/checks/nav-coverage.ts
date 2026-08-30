import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * فاحص تغطية التنقّل — يمنع شاشة خارج مكدّس تبويب وبلا زر رجوع
 * (backend-technical-spec.md §21). يتحقق أن كل شاشة في مجموعة دور
 * ((farmer)، (supervisor)، (vet)، (owner)) مسجَّلة فعليًا في
 * Tabs.Screen بتخطيط المجموعة.
 *
 * **ومجموعة `platform` أُزيلت من القائمة** (القرار 194): شاشات مدير المنصة
 * الخمس حُذفت من التطبيق — **«لوحة تحكم منفصلة عن التطبيق، لا شاشة داخله»**
 * (#147). **وبقاء الاسم هنا كان سيجعل الفاحص يطالب بمجلد يجب ألا يعود.**
 *
 * ويمنع أيضًا أي **ملف غير مسار** داخل `app/` (القرار #91): Expo Router
 * يعامل كل ملف هناك كمسار بلا استثناء للاحقة `.test.tsx` — وقع هذا فعلًا،
 * فشُحن `@testing-library/react-native` داخل حزمة الإنتاج قبل اكتشافه.
 */

const APP_DIR = join(process.cwd(), "apps/mobile/app");
const TAB_GROUPS = ["(farmer)", "(supervisor)", "(vet)", "(owner)"];

/** لواحق ملفات لا يجوز وجودها داخل شجرة التوجيه إطلاقًا. */
const NON_ROUTE_SUFFIXES = [".test.tsx", ".test.ts", ".spec.tsx", ".spec.ts"];

export function checkNavCoverage(): { ok: boolean; message: string } {
  const violations: string[] = [...nonRouteFilesUnderApp(APP_DIR)];

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
  return {
    ok: true,
    message: "كل الشاشات مسجَّلة في مكدّس تبويب دورها، ولا ملف غير مسار داخل app/",
  };
}

/**
 * يمشي شجرة `app/` كاملة بحثًا عن ملفات اختبار — تُشحن في حزمة الإنتاج لو
 * بقيت هناك. مكانها `apps/mobile/screen-tests/` (انظر README هناك).
 * @returns قائمة المخالفات بمسارها النسبي
 */
function nonRouteFilesUnderApp(dir: string): string[] {
  const found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...nonRouteFilesUnderApp(full));
      continue;
    }
    if (NON_ROUTE_SUFFIXES.some((suffix) => entry.endsWith(suffix))) {
      found.push(`${relative(APP_DIR, full)}: ملف اختبار داخل app/ — Expo Router يشحنه كمسار`);
    }
  }
  return found;
}
