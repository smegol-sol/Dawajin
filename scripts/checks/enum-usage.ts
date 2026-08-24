import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص صحة enum — **بوابة إنفاذ حقيقية**: يفشل البناء عند قيمة enum معرَّفة
 * في المخطط ولا مسار API يكتبها (backend-technical-spec.md §21 و§8، ومعيار
 * القبول §26: "كل قيمة enum لها مسار يملؤه").
 *
 * **المشكلة الأصلية التي أُنشئ لأجلها:** قيمتان ميتتان في نسخة سابقة من هذا
 * النظام — معرَّفتان في المخطط وبلا أي مسار يكتبهما — أفسدتا تقرير الفاقد،
 * لأن التقرير جمّع حسب قيم لا يمكن أن تظهر في البيانات إطلاقًا.
 *
 * **الوحدة المفحوصة هي القيمة لا النوع.** نوع enum يُغطّى جزئيًا (بعض قيمه
 * مكتوبة وبعضها لا) هو بالضبط الحالة الخطرة: يبدو مستخدَمًا بينما فيه قيمة
 * ميتة. لذلك: أي نوع **يلمسه** كود الـAPI فعليًا تُفحص **كل** قيمه.
 *
 * **نوع لم يلمسه أي مسار بعد يُتجاوَز** — ليس قيمة ميتة بل ميزة لم تُبنَ
 * (المسارات تُبنى تدريجيًا عبر المراحل). أول مسار يلمس النوع يُفعِّل الحراسة
 * عليه كاملة فورًا — لا انتظار للمرحلة 7 (القرار #71).
 */

const SHARED_ENUMS_FILE = join(process.cwd(), "packages/shared/src/enums.ts");
const API_DIR = join(process.cwd(), "apps/api/src");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, files);
    } else if (full.endsWith(".ts") && !full.endsWith(".d.ts") && !full.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * **طبقة الكتابة** — الملفات التي تُنفِّذ `.insert(`/`.update(` فعليًا.
 *
 * الفحص يخص "قيمة **يكتبها** مسار" لا "قيمة تُذكَر في الكود": حارس قراءة مثل
 * `requireRole("owner")` أو `user.role === "owner"` يذكر القيمة ولا يكتبها
 * أبدًا. الاعتماد على ذِكر نصي في كل apps/api يجعل الفاحص يبلّغ زورًا عن
 * أدوار لا يكتبها أي مسار بعد (لا مسار `POST /users` حتى المرحلة 4).
 *
 * يُكتشَف الملف بموقع الكتابة نفسه لا باسم مجلده — فيبقى دقيقًا لو تغيّرت
 * البنية لاحقًا (وإن كان القرار #61 يحصر الكتابة في services/ اليوم).
 */
function writeLayerSource(files: string[]): string {
  return files
    .map((f) => readFileSync(f, "utf8"))
    .filter((src) => src.includes(".insert(") || src.includes(".update("))
    .join("\n");
}

interface EnumDef {
  name: string;
  values: string[];
}

/** يستخرج كل `export const NAME = [...] as const;` بقيمها النصية. */
function parseEnums(source: string): EnumDef[] {
  const defs: EnumDef[] = [];
  const re = /export const ([A-Z][A-Z0-9_]*) = \[([\s\S]*?)\] as const;/g;
  for (const m of source.matchAll(re)) {
    const name = m[1];
    const body = m[2];
    if (name === undefined || body === undefined) continue;
    const values = [...body.matchAll(/"([^"]+)"/g)]
      .map((v) => v[1])
      .filter((v): v is string => v !== undefined);
    if (values.length > 0) defs.push({ name, values });
  }
  return defs;
}

export function checkEnumUsage(): { ok: boolean; message: string } {
  const enums = parseEnums(readFileSync(SHARED_ENUMS_FILE, "utf8"));
  const apiSource = existsSync(API_DIR) ? writeLayerSource(walk(API_DIR)) : "";

  const dead: string[] = [];
  const inUse: EnumDef[] = [];
  const untouched: string[] = [];

  for (const def of enums) {
    // "ملموس" = طبقة الكتابة تكتب إحدى قيمه فعليًا
    const touched = def.values.some((v) => apiSource.includes(`"${v}"`));
    if (!touched) {
      untouched.push(def.name);
      continue;
    }
    inUse.push(def);
    for (const value of def.values) {
      if (!apiSource.includes(`"${value}"`)) {
        dead.push(`${def.name}."${value}"`);
      }
    }
  }

  const totalValues = enums.reduce((sum, d) => sum + d.values.length, 0);
  const guardedValues = inUse.reduce((sum, d) => sum + d.values.length, 0);
  const header =
    `${inUse.length}/${enums.length} نوع enum ملموس من الـAPI ` +
    `(${guardedValues}/${totalValues} قيمة تحت الحراسة)`;

  if (dead.length > 0) {
    return {
      ok: false,
      message:
        `قيم enum ميتة — معرَّفة في المخطط ولا مسار API يكتبها:\n  - ${dead.join("\n  - ")}\n` +
        `\n${header}\nقيمة ميتة تفسد كل تقرير يجمّع حسب هذا النوع (السبب الأصلي للفاحص — القرار #71).`,
    };
  }

  const suffix =
    untouched.length > 0
      ? `\n  أنواع لم يلمسها أي مسار بعد (ميزات لم تُبنَ، تُحرَس فور أول مسار يلمسها): ${untouched.join(", ")}`
      : " — كل الأنواع مغطاة وكل قيمها مكتوبة";

  return { ok: true, message: `${header}${suffix}` };
}
