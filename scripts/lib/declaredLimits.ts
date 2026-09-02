import { readFileSync } from "node:fs";

import {
  exportFacts,
  productionFiles,
  registeredRoutes,
  schemaColumns,
  specRoutes,
  writerFacts,
} from "./limitFacts";

/**
 * وسمُ الحدّ الزمنيّ وفاحصُه (القرار 269 على 268).
 *
 * **ثلاثُ نتائج لا اثنتان** — `صادق` · `كاذب` · **`لا أعرف`** — **والثالثة
 * تُسقط البناء كالثانية**: وسمٌ يخضرّ بغياب الآلة هو صنفُ الثابت الذي يخضرّ
 * بتطابق صفرٍ بصفر (القرار 262). **فالفاحص يفرّق بين الجهل والنفي، لا يمنع
 * الكاذب وحده.**
 *
 * **وصيغةُ الوسم ثلاثٌ لا رابع لها**، تُكتب داخل تعليق:
 * - `@limit no-writer <جدول>.<عمود>`
 * - `@limit no-caller <اسم دالّة مُصدَّرة>`
 * - `@limit no-route <METHOD> </api/...>`
 */

export type Verdict =
  | { readonly kind: "صادق" }
  | { readonly kind: "كاذب"; readonly why: string }
  | { readonly kind: "لا أعرف"; readonly why: string };

export interface LimitTag {
  readonly file: string;
  readonly line: number;
  readonly question: "no-writer" | "no-caller" | "no-route";
  readonly target: string;
}

/** الحقائق التي يُصدَّق بها الوسم — **مُمرَّرةٌ لا مقروءةٌ داخلًا، فتُختبر**. */
export interface LimitWorld {
  readonly columns: ReadonlyMap<string, ReadonlySet<string>>;
  readonly written: ReadonlyMap<string, ReadonlySet<string>>;
  readonly opaque: ReadonlyMap<string, string>;
  readonly declaredIn: ReadonlyMap<string, string>;
  readonly references: ReadonlyMap<string, number>;
  readonly routes: ReadonlySet<string>;
  readonly specRoutes: ReadonlySet<string>;
}

const TAG = /@limit\s+(no-writer|no-caller|no-route)\s+(\S+(?:\s+\S+)?)/;

/** يقرأ الوسوم من سطور التعليق وحدها — **سطرٌ بلا `//` ولا `*` ليس تعليقًا**. */
export function parseTags(file: string): LimitTag[] {
  const out: LimitTag[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const commented = /(^|\s)(\/\/|\*)/.test(line);
    if (!commented) return;
    const match = TAG.exec(line);
    if (match === null) return;
    const question = match[1];
    const target = match[2];
    if (question === undefined || target === undefined) return;
    out.push({
      file,
      line: index + 1,
      question: question as LimitTag["question"],
      target: target.trim(),
    });
  });
  return out;
}

function judgeWriter(target: string, world: LimitWorld): Verdict {
  const dot = target.indexOf(".");
  if (dot <= 0) {
    return { kind: "لا أعرف", why: `صيغةُ الهدف ليست \`جدول.عمود\`: \`${target}\`` };
  }
  const table = target.slice(0, dot);
  const column = target.slice(dot + 1);
  const columns = world.columns.get(table);
  if (columns === undefined) {
    return { kind: "لا أعرف", why: `لا جدول باسم \`${table}\` في المخطط` };
  }
  if (!columns.has(column)) {
    return { kind: "لا أعرف", why: `لا عمود \`${column}\` في \`${table}\`` };
  }
  const opaque = world.opaque.get(table);
  if (opaque !== undefined) {
    return { kind: "لا أعرف", why: `جدولٌ فيه موضعُ كتابةٍ لا يُقرأ — ${opaque}` };
  }
  const written = world.written.get(table);
  return written?.has(column) === true
    ? { kind: "كاذب", why: `\`${table}.${column}\` له كاتبٌ في الإنتاج` }
    : { kind: "صادق" };
}

function judgeCaller(target: string, world: LimitWorld): Verdict {
  if (!world.declaredIn.has(target)) {
    return { kind: "لا أعرف", why: `لا دالّة مُصدَّرة باسم \`${target}\` في كود الإنتاج` };
  }
  const refs = world.references.get(target) ?? 0;
  return refs > 0
    ? { kind: "كاذب", why: `\`${target}\` له ${String(refs)} مرجعًا إنتاجيًّا خارج ملفّه` }
    : { kind: "صادق" };
}

function judgeRoute(target: string, world: LimitWorld): Verdict {
  const key = target.replace(/\s+/g, " ").trim();
  if (world.routes.has(key)) return { kind: "كاذب", why: `\`${key}\` مسجَّلٌ في شجرة المسارات` };
  if (!world.specRoutes.has(key)) {
    return {
      kind: "لا أعرف",
      why: `\`${key}\` ليس مسجَّلًا ولا مُعلنًا في المواصفة — إملاءٌ أم مسارٌ لم يُقرَّر؟`,
    };
  }
  return { kind: "صادق" };
}

export function judge(tag: LimitTag, world: LimitWorld): Verdict {
  if (tag.question === "no-writer") return judgeWriter(tag.target, world);
  if (tag.question === "no-caller") return judgeCaller(tag.target, world);
  return judgeRoute(tag.target, world);
}

export async function buildWorld(): Promise<LimitWorld> {
  const files = productionFiles();
  const { written, opaque } = writerFacts(files);
  const { declaredIn, references } = exportFacts(files);
  return {
    columns: schemaColumns(),
    written,
    opaque,
    declaredIn,
    references,
    routes: await registeredRoutes(),
    specRoutes: specRoutes(),
  };
}

export function collectTags(): LimitTag[] {
  return productionFiles().flatMap((file) => parseTags(file));
}
