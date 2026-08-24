import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص التغطية — يشغّل تغطية apps/api (وحدة+تكامل) وpackages/shared (وحدة)
 * كل حزمة داخل جذرها (القرار #63 — قياس تغطية عبر حدود حزم monorepo من جذر
 * واحد لا يعمل مع v8 provider، مُثبَت أثناء البناء). vitest نفسه يفشل بخروج
 * غير صفري عند نزول أي حد عن عتبته (عام أو لملف مُسمّى)، فهذا الفحص يعتمد
 * على ذلك، ثم يعرض الأرقام الحقيقية — لا تقدير.
 */
export function checkCoverage(): { ok: boolean; message: string } {
  const api = runCoverage("apps/api", "vitest.coverage.config.ts");
  const shared = runCoverage("packages/shared", "vitest.config.ts");

  const ok = api.ok && shared.ok;
  const message = [`apps/api: ${api.summary}`, `packages/shared: ${shared.summary}`].join("\n");

  if (!ok) {
    const failures = [!api.ok ? api.errors : "", !shared.ok ? shared.errors : ""]
      .filter(Boolean)
      .join("\n");
    return { ok: false, message: `التغطية دون الحد المطلوب:\n${message}\n${failures}` };
  }
  return { ok: true, message };
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

  const summaryPath = join(cwd, "coverage", "coverage-summary.json");
  let summary = "(لا تقرير — تحقق من تشغيل الاختبارات)";
  if (existsSync(summaryPath)) {
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
    summary = `أسطر ${pct("lines")} · عبارات ${pct("statements")} · دوال ${pct("functions")} · فروع ${pct("branches")}`;
  }

  const errors = result.stdout
    .split("\n")
    .filter((l) => l.startsWith("ERROR"))
    .join("\n");

  return { ok: result.status === 0, summary, errors };
}
