/**
 * الفحوص الآلية — تفشل البناء، لا تحذيرات (backend-technical-spec.md §21).
 * تُشغَّل محليًا وفي CI على كل PR بدءًا من المرحلة 0 (docs/work-plan.md §2).
 * ستة أصلية + سبعة أضيفت لاحقًا (ESLint، Prettier، التغطية — القرار #61/#63،
 * تأكيدات تخطيط RTL — القرار #81، والشعار مصدر واحد — القرار #109، والمفتاح
 * المركَّب — القرار 206، وسلسلة الترحيلات — القرار 215).
 *
 * **و«المفتاح المركَّب» أولها قراءةً من القاعدة لا من المصدر** — والأحد عشر
 * قبله تقرأ ملفات المستودع. **والفرق مقصود: هي القاعدة الوحيدة هنا التي تحرس
 * صفوفًا لا ملفات**، ومفتاحٌ مركَّب مكتوب في المخطط ولم يصل القاعدة يحمي صفرًا
 * من الصفوف. **فيلزم أن تكون قاعدة الاختبار مهجَّرة قبل `check:all`** — كما
 * يفعل `ci.yml` في خطوتين منفصلتين، **والفاحص يتحقق من ذلك ولا يفترضه**.
 */
import { checkCompositeFk } from "./checks/composite-fk";
import { checkCoverage } from "./checks/coverage";
import { checkDesignTokens } from "./checks/design-tokens";
import { checkDuplicateRoutes } from "./checks/duplicate-routes";
import { checkEnumUsage } from "./checks/enum-usage";
import { checkEslint } from "./checks/eslint";
import { checkLayoutRtl } from "./checks/layout-rtl";
import { checkLogoSingleSource } from "./checks/logo-single-source";
import { checkMigrationChain } from "./checks/migration-chain";
import { checkNavCoverage } from "./checks/nav-coverage";
import { checkOpenApiCoverage } from "./checks/openapi-coverage";
import { checkPrettier } from "./checks/prettier";
import { checkTypecheck } from "./checks/typecheck";

interface CheckResult {
  ok: boolean;
  message: string;
}
type CheckFn = () => CheckResult | Promise<CheckResult>;

const checks: { name: string; run: CheckFn }[] = [
  { name: "المسارات المكررة", run: checkDuplicateRoutes },
  { name: "تغطية OpenAPI", run: checkOpenApiCoverage },
  { name: "رموز التصميم", run: checkDesignTokens },
  { name: "تغطية التنقل", run: checkNavCoverage },
  { name: "صحة enum", run: checkEnumUsage },
  { name: "المفتاح المركَّب", run: checkCompositeFk },
  { name: "سلسلة الترحيلات", run: checkMigrationChain },
  { name: "الشعار مصدر واحد", run: checkLogoSingleSource },
  { name: "typecheck", run: checkTypecheck },
  { name: "ESLint", run: checkEslint },
  { name: "Prettier", run: checkPrettier },
  { name: "التغطية", run: checkCoverage },
  { name: "تأكيدات تخطيط RTL", run: checkLayoutRtl },
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

// خطأ غير متوقَّع داخل أي فاحص يجب أن يُفشل البناء بوضوح لا أن يمر
// كوعد مرفوض صامت (unhandled rejection)
main().catch((error: unknown) => {
  console.error("فشل غير متوقَّع أثناء تشغيل الفحوص:", error);
  process.exit(1);
});
