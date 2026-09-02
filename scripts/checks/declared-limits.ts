import {
  buildWorld,
  collectTags,
  judge,
  type LimitTag,
  type LimitWorld,
  type Verdict,
} from "../lib/declaredLimits";

/**
 * فاحصُ الحدود المعلنة (القرار 269 على 268) — **يكذّب ما تكذّبه آلةٌ قائمة**،
 * **ويفرّق بين الجهل والنفي**.
 *
 * **ويُثبت نفسه في كل تشغيل بثلاث مخالفات مصطنعة** — **لا اثنتين**: كاذبٌ
 * يسقط باسمه · وصادقٌ يمرّ · **وهدفٌ خارج المجموعة المغلقة يسقط بـ«لا أعرف»
 * برسالةٍ تسمّي سببها لا بـ«كاذب»**. **والثالثة أهمُّها: بها وحدها يُعرَف أن
 * الفاحص لا يخضرّ بغياب الآلة.**
 */

/** عالمٌ مصطنع صغير — **لا يقرأ المستودع**، فالبرهان يقيس المقيِّم وحده. */
const PROOF_WORLD: LimitWorld = {
  columns: new Map([["houses", new Set(["status", "name"])]]),
  written: new Map([["houses", new Set(["status"])]]),
  opaque: new Map(),
  declaredIn: new Map([["usedFn", "a.ts"]]),
  references: new Map([["usedFn", 3]]),
  routes: new Set(["GET /api/houses"]),
  specRoutes: new Set(["GET /api/houses", "GET /api/planned"]),
};

interface Proof {
  readonly label: string;
  readonly tag: Omit<LimitTag, "file" | "line">;
  readonly expect: Verdict["kind"];
}

const PROOFS: readonly Proof[] = [
  {
    label: "وسمٌ كاذب — عمودٌ له كاتب",
    tag: { question: "no-writer", target: "houses.status" },
    expect: "كاذب",
  },
  {
    label: "وسمٌ صادق — عمودٌ بلا كاتب",
    tag: { question: "no-writer", target: "houses.name" },
    expect: "صادق",
  },
  {
    label: "هدفٌ خارج المجموعة المغلقة — عمودٌ لا وجود له",
    tag: { question: "no-writer", target: "houses.ghost" },
    expect: "لا أعرف",
  },
];

function runProofs(): string[] {
  const failures: string[] = [];
  for (const proof of PROOFS) {
    const verdict = judge({ file: "<برهان>", line: 0, ...proof.tag }, PROOF_WORLD);
    if (verdict.kind !== proof.expect) {
      failures.push(`برهانٌ سقط — ${proof.label}: توقُّع «${proof.expect}» وجاء «${verdict.kind}»`);
    }
  }
  return failures;
}

function describe(tag: LimitTag, verdict: Verdict): string {
  const where = `${tag.file}:${String(tag.line)}`;
  const why = "why" in verdict ? verdict.why : "";
  return `${where} · @limit ${tag.question} ${tag.target} ← ${verdict.kind}: ${why}`;
}

export async function checkDeclaredLimits(): Promise<{ ok: boolean; message: string }> {
  const proofFailures = runProofs();
  if (proofFailures.length > 0) {
    return { ok: false, message: `الفاحص لم يُثبت نفسه:\n  - ${proofFailures.join("\n  - ")}` };
  }

  const tags = collectTags();
  const world = await buildWorld();
  const violations = tags
    .map((tag) => ({ tag, verdict: judge(tag, world) }))
    .filter(({ verdict }) => verdict.kind !== "صادق")
    .map(({ tag, verdict }) => describe(tag, verdict));

  if (violations.length > 0) {
    return {
      ok: false,
      message: `حدودٌ معلنة بطلت أو تعذّر تصديقها:\n  - ${violations.join("\n  - ")}`,
    };
  }
  const opaque = [...world.opaque.keys()];
  return {
    ok: true,
    message:
      `${String(tags.length)} حدًّا موسومًا — كلُّها صادقة، والبراهين الثلاثة خضراء ` +
      `(كاذب · صادق · لا أعرف).\n` +
      `  والمجموعات المغلقة: ${String(world.columns.size)} جدولًا · ` +
      `${String(world.declaredIn.size)} دالّة مُصدَّرة · ` +
      `${String(world.routes.size)} مسارًا مسجَّلًا و${String(world.specRoutes.size)} مُعلنًا.\n` +
      `  وجداولُ عتمةٍ لا يُوسَم عليها حتى تُشفَّف (${String(opaque.length)}): ${opaque.join(" · ")}`,
  };
}
