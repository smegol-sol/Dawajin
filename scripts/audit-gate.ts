import { spawnSync } from "node:child_process";

/**
 * بوابة الثغرات — §7-ب البند 41، والحكم الثاني في القرار 209، والتنفيذ 219.
 *
 * > **تُسقط البناء على الحرج والعالي وحدهما لا على كل ثغرة.**
 *
 * **والعلّة نصّ 209:** بوابةٌ تسقط على كل ثغرة **تسقط يوميًّا على ثغرةٍ في
 * أداة تطوير لا تصل الإنتاج** — **فيُعطَّل أول من يمرّ بها، وبوابةٌ تُعطَّل
 * مرة تُعطَّل دائمًا**.
 *
 * **ومعها قائمة استثناءات صريحة — لكل تنبيه معرّفه وعلّته وشرط رفعه** — على
 * نمط استثناءات `scripts/checks/composite-fk.ts`. **والعلّة أن
 * `pnpm audit --audit-level=high` يخرج اليوم برمز ١** (مقيسٌ لا مفترَض):
 * **فبوابةٌ بلا استثناءات حمراء من أول يوم**، **وحمرةٌ دائمة تُقرأ عطلًا لا
 * إنذارًا**.
 *
 * **وليست في `check:all`** — بل خطوة في `ci.yml` تستدعي هذا السكربت.
 * **والعلّة أن `audit` يحتاج شبكة**، و`check:all` **يُشغَّل محليًّا قبل كل
 * التزام وبلا شبكة أحيانًا** (القاعدة 145 تربطه بـ`&&`) — **فبوابةٌ تسقط لأن
 * المطوّر في قطار تُدرَّب على التخطّي**. **وما يُخسر: الإنذار يصل عند الدفع
 * لا قبل الالتزام** — **وهي خسارة مقبولة لأن الثغرة لا تُحدثها التزامتنا بل
 * تُكتشف في تبعية قائمة**، فلا فرق بين أن تُكشف قبل الالتزام أو بعده بدقائق.
 */

interface Advisory {
  github_advisory_id?: string;
  id?: number | string;
  module_name: string;
  severity: string;
  title?: string;
  findings?: { paths?: string[] }[];
}

/**
 * **الاستثناءات — قائمة موجبة بمعرّف وعلّة وشرط رفع، لا وسمُ «تجاهل».**
 *
 * **وكلها مقيسة يوم كُتبت** (مسارات `pnpm audit` لا تقدير): **أربعةٌ لا تبلغ
 * إلا `apps/mobile`**، **وواحدٌ يبلغ حزم الخادم ويُسمّى بذلك صراحةً**.
 */
const ALLOWED: Record<string, { why: string; liftWhen: string }> = {
  "GHSA-fx2h-pf6j-xcff": {
    why:
      "vite 5.4.21 عبر vitest 3.2.7 — **يبلغ apps/api و packages/shared** (١٢ مسارًا مقيسًا)، " +
      "**لكنه أداة اختبار لا تُشحن**: `vite` لا يدخل حزمة الخادم المبنيّة (`esbuild --packages=external`) " +
      "ولا يعمل خادمُ تطويره في CI ولا في الإنتاج. والثغرة تجاوزُ `server.fs.deny` على Windows، " +
      "**وخادم vite لا يُشغَّل عندنا أصلًا**",
    liftWhen:
      "ترقية vitest إلى 4.x — تسحب vite ≥6 (المُصلَح ≥6.4.3) فيسقط هذا التنبيه ومعه esbuild 0.21.5. " +
      "**ولم تُرقَّ في دفعة 219 عمدًا**: قفزة رئيسية ثالثة بعد 2→3 في القرار 216، ولها دفعتها",
  },
  "GHSA-6g55-p6wh-862q": {
    why: "postcss عبر سلسلة Expo/Metro — **٣٨ مسارًا كلها `apps/mobile`، وصفرٌ في حزم الخادم** (مقيس). أداةُ بناءٍ للتطبيق لا تصل خادمًا ولا جهاز مستخدم",
    liftWhen: "ترقية سلسلة Expo — ولها دفعتها المستقلة (تمسّ التطبيق كله)",
  },
  "GHSA-r28c-9q8g-f849": {
    why: "postcss — نفس السلسلة ونفس القياس: ٣٨ مسارًا كلها `apps/mobile`",
    liftWhen: "ترقية سلسلة Expo",
  },
  "GHSA-w3rx-r6r6-pgpr": {
    why: "image-size عبر سلسلة Expo — **٩٠٠ مسار كلها `apps/mobile`، وصفرٌ في حزم الخادم**. وهي منعُ خدمة عند تحليل صورة، وأداةُ البناء لا تحلّل مدخلات مستخدم",
    liftWhen: "ترقية سلسلة Expo",
  },
  "GHSA-5p2g-fcmc-qvqq": {
    why: "image-size — نفس السلسلة ونفس القياس",
    liftWhen: "ترقية سلسلة Expo",
  },
};

const BLOCKING = new Set(["critical", "high"]);

function advisoryId(a: Advisory): string {
  return a.github_advisory_id ?? String(a.id ?? "?");
}

function main(): void {
  const result = spawnSync("pnpm", ["audit", "--json"], { encoding: "utf8", stdio: "pipe" });
  if (!result.stdout) {
    console.error("بوابة الثغرات: تعذّر تشغيل `pnpm audit` — لا مخرَج.");
    console.error(result.stderr);
    process.exit(1);
  }

  let advisories: Advisory[];
  try {
    advisories = Object.values(
      (JSON.parse(result.stdout) as { advisories?: Record<string, Advisory> }).advisories ?? {}
    );
  } catch {
    // **الشبكة أو صيغةٌ غير متوقَّعة تُسقط البوابة ولا تُمرَّر صامتة** —
    // بوابةٌ تخضرّ حين تعجز عن القياس ليست بوابة.
    console.error("بوابة الثغرات: مخرَج `pnpm audit` غير قابل للتحليل — تُعامَل سقوطًا لا نجاحًا.");
    process.exit(1);
  }

  const blocking = advisories.filter((a) => BLOCKING.has(a.severity));
  const unlisted = blocking.filter((a) => !(advisoryId(a) in ALLOWED));
  const listedIds = new Set(blocking.map(advisoryId));
  const stale = Object.keys(ALLOWED).filter((id) => !listedIds.has(id));

  console.log(
    `بوابة الثغرات: ${String(advisories.length)} تنبيهًا، منها ${String(blocking.length)} حرجة/عالية ` +
      `— ${String(blocking.length - unlisted.length)} مستثناة بعلّة و${String(unlisted.length)} خارج القائمة.`
  );

  if (stale.length > 0) {
    // **تُعرَض ولا تُسقط البناء** (تمييز القرار 206): استثناءٌ زال خطرُه
    // **خبرٌ سارّ**، وإسقاط البناء عليه يُدرِّب على تعديل القائمة انعكاسًا.
    console.log(
      `\n  واستثناءات لم تعد لها تنبيهات — تُحذف من القائمة (لا تُسقط البناء): ${stale.join(" · ")}`
    );
  }

  if (unlisted.length === 0) {
    process.exit(0);
  }

  console.error(`\n✗ ${String(unlisted.length)} ثغرة حرجة/عالية خارج قائمة الاستثناءات:`);
  for (const a of unlisted) {
    const paths = [...new Set((a.findings ?? []).flatMap((f) => f.paths ?? []))];
    const server = paths.filter((p) => !p.startsWith("apps/mobile"));
    console.error(
      `\n  ${advisoryId(a)}  ${a.module_name} (${a.severity})\n` +
        `    ${a.title ?? ""}\n` +
        `    مسارات: ${String(paths.length)} — منها ${String(server.length)} في حزم الخادم`
    );
    if (server.length > 0) console.error(`    مثال: ${server[0] ?? ""}`);
  }
  console.error(
    "\n**العلاج ترقيةٌ تُغلقها، أو استثناءٌ في `ALLOWED` بعلّته وشرط رفعه** — " +
      "**ولا يُضاف استثناء بلا قياس: أيّ حزمة تبلغها، وهل تصل الإنتاج.**"
  );
  process.exit(1);
}

main();
