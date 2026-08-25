/**
 * تنقّل شجرة البنية التحتية — **نموذج خالص بلا React ولا شبكة**، كي يكون
 * التخطّي والرجوع قابلين للفحص وحدهما لا عبر شاشة كاملة.
 *
 * ## قاعدة التخطّي — معمَّمة لا حالات خاصة
 *
 * **أي مستوى يحتوي عنصرًا واحدًا مرئيًا لهذا المستخدم يُتخطّى وينزل لما
 * تحته.** تنطبق على المواقع كما على المزارع، و**متتابعةً**: من يرى موقعًا
 * واحدًا فيه مزرعة واحدة يفتح التبويب فيجد العنابر مباشرة بلا ضغطة.
 *
 * **والصفر ليس واحدًا:** لا عناصر مرئية ← حالة فارغة في مكانها، لا تخطٍّ.
 *
 * ## الرجوع
 *
 * يعيد المستخدم إلى المستوى الذي **جاء منه فعلًا**، لا إلى مستوى تُخطّي ولم
 * يره قط. وإن كانت كل المستويات فوقه متخطّاة فلا مستوى يُرجَع إليه — تخرج
 * الشاشة كما يخرج أي تبويب (`goBack` تُرجع `null`).
 *
 * ولهذا يحمل كل مدخل في الأثر علامة `skipped`: تُضبط على **الأب** لحظة
 * النزول، لأن السؤال ليس «هل رأينا هذا المستوى؟» بل «هل اختار المستخدم فيه؟».
 */

export type Level =
  | { kind: "sites" }
  | { kind: "farms"; siteId: number; siteName: string }
  | { kind: "houses"; farmId: number; farmName: string; siteName: string };

export interface TrailEntry {
  level: Level;
  /** هل نزلنا من هذا المستوى **تلقائيًا** بلا اختيار المستخدم؟ */
  skipped: boolean;
}

/** الأثر الابتدائي — المواقع، وما من مستوى فوقه. */
export function initialTrail(): TrailEntry[] {
  return [{ level: { kind: "sites" }, skipped: false }];
}

export function currentLevel(trail: TrailEntry[]): Level {
  const last = trail[trail.length - 1];
  // الأثر لا يفرغ أبدًا داخل الشاشة: `goBack` تُرجع null بدل أن تفرّغه
  return last?.level ?? { kind: "sites" };
}

/**
 * ينزل مستوى واحدًا.
 * @param autoSkipped `true` حين كان النزول تلقائيًا (عنصر واحد مرئي)، فيُعلَّم
 *   **الأب** متخطّى ولا يعود إليه الرجوع
 */
export function descend(trail: TrailEntry[], child: Level, autoSkipped: boolean): TrailEntry[] {
  const parents = trail.slice(0, -1);
  const parent = trail[trail.length - 1];
  const markedParent: TrailEntry[] =
    parent === undefined ? [] : [{ level: parent.level, skipped: autoSkipped }];
  return [...parents, ...markedParent, { level: child, skipped: false }];
}

/**
 * يصعد مستوى — متجاوزًا كل ما تُخطّي في الطريق.
 * @returns الأثر الجديد، أو `null` حين لا يبقى مستوى رآه المستخدم (تُغادَر الشاشة)
 */
export function goBack(trail: TrailEntry[]): TrailEntry[] | null {
  let next = trail.slice(0, -1);
  while (next.length > 0 && next[next.length - 1]?.skipped === true) {
    next = next.slice(0, -1);
  }
  return next.length === 0 ? null : next;
}

/** هل تُخطّي أي مستوى فوق الحالي؟ — يجعل سطر السياق إلزاميًا. */
export function hasSkippedAncestor(trail: TrailEntry[]): boolean {
  return trail.slice(0, -1).some((entry) => entry.skipped);
}

/**
 * سطر السياق — **المسار الذي فوق العنوان الحالي**، لا العنوان نفسه مكرَّرًا.
 *
 * عند العنابر: `الموقع › المزرعة`، والعنوان اسم المزرعة. **إلزامي عند أي
 * تخطٍّ** لأن المستخدم لم يمرّ بالمستويات التي تُعرّف موقعه.
 *
 * وعند المزارع لا سطر: العنوان **اسم الموقع نفسه**، وهو أعلى الشجرة — فما
 * فوقه لا شيء يُذكر. القاعدة مستوفاة بالعنوان لا بسطر يكرّره.
 */
export function contextLine(trail: TrailEntry[]): string | undefined {
  const level = currentLevel(trail);
  if (level.kind !== "houses") return undefined;
  return `${level.siteName} › ${level.farmName}`;
}
