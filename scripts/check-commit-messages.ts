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
 * **commit الدمج يُعفى ببنيته لا بنصّه** (القرار #108): المعيار هو وجود أكثر
 * من أب، لا أن تبدأ الرسالة بـ`Merge `. الصيغة النصّية كانت تعفي رسالة git
 * التلقائية وحدها، فتفشل على رسالة دمج مكتوبة بالعربية تشرح **لماذا** جرى
 * الدمج — وهي أنفع من التلقائية لا أسوأ. `merge` ليست نوعًا في conventional
 * commits ولا يجوز أن تصير واحدًا لهذا السبب.
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
  // القصّ إلى 8 محارف مناسب لـSHA لا لاسم مرجع (`origin/main` كانت تُطبع `origin/m`)
  const shownRef = /^[0-9a-f]{40}$/.test(sinceRef) ? sinceRef.slice(0, 8) : sinceRef;
  // %P (الآباء) إلى جانب الموضوع: تمييز commit الدمج يكون ببنيته لا بنصّه
  const log = git(["log", "--format=%H%x00%P%x00%s", `${sinceRef}..HEAD`]);
  if (!log.ok) {
    console.error(`تعذّر قراءة سجل git مقابل ${sinceRef}:\n${log.stderr}`);
    process.exit(2);
  }

  const commits = log.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, parents, subject] = line.split("\0");
      return {
        sha: sha ?? "",
        subject: subject ?? "",
        // أكثر من أب = commit دمج، مهما كان نصّ رسالته
        isMerge: (parents ?? "").trim().split(/\s+/).filter(Boolean).length > 1,
      };
    });

  const invalid = commits.filter((c) => !c.isMerge && !CONVENTIONAL.test(c.subject));

  if (invalid.length > 0) {
    console.error(`رسائل commit لا تتبع conventional commits (المرجع: ${shownRef}):`);
    for (const c of invalid) {
      console.error(`  ${c.sha.slice(0, 8)}  ${c.subject}`);
    }
    console.error(
      "\nالصيغة: <type>(<scope>)?: <وصف>   — type من: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert"
    );
    process.exit(1);
  }

  console.log(`${commits.length} رسالة commit تتبع conventional commits (المرجع: ${shownRef})`);
}

main();
