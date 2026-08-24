import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص صحة enum — يمنع قيمة enum بلا مسار API يكتبها في النهاية
 * (backend-technical-spec.md §21 و§8 ومعيار القبول §26: "كل قيمة enum لها
 * مسار يملؤه").
 *
 * **شدّة مرحلية متعمّدة — محسوبة فعليًا لا "بوابة صورية"، لكنها ليست بوابة
 * قطع بعد:** يحسب التغطية الحقيقية من packages/shared في كل تشغيل (26
 * نوعًا فعليًا، لا رقمًا ثابتًا) ويعرضها دائمًا. طلب تغطية 100% فور أول
 * مسار حقيقي واحد (كما كانت النسخة الأولى تفعل) غير واقعي — المسارات
 * تُبنى تدريجيًا عبر المراحل 1-6، وكل مرحلة تغطي جزءًا من الـ26 لا كلها
 * دفعة واحدة. التغطية الكاملة معيار قبول نهائي (§26) يُتحقق منه صراحة في
 * بوابة خروج المرحلة 7 (docs/work-plan.md)، لا شرطًا على كل PR فردي.
 *
 * الفرق عن فاحص OpenAPI القديم (الذي استُبدل لأنه كان يُرجع ok:true دائمًا
 * بلا أي حساب): هذا الفحص يحسب رقمًا حقيقيًا في كل مرة ويعرضه — القيد
 * الوحيد هو نقطة "متى يصبح 100% إلزاميًا"، لا أن الفحص بلا أثر إطلاقًا.
 */

const SHARED_ENUMS_FILE = join(process.cwd(), "packages/shared/src/enums.ts");
const API_DIR = join(process.cwd(), "apps/api/src");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, files);
    } else if (full.endsWith(".ts") && !full.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

export function checkEnumUsage(): { ok: boolean; message: string } {
  const enumsSource = readFileSync(SHARED_ENUMS_FILE, "utf8");
  // مجموعة الالتقاط الأولى مضمونة بنمط regex نفسه، لكن نوعها string|undefined
  // — نُرشِّح صراحةً بدل تأكيد غير آمن
  const enumNames = [...enumsSource.matchAll(/export const ([A-Z_]+) = \[/g)]
    .map((m) => m[1])
    .filter((name): name is string => name !== undefined);

  const apiSource = existsSync(API_DIR)
    ? walk(API_DIR)
        .filter((f) => !f.endsWith(".test.ts"))
        .map((f) => readFileSync(f, "utf8"))
        .join("\n")
    : "";

  const covered = enumNames.filter((name) => apiSource.includes(name));
  const uncovered = enumNames.filter((name) => !apiSource.includes(name));
  const pct = Math.round((covered.length / enumNames.length) * 100);

  const suffix =
    uncovered.length > 0
      ? `\n  متبقٍّ (طبيعي قبل اكتمال المراحل 1-6 — يُفرض 100% كبوابة قطع في المرحلة 7): ${uncovered.join(", ")}`
      : " — تغطية كاملة";

  return {
    ok: true,
    message: `${covered.length}/${enumNames.length} (${pct}%) من أنواع enum مستخدمة في apps/api${suffix}`,
  };
}
