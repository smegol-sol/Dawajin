import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص تأكيدات التخطيط — البند المجدول في `docs/work-plan.md` §7-ب (البند 7)
 * والقرار #81. يبني مخرَج الويب الثابت ثم يشغّل تأكيدات `boundingBox()` على
 * قواعد §10 الموضعية.
 *
 * **ليس لقطة مرجعية** (مرفوضة في #81): لا صورة ثنائية، ولا حساسية لتصيير
 * الخط، ولا إعادة توليد مرجع. إحداثيات تُقارَن ببعضها فقط.
 *
 * يفشل البناء كبقية الفحوص — لا تخطٍّ صامت عند غياب متصفح: بوابة تُتخطّى
 * عند أول عائق ليست بوابة (القرار #69).
 */

const WEB_BUILD_DIR = join(process.cwd(), "apps/mobile/dist");

export function checkLayoutRtl(): { ok: boolean; message: string } {
  const build = spawnSync("pnpm", ["--filter", "@dawajin/mobile", "run", "build:web"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (build.status !== 0) {
    return {
      ok: false,
      message: `فشل بناء مخرَج الويب (expo export):\n${tail(build.stderr || build.stdout)}`,
    };
  }
  if (!existsSync(join(WEB_BUILD_DIR, "index.html"))) {
    return { ok: false, message: `مخرَج الويب غائب بعد البناء: ${WEB_BUILD_DIR}` };
  }

  const run = spawnSync("npx", ["playwright", "test"], { encoding: "utf8", stdio: "pipe" });
  if (run.status !== 0) {
    return {
      ok: false,
      message: `مخالفة قاعدة تخطيط RTL (§10):\n${tail(run.stdout || run.stderr)}`,
    };
  }

  const passed = /(\d+) passed/.exec(run.stdout)?.[1] ?? "؟";
  return { ok: true, message: `${passed} تأكيد تخطيط على قواعد §10 الموضعية — كلها خضراء` };
}

/** آخر أسطر مفيدة من مخرَج أداة — التقرير الكامل ضخم ولا يُقرأ في سجل CI. */
function tail(output: string, lines = 40): string {
  return output.split("\n").slice(-lines).join("\n");
}
