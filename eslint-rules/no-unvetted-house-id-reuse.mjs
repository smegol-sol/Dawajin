/**
 * إعادة استخدام قيمة houseId مشتقة كفلتر استعلام (eq(..., houseId)) خارج
 * apps/api/src/middleware/entityAccess.ts — الملف المفحوص الوحيد المخوَّل
 * بمنطق "اجلب الكيان ثم اشتق عنبره ثم تحقق" (القرار #61). أي مكان آخر يعيد
 * هذا المنطق يعيد اختراع enforceEntityAccess جزئيًا بلا فحص الإسناد الكامل.
 *
 * فحص تقريبي عمدًا (اسميًا لا بتتبع تدفق بيانات كامل): يفحص أن طرف القيمة في
 * eq(...) ليس معرِّفًا أو وصولًا لخاصية اسمها houseId حرفيًا. النتيجة الإيجابية
 * الكاذبة الوحيدة المتوقعة: متغيّر اسمه houseId قادم مباشرة من body/params
 * (لا مشتق من استعلام سابق) — استثناؤها بدقة يحتاج تتبع تدفق بيانات كامل،
 * غير مُنفَّذ هنا؛ استثنِ السطر إن كانت هذه هي الحالة (راجع "قاعدة التعطيل").
 */
const VETTED_FILE_SUFFIX = "apps/api/src/middleware/entityAccess.ts";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "إعادة استخدام houseId مشتق كفلتر استعلام خارج entityAccess.ts",
    },
    schema: [],
    messages: {
      unvetted:
        "استخدام قيمة houseId كفلتر استعلام خارج middleware/entityAccess.ts — مرّر عبر enforceEntityAccess بدل إعادة اشتقاق العنبر يدويًا (القرار #61)",
    },
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(/\\/g, "/");
    if (filename.endsWith(VETTED_FILE_SUFFIX)) return {};

    function isHouseIdNamed(node) {
      if (!node) return false;
      if (node.type === "Identifier") return /^houseId$/i.test(node.name);
      if (node.type === "MemberExpression" && node.property.type === "Identifier") {
        return /^houseId$/i.test(node.property.name);
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "eq") return;
        const [, valueArg] = node.arguments;
        if (isHouseIdNamed(valueArg)) {
          context.report({ node, messageId: "unvetted" });
        }
      },
    };
  },
};
