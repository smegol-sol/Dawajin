import { spawnSync } from "node:child_process";

/**
 * فاحص typecheck — `tsc --noEmit` نظيف لكل الحزم **ولأدوات المستودع**
 * (backend-technical-spec.md §21).
 *
 * `pnpm -r run typecheck` وحده يغطّي الحزم الأربع فقط، وكان يترك مجلد
 * `scripts` وملفات إعداد vitest خارج أي tsconfig — 21 ملفًا لم يُفحص أي
 * منها ولا مرة منذ المرحلة صفر (اكتُشف عند توسيع نطاق ESLint، القرار
 * #65). tsconfig.json الجذري يغطّيها الآن، ويُفحص هنا صراحةً.
 */
export function checkTypecheck(): { ok: boolean; message: string } {
  const packages = spawnSync("pnpm", ["-r", "run", "typecheck"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (packages.status !== 0) {
    return {
      ok: false,
      message: `tsc --noEmit فشل في الحزم:\n${packages.stdout}\n${packages.stderr}`,
    };
  }

  const tools = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (tools.status !== 0) {
    return {
      ok: false,
      message: `tsc --noEmit فشل في أدوات المستودع (scripts/ وملفات vitest.config):\n${tools.stdout}\n${tools.stderr}`,
    };
  }

  return { ok: true, message: "typecheck نظيف في كل الحزم وفي أدوات المستودع (scripts/)" };
}
