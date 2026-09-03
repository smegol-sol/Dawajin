import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * فاحص طوابع سجلّ الترحيلات — **يمنع ترحيلًا يُتخطّى صامتًا** (القرار 277).
 *
 * > **مهاجرُ drizzle يطبّق ترحيلًا واحدًا بشرط `lastApplied < folderMillis`**
 * > (`pg-core/dialect.js`) — **فطابعٌ لا يزيد على سابقه يجعل صاحبَه يُتخطّى
 * > بلا رسالة خطأ ولا رمز خروج**.
 *
 * **والعلّة واقعة لا فرضية:** `when` للترحيل 0032 كُتب بيدٍ **رقمًا مستقبليًّا**
 * (`1788500000000`، بعد وقت الكتابة بنحو سبعٍ وعشرين ساعة)، **فالمولَّد بعده
 * بطابعٍ حقيقيّ صار «أقدم» منه فلم يُطبَّق** — **واكتُشف بسقوط اختبارٍ بـ500 لا
 * بفاحص**.
 *
 * **وأخطر ما في العطب أنه نائم:** **مرّت دفعتُه خضراء لأنه كان آخر ترحيل، فلا
 * شيء بعده ليُتخطّى** — **فيظهر في دفعةٍ لاحقةٍ بريئةٍ منه**، ويُقرأ عطبًا
 * فيها.
 *
 * ## شرطان لا واحد — وكلٌّ يسدّ عمى الآخر
 *
 * **١. الطابع لا يقع في المستقبل** — يمسك العطبَ **في دفعته** لا في التي
 * بعدها.
 * **٢. والطوابع تتزايد تزايدًا صارمًا** — يمسك طابعًا ماضيًا كُتب أصغر من
 * سابقه، **وهو ما لا يراه الشرط الأول**. **والمساواة تسقط كالنقصان**: الشرط
 * `<` صارم، فطابعان متساويان يعنيان تخطّي الثاني.
 *
 * **ولم يُفرَد الشرطان في فاحصَين** — **جولةٌ واحدة على المصفوفة نفسها**،
 * والفصل يضاعف القراءة بلا مكسب.
 *
 * ## اتجاه الخطأ — مُعلَن (القرار 270)
 *
 * **يفشل ظلمًا** حين تكون ساعةُ المولِّد متقدّمةً على ساعة المُشغِّل فيبدو
 * طابعٌ مشروع مستقبليًّا — **وهو الاتجاه المقبول**: يوقف البناء فيُصحَّح الرقم
 * أو تُضبط الساعة. **وهامشُ `CLOCK_SKEW_MS` يمتصّ الانحراف الصغير ولا يمتصّ
 * رقمًا مخترَعًا.**
 *
 * **ويمرّ ظلمًا في موضعٍ واحد مسمًّى:** **لا يقرأ القاعدة**، فلا يرى ترحيلًا
 * تُخطّي فعلًا في قاعدةٍ قائمة لسببٍ آخر — **وذاك يمسكه فاحصُ المفتاح المركَّب**
 * بمقارنة عدد المطبَّق بعدد السجلّ. **فطبقتان لا واحدة: هذه تحرس الملفات،
 * وتلك تحرس القاعدة.**
 *
 * **ولا يراه `drizzle-kit check`** — يفحص سلسلة اللقطات (`prevId`) لا ترتيب
 * الطوابع، **وقد كان أخضر والعطب قائم**.
 */

const JOURNAL_PATH = join(process.cwd(), "packages/db/migrations/meta/_journal.json");

/** هامشُ انحراف الساعات — دقيقتان. **يمتصّ الانحراف ولا يمتصّ رقمًا مخترَعًا.** */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

interface CheckResult {
  ok: boolean;
  message: string;
}

/**
 * يحكم على مصفوفة القيود — **دالّة خالصة كي يُثبت الفاحص نفسه عليها**.
 * @returns قائمة المخالفات، فارغةً حين لا مخالفة
 */
export function judgeJournal(entries: readonly JournalEntry[], nowMs: number): string[] {
  const problems: string[] = [];
  let previous: JournalEntry | undefined;
  for (const entry of entries) {
    if (entry.when > nowMs + CLOCK_SKEW_MS) {
      problems.push(
        `\`${entry.tag}\` طابعُه في المستقبل (${String(entry.when)}) — ` +
          `**فكلُّ ترحيلٍ يُولَّد بعده يصير «أقدم» منه فيُتخطّى صامتًا**.`
      );
    }
    if (previous !== undefined && entry.when <= previous.when) {
      problems.push(
        `\`${entry.tag}\` طابعُه (${String(entry.when)}) لا يزيد على \`${previous.tag}\` ` +
          `(${String(previous.when)}) — **والمهاجر يشترط الزيادة الصارمة، فيتخطّاه**.`
      );
    }
    previous = entry;
  }
  return problems;
}

/** براهينُ الفاحص على نفسه — **عالمٌ مصطنع لا يقرأ المستودع**. */
const PROOFS: { label: string; entries: JournalEntry[]; now: number; expect: number }[] = [
  {
    label: "سليمٌ متزايد ← لا مخالفة",
    entries: [
      { idx: 0, when: 100, tag: "a" },
      { idx: 1, when: 200, tag: "b" },
    ],
    now: 1_000,
    expect: 0,
  },
  {
    label: "طابعٌ مستقبليّ ← مخالفة",
    entries: [{ idx: 0, when: 10_000_000, tag: "a" }],
    now: 1_000,
    expect: 1,
  },
  {
    label: "طابعان متساويان ← مخالفة (الشرط صارم)",
    entries: [
      { idx: 0, when: 100, tag: "a" },
      { idx: 1, when: 100, tag: "b" },
    ],
    now: 1_000,
    expect: 1,
  },
  {
    label: "ماضٍ أصغر من سابقه ← مخالفة لا يراها شرطُ المستقبل",
    entries: [
      { idx: 0, when: 200, tag: "a" },
      { idx: 1, when: 100, tag: "b" },
    ],
    now: 1_000,
    expect: 1,
  },
];

function runProofs(): string[] {
  const failures: string[] = [];
  for (const proof of PROOFS) {
    const found = judgeJournal(proof.entries, proof.now).length;
    if (found !== proof.expect) {
      failures.push(
        `برهانٌ سقط — ${proof.label}: توقُّع ${String(proof.expect)} وجاء ${String(found)}`
      );
    }
  }
  return failures;
}

/**
 * يفحص طوابع `_journal.json` — **مستقبليّ أو غير متزايد يُسقط البناء**.
 * @returns نتيجة الفحص برسالةٍ تسمّي الترحيل وطابعه عند السقوط
 */
export function checkMigrationJournal(): CheckResult {
  const proofFailures = runProofs();
  if (proofFailures.length > 0) {
    return { ok: false, message: `الفاحص لم يُثبت نفسه:\n  - ${proofFailures.join("\n  - ")}` };
  }

  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as { entries: JournalEntry[] };
  const problems = judgeJournal(journal.entries, Date.now());

  if (problems.length > 0) {
    return {
      ok: false,
      message:
        `${String(problems.length)} مخالفة في طوابع سجلّ الترحيلات:\n- ${problems.join("\n- ")}\n\n` +
        "**والعلاج تصحيحُ `when` ليقع بين جارَيه** — **لا يُخترع رقمًا**؛ " +
        "**وقاعدةٌ طُبّق عليها الترحيل بالطابع القديم تُعاد بناؤها** " +
        "(الترحيلات ثم جدول العلامة)، فسجلُّ `__drizzle_migrations` يحفظ الطابع لا الوسم.",
    };
  }

  const last = journal.entries.at(-1);
  return {
    ok: true,
    message:
      `${String(journal.entries.length)} ترحيلًا في السجلّ — طوابعُها متزايدةٌ صارمًا ولا مستقبليَّ فيها ` +
      `(آخرها \`${last?.tag ?? "—"}\`)، والبراهين الأربعة خضراء.`,
  };
}
