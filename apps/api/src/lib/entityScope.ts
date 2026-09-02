import { farms, houses, userAssignments, users, warehouses } from "@dawajin/db";
import { sql, type SQL } from "drizzle-orm";
import type { Request } from "express";

/** دور المستخدم كما يصل من الرمز — مصدره تعريف `Request["user"]`. */
export type Role = NonNullable<Request["user"]>["role"];

/**
 * نطاق الإسناد — **مصدر واحد يقرؤه الفرض المركزي وطبقة الخدمة معًا.**
 *
 * كان `ASSIGNMENT_SCOPED_ROLES` داخل `middleware/entityAccess.ts` وحده، فلما
 * احتاجته طبقة الخدمة لفلترة السرد (القرار #129) كان الخياران: تكراره، أو
 * استيراد خدمة من middleware. كلاهما يجعل «من هو المقيَّد بالإسناد؟» سؤالًا
 * له جوابان محتملان — فنُقل إلى هنا.
 */

/**
 * الأدوار المقيَّدة بالإسناد (القرار #126، ووُسِّعت بـ#128).
 *
 * **ثلاثة أدوار: المربّي بالعنبر، والمشرف والطبيب بالمزرعة.** المالك يرى كل
 * عنابر مستأجره بحكم دوره، ومدير المنصة لا يدخل مسارات المستأجرين أصلًا.
 *
 * **قائمة موجبة لا شرط سالب عمدًا:** دور جديد يُضاف للنظام لا يحصل على تجاوز
 * صامت — يبقى خارج القيد حتى يُدرَج هنا بقرار مكتوب.
 */
export const ASSIGNMENT_SCOPED_ROLES = new Set<Role>([
  "farmer",
  "supervisor",
  "vet",
  // **وأمين المخزن أُدرج بالقرار 254** — وكان خارج القائمتين معًا **فيُردّ عن
  // كل مسار `/api/*` بالفرض المركزي** (القرار 246 «ثانيًا»). **وأثرُ إدراجه
  // مقصورٌ عليه**: القوائم تُسأل بدور الفاعل وحده، فلا توسّع دورًا آخر.
  "storekeeper",
]);

export function isAssignmentScoped(role: Role): boolean {
  return ASSIGNMENT_SCOPED_ROLES.has(role);
}

/**
 * الأدوار ذات الرؤية الكاملة داخل المستأجر (القرار 184، و§7-ب البند 32).
 *
 * **المالك وحده اليوم.** ومدير المنصة **ليس منها**: لا يدخل مسارات المستأجرين
 * أصلًا (القراران #146 و#147)، وإدراجه هنا يعطيه رؤية لم تُقرَّر له.
 *
 * **قائمة موجبة لا شرط سالب — بنفس منطق `ASSIGNMENT_SCOPED_ROLES`:** كان
 * الحارس يقول «من ليس مقيَّدًا بالإسناد فلا شرط عليه»، **و«لا شرط» تعني «كل
 * شيء»** — فأي دور جديد يُضاف للنظام كان يرث رؤية كل مزارع المستأجر **بالسكوت**.
 * فقُلب: **من ليس في قائمة معلومة لا يرى شيئًا**، ودورٌ يُنسى فيُحجب أهون من
 * دورٍ يُنسى فيرى كل شيء (القرار #161).
 */
export const FULL_VISIBILITY_ROLES = new Set<Role>(["owner"]);

export function hasFullVisibility(role: Role): boolean {
  return FULL_VISIBILITY_ROLES.has(role);
}

/**
 * **«سارٍ اليوم» — شرط المدّة مكتوبًا مرة واحدة** (القرار #158 حكم ٣، والقرار 190).
 *
 * الإسناد صار بمدة، **فسؤال كل استعلام تغيّر من «هل يوجد صفّ؟» إلى «هل يوجد
 * صفّ سارٍ اليوم؟»**. وصفٌّ منتهٍ يقرؤه الفرض ساريًا **ثغرةُ صلاحيات لا خلل
 * عرض**: الإسناد يقيّد القراءة كما يقيّد الكتابة (#126).
 *
 * **ويُكتب هنا مرة واحدة ويُستعمل في الخمسة** — المبدأ الأول: الفرض في طبقة
 * واحدة لا باستدعاء يدوي متكرر. **وشرطٌ منسوخ خمس مرات يُنسى في السادس.**
 *
 * **و«اليوم» تاريخ القاعدة (`CURRENT_DATE`) لا تاريخ الخادم:** خادم بمنطقة
 * زمنية مختلفة يُنهي إسنادًا قبل أوانه أو يمدّه، **والقيد الذي يحرس التداخل في
 * القاعدة يقيس بساعتها** — فيقيس السؤال بها كذلك.
 *
 * **و`end_date` آخر يوم مسؤولية شاملًا** لا أول يوم بعدها، فالمقارنة `>=`.
 *
 * **ويُصدَّر لأن خامسها في `middleware/entityAccess.ts`** — مصدرٌ واحد يقرؤه
 * الفرض المركزي وطبقة الخدمة معًا، كما `ASSIGNMENT_SCOPED_ROLES` أعلاه.
 *
 * @param alias اسم الجدول داخل الاستعلام — الشرط يُركَّب داخل `EXISTS` باسم
 *   مستعار (`ua`)، ويُستعمل في بانية drizzle باسم الجدول نفسه وهو الافتراضي.
 */
export function assignmentActiveToday(alias = "user_assignments"): SQL {
  return sql`${sql.raw(alias)}.start_date <= CURRENT_DATE
      AND (${sql.raw(alias)}.end_date IS NULL OR ${sql.raw(alias)}.end_date >= CURRENT_DATE)`;
}

/**
 * طرفا الشرط — **دالّتان لا ثابتان**: كائن `SQL` واحد مُشارَك بين استعلامات
 * متعددة يخاطر بحالة داخلية مشتركة، والإنشاء عند كل نداء بلا كلفة تُذكر.
 */
function allowAll(): SQL {
  return sql`true`;
}

function denyAll(): SQL {
  return sql`false`;
}

/**
 * شرط `WHERE` يحصر صفوف `houses` بما هو مُسند للمستخدم — **بالمستويين معًا**:
 * العنبر نفسه (المربّي)، أو مزرعته (المشرف والطبيب).
 *
 * **يُكتب بـ`EXISTS` صريحة لا بـ`JOIN`:** الانضمام على جدول تراكمي (مستخدم
 * واحد لعدة عنابر) يضاعف صفوف النتيجة، فيحتاج `DISTINCT` — ونسيانه يُظهر
 * العنبر مرتين في السرد. `EXISTS` تجيب عن سؤال وجودي بلا أثر على العدد.
 *
 * **ولا يُستعمل وحده:** الفلترة تُظهر ما يخصّ المستخدم، و`enforceEntityAccess`
 * هو من يرفض بـ403 ما لا يخصّه — الفلترة ليست بديلًا عن الفرض (المبدأ الأول).
 */
export function assignedHousesFilter(userId: number): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${userAssignments} ua
    WHERE ua.user_id = ${userId}
      AND (ua.house_id = ${houses.id} OR ua.farm_id = ${houses.farmId})
      AND ${assignmentActiveToday("ua")}
  )`;
}

/** ما يحتاجه أي حساب رؤية من المستخدم — لا `req` كاملًا في طبقة الخدمة. */
export interface Viewer {
  id: number;
  role: Role;
}

/**
 * **المزارع المرئية — والقاعدة تختلف بالدور عمدًا ولا تُوحَّد (القرار #131):**
 *
 * - **المالك:** كل مزارع مستأجره — لا شرط.
 * - **المشرف والطبيب:** المزارع **المُسندة إليهما** (`user_assignments.farm_id`).
 * - **المربّي:** المزرعة **الحاوية لعنبر مُسند إليه** — لا إسناد مزرعة له أصلًا.
 *
 * توحيدها في شرط واحد بـ`OR` يبدو أنظف ويغيّر المعنى: يصير إسنادُ عنبر واحد
 * كافيًا ليرى المشرف مزرعة لم تُسند إليه. **القاعدة قرار مالك لا اختصار
 * هندسي.**
 *
 * **ويُرجع شرطًا دائمًا لا `undefined`** (القرار 184): النوع `SQL | undefined`
 * هو ما يسمح بالنسيان — كل مستدعٍ جديد قد يهمل الشرط ولا يكشفه المترجم. والشرط
 * الدائم يجعل الفرض مركزيًّا لا استدعاءً يدويًّا (المبدأ الأول).
 *
 * @returns شرط على `farms` — `true` لصاحب الرؤية الكاملة، و`false` لدور مجهول
 */
export function visibleFarmCondition(viewer: Viewer): SQL {
  if (hasFullVisibility(viewer.role)) return allowAll();
  // **دور خارج القائمتين لا يرى شيئًا** — لا يُترك بلا شرط
  if (!isAssignmentScoped(viewer.role)) return denyAll();

  if (viewer.role === "farmer") {
    return sql`EXISTS (
      SELECT 1 FROM ${userAssignments} ua
      JOIN ${houses} assigned_house ON assigned_house.id = ua.house_id
      WHERE ua.user_id = ${viewer.id} AND assigned_house.farm_id = ${farms.id}
        AND ${assignmentActiveToday("ua")}
    )`;
  }

  return sql`EXISTS (
    SELECT 1 FROM ${userAssignments} ua
    WHERE ua.user_id = ${viewer.id} AND ua.farm_id = ${farms.id}
      AND ${assignmentActiveToday("ua")}
  )`;
}

/**
 * **العنابر المرئية داخل مزرعة مرئية أصلًا** — تكملة `visibleFarmCondition`
 * لا بديل عنها: تُطبَّق بعد أن تكون المزرعة قد مرّت الفلتر.
 *
 * - **المالك والمشرف والطبيب:** كل عنابر تلك المزارع — لا شرط إضافي.
 * - **المربّي:** عنابره المُسندة وحدها.
 *
 * **ودور مجهول يُمنع هنا صراحةً** (القرار 184) ولا يُترك متّكئًا على أن فلتر
 * المزرعة سيمنعه: **الاتّكال يسقط أول ما يُستدعى الشرط وحده في مسار جديد**.
 *
 * @returns شرط على `houses` — `true` حين لا قيد إضافي، و`false` لدور مجهول
 */
export function visibleHouseCondition(viewer: Viewer): SQL {
  if (viewer.role === "farmer") {
    return sql`EXISTS (
      SELECT 1 FROM ${userAssignments} ua
      WHERE ua.user_id = ${viewer.id} AND ua.house_id = ${houses.id}
        AND ${assignmentActiveToday("ua")}
    )`;
  }
  // المالك: رؤية كاملة · المشرف والطبيب: كل عنابر مزارعهم المُسندة
  if (hasFullVisibility(viewer.role) || isAssignmentScoped(viewer.role)) return allowAll();
  return denyAll();
}

/**
 * نطاق سرد العنابر داخل مزرعة — **نفس القلب مطبَّقًا على `housesService`**
 * (القرار 184). كان السطر هناك `isAssignmentScoped(role) ? filter : undefined`،
 * **وهو نفس النمط حرفيًّا: دور مجهول بلا فلتر** — فنُقل الحكم إلى هنا كي لا
 * يبقى ثقبٌ ثالث خارج المصدر الواحد.
 *
 * @returns شرط على `houses` — يُرجع شرطًا دائمًا لا `undefined`
 */
export function visibleHouseScope(viewer: Viewer): SQL {
  if (hasFullVisibility(viewer.role)) return allowAll();
  if (isAssignmentScoped(viewer.role)) return assignedHousesFilter(viewer.id);
  return denyAll();
}

/**
 * **المستخدمون المرئيون — تركيبُ القواعد القائمة لا قاعدةٌ خامسة** (القرار 251).
 *
 * **والحكم من القرار 246:** المشرف يرى **مربّي مزارعه المُسندة وحدهم**، لا كل
 * مربّي المستأجر — **ومشرفُ مزرعةٍ واحدة لا يرى موظفي بقية مزارع المالك**.
 *
 * **والمستخدم مرئيّ بما هو مُسندٌ إليه لا بذاته:** يُرى إن كان له **إسنادٌ
 * سارٍ اليوم** إلى كيانٍ يبلغه الرائي. **فمن لا إسناد له لا يراه إلا صاحب
 * الرؤية الكاملة** — وهو حال المالك نفسه (لا مستوى له)، وحالُ من أُنشئ ولم
 * يُسند بعد.
 *
 * **والفرعان يُركَّبان من `visibleFarmCondition` و`visibleHouseCondition` لا
 * يُعاد كتابتهما** — **وبالاقتران الذي وثّقه #131 لا بأحدهما وحده**: شرطُ
 * العنبر **تكملةٌ لشرط المزرعة لا بديلٌ عنه** (يُرجع `allowAll` للمشرف عمدًا)،
 * **فاستعمالُه منفردًا يجعل المشرف يرى كل عنابر المستأجر** — وهو بعينه
 * التوحيدُ الصامت الذي حذّر منه #131.
 *
 * **ومستوى المخزن خارجٌ عمدًا لا سهوًا:** إسنادُ مخزن الموقع **بيد المالك
 * وحده** (القرار 247)، **فلا يُرى به زميلٌ ولا يُدار**.
 *
 * @returns شرط على `users` — `true` لصاحب الرؤية الكاملة، و`false` لدور مجهول
 */
export function visibleUserCondition(viewer: Viewer): SQL {
  if (hasFullVisibility(viewer.role)) return allowAll();
  if (!isAssignmentScoped(viewer.role)) return denyAll();

  return sql`EXISTS (
    SELECT 1 FROM ${userAssignments} target_ua
    WHERE target_ua.user_id = ${users.id}
      AND target_ua.tenant_id = ${users.tenantId}
      AND ${assignmentActiveToday("target_ua")}
      AND (
        (target_ua.house_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM ${houses}
          JOIN ${farms} ON ${farms.id} = ${houses.farmId}
            AND ${farms.tenantId} = ${houses.tenantId}
          WHERE ${houses.id} = target_ua.house_id
            AND ${houses.tenantId} = target_ua.tenant_id
            AND ${visibleFarmCondition(viewer)}
            AND ${visibleHouseCondition(viewer)}
        ))
        OR
        (target_ua.farm_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM ${farms}
          WHERE ${farms.id} = target_ua.farm_id
            AND ${farms.tenantId} = target_ua.tenant_id
            AND ${visibleFarmCondition(viewer)}
        ))
      )
  )`;
}

/**
 * **المخازن المرئية — مرآةُ `assertWarehouseAccess` لا نسخةٌ مستقلة عنه**
 * (القرار 229).
 *
 * **وهي أول سردٍ فوق المخازن في المستودع** (`GET /api/inventory/in-transit`)،
 * **فالحكم يظهر مرتين لأن الطبقتين لا تتحدثان لغة واحدة**: الحارس يفحص صفًّا
 * بعينه بـ`throw`، والسرد يفلتر مجموعةً بـ`SQL` — **ولا يُعبَّر عن أحدهما
 * بالآخر**. **فالمصدر واحد هنا، والحارس يُقاس عليه بمصفوفة (فاعل × مخزن)
 * تقارن حكمَيهما خانةً خانة** — `warehouseVisibilityMirror.integration.test.ts`
 * (القرار 230، على نمط علاج التكرار في 224).
 *
 * **والفرعان متباينان بالبناء لا موحَّدان بـ`OR` فضفاض** (تحذير #131):
 * `house_id` هو الفاصل — **مخزن عنبر يُحلّ بإسناد عنبره** (#161 «ثانيًا»،
 * والقرار 199)، **وما سواه يلزمه إسنادٌ صريح للمخزن** (القرار 225: «ولا
 * يُشتق من إسناد المزارع»). **فلا شرطٌ يوسّع الآخر صامتًا.**
 *
 * @returns شرط على `warehouses` — `true` لصاحب الرؤية الكاملة، و`false` لدور مجهول
 */
export function visibleWarehouseCondition(viewer: Viewer): SQL {
  if (hasFullVisibility(viewer.role)) return allowAll();
  if (!isAssignmentScoped(viewer.role)) return denyAll();

  return sql`(
    (${warehouses.houseId} IS NOT NULL AND EXISTS (
      SELECT 1 FROM ${userAssignments} ua
      JOIN ${houses} wh_house ON wh_house.id = ${warehouses.houseId}
      WHERE ua.user_id = ${viewer.id}
        AND (ua.house_id = wh_house.id OR ua.farm_id = wh_house.farm_id)
        AND ${assignmentActiveToday("ua")}
    ))
    OR
    (${warehouses.houseId} IS NULL AND EXISTS (
      SELECT 1 FROM ${userAssignments} ua
      WHERE ua.user_id = ${viewer.id} AND ua.warehouse_id = ${warehouses.id}
        AND ${assignmentActiveToday("ua")}
    ))
  )`;
}
