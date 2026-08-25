import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص التغطية — يشغّل تغطية apps/api (وحدة+تكامل) وpackages/shared وapps/mobile
 * كل حزمة داخل جذرها (القرار #63 — قياس تغطية عبر حدود حزم monorepo من جذر
 * واحد لا يعمل مع v8 provider، مُثبَت أثناء البناء). vitest وjest كلاهما يفشل
 * بخروج غير صفري عند نزول أي حد عن عتبته، فهذا الفحص يعتمد على ذلك ثم يعرض
 * الأرقام الحقيقية — لا تقدير.
 *
 * ## لماذا يقرأ المجرَيين ويعرض آخر أسطر المخرَج (القرار #143)
 *
 * **كان يسمّي سببًا لم يُثبت.** فلترة `runCoverage` كانت على `stdout` **وvitest
 * يكتب أخطاء العتبة على `stderr`** — فأي فشل عتبة في `apps/api` أو
 * `packages/shared` كان يُعرض **بلا سبب إطلاقًا**، تحت عنوان «التغطية دون الحد
 * المطلوب» ومعه **أرقام سليمة**. و`runJestCoverage` كانت تقرأ المجرى الصحيح
 * لكنها تفلتر أسطر «عتبة التغطية» وحدها، فاختبار ساقط أو عملية مقتولة تظهر
 * بنفس العنوان الكاذب.
 *
 * **الكلفة الحقيقية: جولتا تشخيص في الدفعة 5** (القرار #133) — بدأتا من التغطية
 * وكان السبب اختبارًا يسقط على مهلة زمنية.
 *
 * **فالقاعدة هنا: لا يُسمّى سبب لم يُقرأ.** عند فشل تحمل مخرَجاته سطرَ عتبة
 * صريحًا تُعرض أسطر العتبة؛ وعند فشل بلا ذلك يُعرض **آخر ما قالته الأداة
 * فعلًا** مهما كان. عرضٌ خام أصدق من تسمية مخترَعة.
 *
 * **ولا يخفّض هذا أي عتبة ولا يحوّل فشلًا إلى تحذير** — `ok` يبقى
 * `status === 0` حصرًا. التغيير في **ما يُقال عن الفشل** لا في متى يقع.
 */
export function checkCoverage(): { ok: boolean; message: string } {
  const api = runCoverage("apps/api", "vitest.coverage.config.ts");
  const shared = runCoverage("packages/shared", "vitest.config.ts");
  // apps/mobile على jest لا vitest — الحدود لكل ملف منطق في jest.config.js
  const mobile = runJestCoverage("apps/mobile");

  const ok = api.ok && shared.ok && mobile.ok;
  const message = [
    `apps/api: ${api.summary}`,
    `packages/shared: ${shared.summary}`,
    `apps/mobile: ${mobile.summary}`,
  ].join("\n");

  if (!ok) {
    // اسم الحزمة يسبق سببها: ثلاث أدوات تكتب بصيغ مختلفة، وسبب بلا صاحب
    // يُقرأ على أنه سبب الحزمة الخطأ.
    const failures = [
      !api.ok ? `— apps/api:\n${api.errors}` : "",
      !shared.ok ? `— packages/shared:\n${shared.errors}` : "",
      !mobile.ok ? `— apps/mobile:\n${mobile.errors}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { ok: false, message: `التغطية دون الحد المطلوب:\n${message}\n${failures}` };
  }
  return { ok: true, message };
}

/** آخر ما تُعرض من أسطر المخرَج الخام حين لا يوجد سطر عتبة صريح. */
const TAIL_LINES = 25;

/**
 * يبني سبب الفشل من **المجرَيين معًا**.
 *
 * @param result مخرَج العملية كما هو — `stdout` و`stderr` بلا افتراض أيّهما
 *   يحمل الخطأ: vitest يكتب العتبات على stderr، وjest كذلك، والاختبارات
 *   الساقطة تُطبع على stdout. الافتراض هو ما أعمى الفاحص أصلًا (#143).
 * @param matches يميّز سطر العتبة الصريح في مخرَج هذه الأداة
 * @returns أسطر العتبة إن وُجدت، وإلا آخر أسطر المخرَج الخام
 */
function failureReason(
  result: { stdout: string; stderr: string },
  matches: (line: string) => boolean
): string {
  const lines = `${result.stdout}\n${result.stderr}`.split("\n");
  const thresholds = lines.filter(matches);
  if (thresholds.length > 0) return thresholds.join("\n");

  const tail = lines.filter((line) => line.trim() !== "").slice(-TAIL_LINES);
  return tail.length > 0
    ? `لا سطر عتبة في المخرَج — آخر ${String(tail.length)} سطرًا كما قالتها الأداة:\n${tail.join("\n")}`
    : "فشلت الأداة بلا أي مخرَج — تحقق من تشغيلها يدويًا.";
}

/**
 * تغطية jest لحزمة الموبايل — jest نفسه يخرج بحالة غير صفرية عند نزول أي
 * حد عن عتبته في `coverageThreshold`، فهذا الفحص يعتمد على ذلك ثم يعرض
 * الأرقام الحقيقية، تمامًا كنظيره في vitest.
 */
function runJestCoverage(cwd: string): { ok: boolean; summary: string; errors: string } {
  const result = spawnSync("npx", ["jest", "--coverage", "--coverageReporters=json-summary"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  return {
    ok: result.status === 0,
    summary: readSummary(cwd),
    errors: failureReason(result, (line) => line.includes("coverage threshold")),
  };
}

function runCoverage(
  cwd: string,
  config: string
): { ok: boolean; summary: string; errors: string } {
  const result = spawnSync("npx", ["vitest", "run", "--config", config, "--coverage"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  return {
    ok: result.status === 0,
    summary: readSummary(cwd),
    errors: failureReason(result, (line) => line.startsWith("ERROR")),
  };
}

/**
 * يقرأ أرقام التغطية الحقيقية من تقرير الحزمة — لا تقدير ولا إعادة حساب.
 * @returns سطر ملخّص عربي، أو سبب غياب التقرير
 */
function readSummary(cwd: string): string {
  const summaryPath = join(cwd, "coverage", "coverage-summary.json");
  if (!existsSync(summaryPath)) return "(لا تقرير — تحقق من تشغيل الاختبارات)";

  // noUncheckedIndexedAccess يجعل كل مفتاح في Record قابلًا لـundefined —
  // تقرير مبتور أو بصيغة أخرى يجب أن يُبلَّغ لا أن ينهار بـTypeError
  const data = JSON.parse(readFileSync(summaryPath, "utf8")) as {
    total?: Record<string, { pct: number } | undefined>;
  };
  const t = data.total;
  const pct = (key: string): string => {
    const value = t?.[key]?.pct;
    return typeof value === "number" ? `${value}%` : "؟";
  };
  return `أسطر ${pct("lines")} · عبارات ${pct("statements")} · دوال ${pct("functions")} · فروع ${pct("branches")}`;
}
