import { spawnSync } from "node:child_process";

/**
 * فاحص Prettier — التنسيق مفروض في CI، لا نقاش تنسيق في المراجعات
 * (القرار #61).
 */
export function checkPrettier(): { ok: boolean; message: string } {
  const result = spawnSync(
    "npx",
    ["prettier", "--check", "apps/api/src", "packages/db/src", "packages/shared/src"],
    { encoding: "utf8", stdio: "pipe" }
  );

  if (result.status !== 0) {
    return {
      ok: false,
      message: `تنسيق غير مطابق لـ Prettier — شغّل npx prettier --write:\n${result.stdout}\n${result.stderr}`,
    };
  }
  return { ok: true, message: "التنسيق مطابق لـ Prettier" };
}
