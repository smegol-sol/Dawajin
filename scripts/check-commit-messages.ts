import { spawnSync } from "node:child_process";

/**
 * يفرض صيغة conventional commits على رسائل commit الجديدة فقط (القرار #64).
 *
 * المرجع مثبَّت عند commit إدخال القاعدة نفسها، لا عند قاعدة الـPR: نطاق
 * `origin/main..HEAD` يشمل كل تاريخ الفرع بما فيه ما سبق وجود القاعدة،
 * فتفشل البوابة على رسائل لم تكن القاعدة موجودة أصلًا حين كُتبت — وهذا
 * ما حدث فعليًا على الدفعة التي أدخلت البوابة (فشلت على نفسها). إعادة
 * كتابة تلك الرسائل مرفوضة: تغيّر كل SHA لتاريخ مدفوع فعلًا.
 *
 * الاستخدام: tsx scripts/check-commit-messages.ts <base-ref>
 */
const CONVENTIONAL =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9\-/.]+\))?!?: .{1,}/;

/** commit إدخال بوابة conventional commits — كل ما قبله (وهو نفسه) معفى. */
const RULE_ADOPTED_COMMIT = "8fd45461b754c0e7d0a18344c9351ff1dd1a6f24";

function git(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr };
}

/**
 * يحدّد المرجع الذي تُفحص الرسائل بعده.
 * @returns commit تبنّي القاعدة إن كان ضمن تاريخ HEAD، وإلا قاعدة الـPR
 *   (فرع جديد كليًا من main — كل رسائله جديدة فتخضع كلها للقاعدة)
 */
function resolveSinceRef(baseRef: string): string {
  const known = git(["cat-file", "-e", `${RULE_ADOPTED_COMMIT}^{commit}`]).ok;
  if (!known) return baseRef;
  const isAncestor = git(["merge-base", "--is-ancestor", RULE_ADOPTED_COMMIT, "HEAD"]).ok;
  return isAncestor ? RULE_ADOPTED_COMMIT : baseRef;
}

function main(): void {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("الاستخدام: tsx scripts/check-commit-messages.ts <base-ref>");
    process.exit(2);
  }

  const sinceRef = resolveSinceRef(baseRef);
  const log = git(["log", "--format=%H%x00%s", `${sinceRef}..HEAD`]);
  if (!log.ok) {
    console.error(`تعذّر قراءة سجل git مقابل ${sinceRef}:\n${log.stderr}`);
    process.exit(2);
  }

  const commits = log.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\0");
      return { sha: sha ?? "", subject: subject ?? "" };
    });

  const invalid = commits.filter(
    // دمج الفروع يولّد رسالة تلقائية لا يتحكم بها الكاتب
    (c) => !c.subject.startsWith("Merge ") && !CONVENTIONAL.test(c.subject)
  );

  if (invalid.length > 0) {
    console.error(`رسائل commit لا تتبع conventional commits (المرجع: ${sinceRef.slice(0, 8)}):`);
    for (const c of invalid) {
      console.error(`  ${c.sha.slice(0, 8)}  ${c.subject}`);
    }
    console.error(
      "\nالصيغة: <type>(<scope>)?: <وصف>   — type من: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert"
    );
    process.exit(1);
  }

  console.log(
    `${commits.length} رسالة commit تتبع conventional commits (المرجع: ${sinceRef.slice(0, 8)})`
  );
}

main();
