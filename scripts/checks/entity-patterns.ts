import { ENTITY_ID_PATH_PATTERNS } from "../../apps/api/src/app";
import { ASSIGNMENT_SCOPED_ROLES } from "../../apps/api/src/lib/entityScope";
import { introspectRoutes, type RouteEntry } from "../lib/introspectRoutes";

/**
 * فاحص تغطية أنماط الكيانات (§7-ب البند 44، القرار 218).
 *
 * > **كل مسار يحمل معرّف كيان في رابطه — إمّا يطابقه نمط في
 * > `ENTITY_ID_PATH_PATTERNS`، وإمّا يحرسه دورٌ غير مُسنَد. وإلا سقط البناء.**
 *
 * **والعلّة واقعة لا فرضية:** القاعدة موصوفة في `CLAUDE.md` **وفوق القائمة في
 * `app.ts` نفسها** — **ومع ذلك أُضيف `GET /api/farms/:farmId` ونُسي نمطه**،
 * **فمرّت مزرعةٌ كاملة بلا فحص إسناد** (§7-ب البند 43، والقرار 191).
 * **فالقاعدة كانت موصوفة لا مفروضة**، **وهذا رابع عطبٍ من الصنف الذي سجّله
 * القرار 215**: المستودع يحرس ما يُشغَّل ولا يحرس ما يُقرأ.
 *
 * **ولم تكشفه مراجعة ولا اختبار** — كشفته مخالفتان متعمَّدتان في دفعةٍ أخرى
 * **مرّتا بـ200 وكان يُنتظر 403** (القرار 191). **فالفاحص يسأل السؤال الذي لم
 * يسأله أحد.**
 *
 * ## معرّف الكيان: شكلٌ لا قائمة
 *
 * **أي مقطع `:param` في المسار** — لا قائمة (`houseId` · `farmId` · …).
 * **والقائمة تحمل ثقب ما تحرسه**: معرّفٌ خامس يُضاف **لا يُعدّ فيها فلا
 * يُفحص** — **وهو بعينه شكل العطب الذي وُجد الفاحص ليمنعه**.
 *
 * **وما يُخسر بالشكل مسمًّى:** مقطعٌ ليس معرّف كيان (`/:reportType` مثلًا)
 * **سيُطالَب بنمطٍ أو حارس** — **فيُنتج الشكلُ إنذارًا كاذبًا حيث تُنتج
 * القائمة ثقبًا صامتًا**. **والمقايضة مقصودة**: الإنذار الكاذب يوقف البناء
 * فيُكتب له استثناء بعلّة، **والثقب الصامت يُشحن**. **ولا مقطع من هذا الصنف
 * اليوم**: كل معرّفات المسارات العشرة كيانات (`siteId` · `farmId` · `houseId`).
 *
 * ## الحارس: مقيسٌ لا مُدرَج
 *
 * **حاولتُ قياسه من الشجرة أولًا فتعذّر:** `introspectRoutes` يعطي الطريقة
 * والمسار، **وأسماء الوسطاء في الشجرة كلها `<anonymous>`** لأن `requireRole`
 * يُرجع دالة بلا اسم — **وأدوارها محبوسة في إغلاقها لا تُقرأ من خارجه**.
 *
 * **فبدل قائمةٍ موجبة تُكتب بيد، أُعلنت الأدوار على الدالة نفسها**
 * (`RoleGuard.roles`) **فصار الحارس يصف نفسه**. **والعلّة أن القائمة الموجبة
 * هنا تُعيد المرض لا تعالجه**: **قائمةٌ ثانية تُنسى كما نُسي النمط**،
 * **ويصير للفاحص ثقبٌ من جنس ما يحرسه**.
 *
 * **والشرط أدقّ من «`requireRole("owner")`» حرفيًّا:** **ألّا يكون في أدوار
 * الحارس دورٌ مُسنَد** (`ASSIGNMENT_SCOPED_ROLES`) — **فالإسناد إنما يُفرض على
 * الأدوار المُسنَدة**، ومسارٌ مقصورٌ على غيرها لا يحتاجه. **فيصحّ اليوم
 * لـ`owner`، ويصحّ غدًا لـ`requireRole("owner", "storekeeper")` بلا تعديل.**
 */

/** `api.use(pattern)` يطابق البادئة لا المسار الكامل (القرار #131). */
function matchesPattern(path: string): string | null {
  for (const pattern of ENTITY_ID_PATH_PATTERNS) {
    if (path === pattern || path.startsWith(`${pattern}/`)) return pattern;
  }
  return null;
}

function guardedByUnassignedRole(route: RouteEntry): boolean {
  if (!route.guardRoles || route.guardRoles.length === 0) return false;
  return route.guardRoles.every((role) => !ASSIGNMENT_SCOPED_ROLES.has(role as never));
}

interface CheckResult {
  ok: boolean;
  message: string;
}

export async function checkEntityPatterns(): Promise<CheckResult> {
  const routes = await introspectRoutes();
  const withEntityId = routes.filter((r) => /:[A-Za-z0-9_]+/.test(r.path));

  const uncovered = withEntityId.filter(
    (r) => matchesPattern(r.path) === null && !guardedByUnassignedRole(r)
  );

  if (uncovered.length > 0) {
    const lines = uncovered.map(
      (r) =>
        `  ${r.method} ${r.path} — لا نمط يطابقه في ENTITY_ID_PATH_PATTERNS` +
        `، ولا يحرسه دور غير مُسنَد (${r.guardRoles ? r.guardRoles.join("، ") : "بلا حارس دور"})`
    );
    return {
      ok: false,
      message:
        `${String(uncovered.length)} مسارًا يحمل معرّف كيان بلا فرض إسناد:\n${lines.join("\n")}\n\n` +
        "**والعلاج نمطٌ في `ENTITY_ID_PATH_PATTERNS` في `app.ts`** — سطرٌ واحد بجوار أخواته، " +
        "**لا فحصٌ داخل الموجّه** (الفرض مركزي، المبدأ #1). " +
        "**أو حراسةٌ بدور غير مُسنَد** إن كان المسار لا يخصّ المُسندين. " +
        "**وقائمة فارغة ليست بديلًا عن 403** (القرار #129).",
    };
  }

  const byPattern = withEntityId.filter((r) => matchesPattern(r.path) !== null).length;
  const byRole = withEntityId.length - byPattern;
  return {
    ok: true,
    message:
      `${String(withEntityId.length)} مسارًا يحمل معرّف كيان — كلها مغطّاة: ` +
      `${String(byPattern)} بنمط و${String(byRole)} بحراسة دور غير مُسنَد ` +
      `(${String(ENTITY_ID_PATH_PATTERNS.length)} أنماط مسجَّلة).`,
  };
}
