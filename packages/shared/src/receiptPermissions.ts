import { PRODUCT_CATEGORY, type ProductCategory, type UserRole } from "./enums";

/**
 * من يستلم من مورّد، وبأي فئة — **§12.2 صفّ «استلام من مورّد» وحده الحاكم**
 * (القرار 227).
 *
 * | الدور | ما يستلمه في §12.2 |
 * |---|---|
 * | `farmer` | ❌ |
 * | `supervisor` | ✅ **علف + مستلزمات تشغيل** |
 * | `vet` | ✅ **أدوية + لقاحات** |
 * | `owner` | ✅ **الكل** |
 * | `storekeeper` | ✅ **المركزي** |
 * | `platform_admin` | ❌ — **وليس في `USER_ROLE` أصلًا** (القراران #146
 *   و#147: مدير المنصة مفصولٌ بنيويًّا عن أدوار المستأجر)، فلا خانة له هنا |
 *
 * **وقائمة موجبة لا شرط سالب** (القرار 184): **دورٌ لا يُذكر لا يستلم شيئًا**،
 * **وفئةٌ تُضاف غدًا لا تدخل جيب أحد بالسكوت** — تُكتب في صفّها أو تبقى
 * للمالك وحده.
 */
export const RECEIPT_CATEGORIES_BY_ROLE: Readonly<Record<UserRole, readonly ProductCategory[]>> = {
  farmer: [],
  supervisor: ["علف", "مستلزمات تشغيل"],
  vet: ["دواء", "لقاح"],
  owner: PRODUCT_CATEGORY,
  // **§12.2 يعطيه «المركزي»** — **ولا يبلغ هذا المسار اليوم**: `storekeeper`
  // ليس في `ASSIGNMENT_SCOPED_ROLES` ولا في `FULL_VISIBILITY_ROLES`،
  // **فالفرض المركزي يرفضه بـ403 قبل أي مسار** (القرار 194: «من ليس في قائمة
  // معلومة لا يمرّ»). **حدٌّ معلن ومُثبَت باختبار** — ودخولُه قائمةَ رؤيةٍ
  // قرارُ نموذج أدوار لا شقُّ استلام.
  storekeeper: PRODUCT_CATEGORY,
};

export function canReceiveCategory(role: UserRole, category: ProductCategory): boolean {
  return RECEIPT_CATEGORIES_BY_ROLE[role].includes(category);
}

/**
 * **فئتان لا يبلغهما إلا المالك** — **قراءةٌ للمصفوفة لا حكمٌ عليها**:
 * «فيتامين» و«معقمات ومطهرات» **ليستا في صفّ المشرف ولا الطبيب**، وصفّ
 * المالك «الكل» يشملهما. **يُسجَّل لأن سكوت المصفوفة عنهما قد يُقرأ سهوًا،
 * والقرار 184 يمنع منحهما بالسكوت** — فإن أُريد غيرُ ذلك فهو قرار مالك.
 */
export const OWNER_ONLY_RECEIPT_CATEGORIES: readonly ProductCategory[] = PRODUCT_CATEGORY.filter(
  (category) =>
    !RECEIPT_CATEGORIES_BY_ROLE.supervisor.includes(category) &&
    !RECEIPT_CATEGORIES_BY_ROLE.vet.includes(category)
);
