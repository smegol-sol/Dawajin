import { spawnSync } from "node:child_process";

/**
 * يفرض صيغة conventional commits على رسائل commit الجديدة فقط (القرار #64).
 * يُشغَّل في CI مقابل نطاق (base..HEAD) لا على كل التاريخ — رسائل ما قبل
 * تبنّي القاعدة لا تُعاد كتابتها (سيغيّر SHA لتاريخ مدفوع فعلًا).
 *
 * الاستخدام: tsx scripts/check-commit-messages.ts <base-ref>
 */
const CONVENTIONAL =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9\-/.]+\))?!?: .{1,}/;

function main() {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("الاستخدام: tsx scripts/check-commit-messages.ts <base-ref>");
    process.exit(2);
  }

  const result = spawnSync("git", ["log", "--format=%H%x00%s", `${baseRef}..HEAD`], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`تعذّر قراءة سجل git مقابل ${baseRef}:\n${result.stderr}`);
    process.exit(2);
  }

  const commits = result.stdout
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
    console.error("رسائل commit لا تتبع conventional commits:");
    for (const c of invalid) {
      console.error(`  ${c.sha.slice(0, 8)}  ${c.subject}`);
    }
    console.error("\nالصيغة: <type>(<scope>)?: <وصف>   — type من: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert");
    process.exit(1);
  }

  console.log(`✓ ${commits.length} رسالة commit تتبع conventional commits`);
}

main();
