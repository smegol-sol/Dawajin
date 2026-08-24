/**
 * الفحوص الآلية الستة — تفشل البناء، لا تحذيرات (backend-technical-spec.md §21).
 * تُشغَّل محليًا وفي CI على كل PR بدءًا من المرحلة 0 (docs/work-plan.md §2).
 */
import { checkDuplicateRoutes } from "./checks/duplicate-routes.js";
import { checkOpenApiCoverage } from "./checks/openapi-coverage.js";
import { checkDesignTokens } from "./checks/design-tokens.js";
import { checkNavCoverage } from "./checks/nav-coverage.js";
import { checkEnumUsage } from "./checks/enum-usage.js";
import { checkTypecheck } from "./checks/typecheck.js";

const checks: Array<{ name: string; run: () => { ok: boolean; message: string } }> = [
  { name: "المسارات المكررة", run: checkDuplicateRoutes },
  { name: "تغطية OpenAPI", run: checkOpenApiCoverage },
  { name: "رموز التصميم", run: checkDesignTokens },
  { name: "تغطية التنقل", run: checkNavCoverage },
  { name: "صحة enum", run: checkEnumUsage },
  { name: "typecheck", run: checkTypecheck },
];

let allOk = true;

for (const check of checks) {
  const result = check.run();
  const icon = result.ok ? "✓" : "✗";
  console.log(`\n${icon} ${check.name}`);
  console.log(`  ${result.message.replaceAll("\n", "\n  ")}`);
  if (!result.ok) allOk = false;
}

console.log(`\n${allOk ? "✓ كل الفحوص الستة نجحت" : "✗ فشل فحص واحد أو أكثر"}`);
process.exit(allOk ? 0 : 1);
