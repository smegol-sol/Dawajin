/**
 * الفحوص الآلية — تفشل البناء، لا تحذيرات (backend-technical-spec.md §21).
 * تُشغَّل محليًا وفي CI على كل PR بدءًا من المرحلة 0 (docs/work-plan.md §2).
 * ستة أصلية + ثلاثة أضيفت لاحقًا (ESLint، Prettier، التغطية — القرار #61/#63).
 */
import { checkDuplicateRoutes } from "./checks/duplicate-routes";
import { checkOpenApiCoverage } from "./checks/openapi-coverage";
import { checkDesignTokens } from "./checks/design-tokens";
import { checkNavCoverage } from "./checks/nav-coverage";
import { checkEnumUsage } from "./checks/enum-usage";
import { checkTypecheck } from "./checks/typecheck";
import { checkEslint } from "./checks/eslint";
import { checkPrettier } from "./checks/prettier";
import { checkCoverage } from "./checks/coverage";

type CheckResult = { ok: boolean; message: string };
type CheckFn = () => CheckResult | Promise<CheckResult>;

const checks: Array<{ name: string; run: CheckFn }> = [
  { name: "المسارات المكررة", run: checkDuplicateRoutes },
  { name: "تغطية OpenAPI", run: checkOpenApiCoverage },
  { name: "رموز التصميم", run: checkDesignTokens },
  { name: "تغطية التنقل", run: checkNavCoverage },
  { name: "صحة enum", run: checkEnumUsage },
  { name: "typecheck", run: checkTypecheck },
  { name: "ESLint", run: checkEslint },
  { name: "Prettier", run: checkPrettier },
  { name: "التغطية", run: checkCoverage },
];

async function main() {
  let allOk = true;

  for (const check of checks) {
    const result = await check.run();
    const icon = result.ok ? "✓" : "✗";
    console.log(`\n${icon} ${check.name}`);
    console.log(`  ${result.message.replaceAll("\n", "\n  ")}`);
    if (!result.ok) allOk = false;
  }

  console.log(`\n${allOk ? `✓ كل الفحوص الـ${checks.length} نجحت` : "✗ فشل فحص واحد أو أكثر"}`);
  process.exit(allOk ? 0 : 1);
}

main();
