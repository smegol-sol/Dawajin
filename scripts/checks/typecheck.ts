import { spawnSync } from "node:child_process";

/** فاحص typecheck — tsc --noEmit نظيف لكل الحزم (backend-technical-spec.md §21). */
export function checkTypecheck(): { ok: boolean; message: string } {
  const result = spawnSync("pnpm", ["-r", "run", "typecheck"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    return {
      ok: false,
      message: `tsc --noEmit فشل:\n${result.stdout}\n${result.stderr}`,
    };
  }
  return { ok: true, message: "typecheck نظيف في كل الحزم" };
}
