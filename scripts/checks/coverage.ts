import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص التغطية — يشغّل تغطية apps/api (وحدة+تكامل) وpackages/shared وapps/mobile
 * كل حزمة داخل جذرها (القرار #63 — قياس تغطية عبر حدود حزم monorepo من جذر
 * واحد لا يعمل مع v8 provider، مُثبَت أثناء البناء). vitest نفسه يفشل بخروج
 * غير صفري عند نزول أي حد عن عتبته (عام أو لملف مُسمّى)، فهذا الفحص يعتمد
 * على ذلك، ثم يعرض الأرقام الحقيقية — لا تقدير.
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
    const failures = [
      !api.ok ? api.errors : "",
      !shared.ok ? shared.errors : "",
      !mobile.ok ? mobile.errors : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { ok: false, message: `التغطية دون الحد المطلوب:\n${message}\n${failures}` };
  }
  return { ok: true, message };
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
    errors: result.stderr
      .split("\n")
      .filter((l) => l.includes("coverage threshold"))
      .join("\n"),
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

  const summary = readSummary(cwd);

  const errors = result.stdout
    .split("\n")
    .filter((l) => l.startsWith("ERROR"))
    .join("\n");

  return { ok: result.status === 0, summary, errors };
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
