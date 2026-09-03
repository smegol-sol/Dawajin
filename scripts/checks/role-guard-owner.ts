import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * فاحص «حارس الدور يذكر المالك» — **يفشل البناء عند أي `requireRole` يذكر
 * دورًا غير المالك ولا يذكر المالك معه** (القرار 235 §٦، ونمط 218: الحارس
 * يصف نفسه).
 *
 * **والعلّة صنفُ عطبٍ وقع فعلًا لا احتمالٌ نظريّ:** `requireRole("supervisor")`
 * وحده في مسار إصدار التحويل **حجب المالك عن حركةٍ يملكها** — وهو ما عالجه
 * القرار 232. **والمالك لا يُقيَّد بالإسناد في أي مسار** (`FULL_VISIBILITY_ROLES`)،
 * **فحصرُ صلاحيةٍ في دورٍ دونه شذوذٌ لا تضييق**.
 *
 * **وموضعُه الآن لا بعدُ:** الدفعة التي بنته أزالت **آخر مخالفة قائمة**،
 * **فالقاعدة تُقفل وهي نظيفة** — **وتأجيلُه يعني أن تُكتب المخالفة التالية بلا
 * كلفة** (درس 206: «العلّة أن مخالفتها لم تكلّف شيئًا»). **والصلاحيات التي
 * لم تُبنَ بعد سبعٌ** (235 §٤-ب)، وكلٌّ منها موضعُ تكرارٍ محتمل.
 *
 * **والاستثناءات قائمة موجبة بعلّتها هنا** — **ومسارٌ جديد لا يُستثنى بالسكوت**
 * (نمط `composite-fk`، والقرار 184). **وكانت فارغة يوم بُني الفاحص**، **وفيها
 * اليوم واحدٌ بعلّته**: مصادقةُ الشحنة، **حيث يمنع المبدأُ #155 المالكَ من
 * مراجعة نفسه** (القرار 275).
 */

const API_SRC = join(process.cwd(), "apps/api/src");

/** `requireRole("a", "b", …)` — الأدوار المكتوبة حرفيًّا داخل الاستدعاء. */
const REQUIRE_ROLE = /requireRole\(\s*((?:"[^"]*"\s*,?\s*)+)\)/g;

/**
 * **استثناءات بعلّتها — قائمة موجبة.** المفتاح `مسار_نسبيّ:رقم_السطر`.
 * **وإضافةُ سطرٍ إليها تُوجب علّةً مكتوبة بجانبه.**
 *
 * **واتجاهُ خطأ المفتاح مُعلَن** (القرار 270): **المفتاح برقم السطر**، فسطرٌ
 * ينزاح **يُبطل الاستثناء فيفشل البناء ظلمًا** — **وهو الاتجاه المقبول**،
 * يُكتشف في أول تشغيل ويُعاد تبريره. **ويفوته عكسُه:** `requireRole` **آخر
 * يحلّ محلّ المستثنى في نفس السطر يرثه صامتًا** — **مرورٌ ظلمًا**، ويحدّه أن
 * القائمة قصيرةٌ تُقرأ بالعين.
 */
const EXCEPTIONS = new Map<string, string>([
  [
    "apps/api/src/routes/chickShipments.ts:169",
    "**المصادقة على الشحنة وتوزيعها — والمالك `❌` صراحةً لا سكوتًا** (القرار 160 «عاشرًا» ٩): " +
      "**هو من يُدخل الشحنة، فمصادقتُه عليها مصادقةٌ على نفسه** — نقضٌ للمبدأ #155 «من يُدخل " +
      "رصيدًا لا يصادق عليه». **فهذا منعٌ مبرَّر لا حجبُ صلاحيةٍ عن مالكها**، وهو الفرق الذي " +
      "أُنشئت له علامة `؟` في §12.2. **والقرار 235 §٦ يعطي المالكَ كلَّ دور ولا يعطيه دورَ " +
      "المراجع على نفسه.**",
  ],
  [
    "apps/api/src/routes/chickShipments.ts:98",
    "**تأكيد استلام حصة الكتاكيت — «مربّي كل عنبر يؤكد استلام حصته»** (القرار 160 «أولًا»، " +
      "و§12.2: `✅ عنابره` للمربّي و`❌` لما سواه). **والتأكيد عدٌّ ميدانيّ يقع بيد من وقف " +
      "أمام الصناديق** — **ولا ينوب عنه المالك ولا المشرف**، لأن نيابتَهما تجعل الرقم " +
      "شهادةَ من لم يعدّ. **وهو حدُّ الدور لا حجبُ صلاحية**: المالك يرى الشحنة وتوزيعاتها " +
      "كاملةً في مسار القراءة (القرار 276).",
  ],
  [
    "apps/api/src/routes/dailyLogs.ts:66",
    "**إنشاء السجل اليومي — «✅ عنابره» للمربّي و`❌` لما سواه** (§12.2). **والسجلّ بيانُ من كان " +
      "في العنبر**: النفوقُ عدٌّ، والعلفُ تقديرُ من رآه، والوزنُ عيّنةٌ سُحبت بيد — **ونيابةُ " +
      "غيره تجعل السجلَّ الميدانيّ شهادةَ من لم يحضر**، **وهو سجلٌّ لا يُعدَّل بعدها**. " +
      "**وحدُّ دورٍ لا حجبُ صلاحية**: المالك يقرأ ويراجع ويعتمد، ولا يكتب اليوم عن المربّي.",
  ],
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

export function checkRoleGuardOwner(): { ok: boolean; message: string } {
  const violations: string[] = [];
  let checked = 0;
  const files = new Set<string>();

  for (const file of walk(API_SRC)) {
    const relPath = relative(process.cwd(), file);
    // تعريف الوسيط نفسه لا استدعاؤه
    if (relPath.endsWith("middleware/requireRole.ts")) continue;
    const content = readFileSync(file, "utf8");

    for (const match of content.matchAll(REQUIRE_ROLE)) {
      const inner = match[1];
      if (inner === undefined) continue;
      const roles = [...inner.matchAll(/"([^"]*)"/g)]
        .map((m) => m[1])
        .filter((r): r is string => r !== undefined);
      if (roles.length === 0) continue;
      checked += 1;
      files.add(relPath);

      const line = content.slice(0, match.index).split("\n").length;
      const key = `${relPath}:${String(line)}`;
      if (roles.includes("owner")) continue;
      if (EXCEPTIONS.has(key)) continue;

      // **الرسالة تسمّي الملف والسطر والقائمة المكتوبة** لا «مخالفة في
      // الأدوار» (القرار #143): من يقرأ السقوط يعرف ما يكتبه.
      violations.push(
        `${key}: requireRole(${roles.map((r) => `"${r}"`).join(", ")}) — ` +
          `بلا "owner". **المالك مع كل دور** (القرار 235 §٦)؛ ` +
          `فإن كان لهذا المسار عذرٌ فأضِفه إلى EXCEPTIONS بعلّته.`
      );
    }
  }

  if (violations.length > 0) {
    return {
      ok: false,
      message: `حارسُ دورٍ يحجب المالك:\n  - ${violations.join("\n  - ")}`,
    };
  }
  return {
    ok: true,
    message:
      `${String(checked)} استدعاء \`requireRole\` في ${String(files.size)} ملفًا — ` +
      `كلها تذكر المالك (${String(EXCEPTIONS.size)} استثناء)`,
  };
}
