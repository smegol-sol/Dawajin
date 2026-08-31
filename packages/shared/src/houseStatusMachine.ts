import { HOUSE_STATUS, type HouseStatus } from "./enums";

/**
 * آلة حالة العنبر — **الجدول في موضع واحد، ولا تُنثر شروطه في الكود**
 * (القرار 220).
 *
 * **وهي خمسة انتقالات لا سبعة** (كانت أربعة يوم القرار 220، **ونُقل إليها
 * «تنظيف ← راحة» بالقرار 221 حين بُني مالكه** — ولا يُكتب انتقال خارج الآلة).
 * «الحالات السبع» في §3.3 **موزَّعة على مسارات**، **واثنان من انتقالاتها أثرٌ
 * جانبيّ لعمليات الدفعة** لا يُفتحان هنا — انظر `TRANSITIONS_OWNED_ELSEWHERE`.
 * **و`performedBy` يقسم الخمسة**: أربعةٌ لمسار الحالة، **وواحد تلقائيّ لإكمال
 * الخطوات لا يُطلب يدويًّا**.
 *
 * **والقسمة حارسُ صلاحية لا تنظيم:** «مشغول ← تحت الإخلاء» أثرُ تصفية الدفعة،
 * **والتصفية للمالك وحده** (§12.2: مشرف ❌) — **فلو قَبِلها مسارُ الحالة لصفّى
 * المشرف دفعةً من الباب الخلفي وملَكَ ما لا يملكه**. **وعامّةً: انتقالٌ هو
 * أثرُ عمليةٍ أخرى لا يُفتح مستقلًّا في مسار الحالة، وإلا صار بابًا خلفيًّا
 * لكل صلاحية معلّقة على تلك العملية.**
 */

/** الحالتان الخارجتان من الخدمة — يُدخل إليهما «من أي حالة» (§3.3). */
export const OUT_OF_SERVICE_STATUSES = [
  "تحت الصيانة",
  "معطّل",
] as const satisfies readonly HouseStatus[];

export type OutOfServiceStatus = (typeof OUT_OF_SERVICE_STATUSES)[number];

export function isOutOfService(status: HouseStatus): status is OutOfServiceStatus {
  return (OUT_OF_SERVICE_STATUSES as readonly HouseStatus[]).includes(status);
}

/** حالات الخدمة — كل ما ليس خارجًا منها. */
export const IN_SERVICE_STATUSES = HOUSE_STATUS.filter(
  (status) => !isOutOfService(status)
) as readonly HouseStatus[];

/**
 * **صنف الانتقال** — كل صنف حرّاسه، ولا حارس مبعثر خارج جدوله.
 *
 * - `prep-advance` — تحت الإخلاء ← تحت التنظيف والتطهير (§3.3، سهمٌ لا يدّعيه مسار آخر).
 * - `prep-complete` — تحت التنظيف والتطهير ← في فترة الراحة (§14.6): **تلقائيّ
 *   عند اكتمال الخطوات الإلزامية، ولا يُطلب يدويًّا** — نُقل من
 *   `TRANSITIONS_OWNED_ELSEWHERE` بالقرار 221 حين بُني مالكه.
 * - `rest-confirm` — في فترة الراحة ← جاهز للإسكان (§14.6، ومعه `rest_target_days` وإغلاق الدورة).
 * - `out-of-service` — من أي حالة إلى «تحت الصيانة» أو «معطّل» (§3.3)، **وسببه إلزامي**.
 * - `return-to-service` — العودة منهما **باختيار صريح** (قرار المالك، القرار 220).
 */
export type HouseTransitionKind =
  "prep-advance" | "prep-complete" | "rest-confirm" | "out-of-service" | "return-to-service";

/**
 * **مَن يُجري الانتقال** — والقسمة حارسُ صلاحية لا تنظيم (القرار 220):
 * انتقالٌ صنفُه `prep-completion` **لا يقبله مسار الحالة يدويًّا**، وإلا صار
 * بابًا خلفيًّا يتخطّى «الخطوات تفتح العنبر» (القرار #153) — **يُطلب من
 * `PATCH /prep-steps/:stepId/complete` وحده**.
 */
export type TransitionPerformer = "status-route" | "prep-completion";

export interface HouseTransitionRule {
  readonly kind: HouseTransitionKind;
  /** **مَن يُجريه** — ومسارُ الحالة لا يقبل ما ليس له. */
  readonly performedBy: TransitionPerformer;
  readonly from: readonly HouseStatus[];
  readonly to: readonly HouseStatus[];
  /** **مصدر السطر من الوثيقة** — يُكتب مع القاعدة لا في قرارٍ بعيد عنها. */
  readonly source: string;
  /** **أسببٌ إلزامي؟** — الخروج من الخدمة وحده (قرار المالك، القرار 220). */
  readonly reasonRequired: boolean;
}

/**
 * **الجدول.** يُقرأ من أعلى إلى أسفل، **وأول قاعدة تطابق هي الحاكمة** — ولا
 * تتقاطع القاعدتان الأخيرتان لأن وجهتيهما متباينتان بالبناء.
 */
export const HOUSE_STATUS_TRANSITIONS: readonly HouseTransitionRule[] = [
  {
    kind: "prep-advance",
    performedBy: "status-route",
    from: ["تحت الإخلاء"],
    to: ["تحت التنظيف والتطهير"],
    source: "§3.3 — سهمُ الدورة، ولا يدّعيه مسار آخر",
    reasonRequired: false,
  },
  {
    // **نُقل من `TRANSITIONS_OWNED_ELSEWHERE` إلى الجدول بالقرار 221** حين
    // بُني مالكه — **ولا يُكتب انتقال خارج الآلة**.
    kind: "prep-complete",
    performedBy: "prep-completion",
    from: ["تحت التنظيف والتطهير"],
    to: ["في فترة الراحة"],
    source:
      "§14.6 — «عند اكتمال الإلزامية: انتقال تلقائي لـ‹في فترة الراحة›» (PATCH /prep-steps/:stepId/complete)",
    reasonRequired: false,
  },
  {
    kind: "rest-confirm",
    performedBy: "status-route",
    from: ["في فترة الراحة"],
    to: ["جاهز للإسكان"],
    source: "§14.6 — «houses+history+min_rest_days → إغلاق الدورة»، و§3.3 بشرطيه",
    reasonRequired: false,
  },
  {
    kind: "out-of-service",
    performedBy: "status-route",
    from: HOUSE_STATUS,
    to: OUT_OF_SERVICE_STATUSES,
    source: "§3.3 — «يُدخل إليهما من أي حالة»",
    // **الأثر الوحيد الباقي يشرح لماذا توقّف العنبر** (القرار 204 قرأ هذا
    // الحقل بعينه) — **فسببٌ فارغ يُفرغ الأثر الوحيد**.
    reasonRequired: true,
  },
  {
    kind: "return-to-service",
    performedBy: "status-route",
    from: OUT_OF_SERVICE_STATUSES,
    to: IN_SERVICE_STATUSES,
    source: "قرار المالك (القرار 220) — اختيارٌ صريح كما عند الإنشاء، بمنطق 186",
    reasonRequired: false,
  },
];

/**
 * **الانتقالان اللذان يملكهما غيرُ هذه الآلة كلّها** (أثر عمليات الدفعة) — تُسمَّى ولا تُترك
 * فراغًا، **فرسالة الرفض تقول «لمن هو» لا «ممنوع» وحدها**.
 */
export const TRANSITIONS_OWNED_ELSEWHERE: Readonly<Record<string, string>> = {
  "مشغول←تحت الإخلاء": "أثرُ تصفية الدفعة — `POST /batches/:batchId/close` (المالك وحده، §14.6)",
  "جاهز للإسكان←مشغول": "أثرُ إسكان الدفعة — مسار الدفعات (§14.6)",
};

export function transitionKey(from: HouseStatus, to: HouseStatus): string {
  return `${from}←${to}`;
}

/**
 * يصنّف انتقالًا بقراءة الجدول وحده.
 * @returns القاعدة الحاكمة، أو `null` إن لم يطابقه سطر — والانتقال إلى نفس
 *   الحالة ليس انتقالًا فيُرفض قبل الجدول.
 */
export function classifyHouseTransition(
  from: HouseStatus,
  to: HouseStatus
): HouseTransitionRule | null {
  if (from === to) return null;
  return (
    HOUSE_STATUS_TRANSITIONS.find((rule) => rule.from.includes(from) && rule.to.includes(to)) ??
    null
  );
}
