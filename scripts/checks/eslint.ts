import { spawnSync } from "node:child_process";

/**
 * فاحص ESLint — strict-type-checked + قواعد المشروع المخصصة (القرار #61).
 * يفشل البناء لا يحذّر (طلب صريح: "بحيث يفشل البناء لا يحذّر").
 */
export function checkEslint(): { ok: boolean; message: string } {
  const result = spawnSync(
    "npx",
    ["eslint", "apps/api/src", "packages/db/src", "packages/shared/src"],
    { encoding: "utf8", stdio: "pipe" }
  );

  if (result.status !== 0) {
    return { ok: false, message: `ESLint فشل:\n${result.stdout}\n${result.stderr}` };
  }
  return { ok: true, message: "ESLint نظيف (strict-type-checked + قواعد المشروع)" };
}
