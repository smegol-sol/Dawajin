/**
 * يمنع تجزئة كلمة مرور نصية حرفية (`bcrypt.hash("Temp1234", …)`) في كود
 * الخادم الإنتاجي.
 *
 * الثقب (القرار #98): كلمتان مؤقتتان **يدويتان** متطابقتان عبر مستأجرَين
 * تسمحان لأحد الشخصين بالدخول إلى حساب الآخر. السبب الجذري ليس آلية المقارنة
 * بل **وجود كلمتين متطابقتين أصلًا**، لأن المشرف يكتبها يدويًا. الكلمة
 * المؤقتة يجب أن تخرج من `generateTemporaryPassword()` حصرًا (القرار #100).
 *
 * النطاق: `apps/api/src/**` دون ملفات الاختبار — تركيب بيانات الاختبار
 * يجزّئ كلمات ثابتة عمدًا (وهو ما يُثبت الثقب أصلًا)، ومنعه هناك يمنع كتابة
 * الاختبار الأمني نفسه.
 *
 * الفحص نحوي لا دلالي: يلتقط النص الحرفي والقالب الحرفي بلا متغيّرات. متغيّر
 * يحمل نصًا حرفيًا يمر — تتبّع تدفق البيانات خارج نطاق ESLint؛ الحارس الحقيقي
 * ضد ذلك هو `assertGeneratedTemporaryPassword()` وقت التشغيل.
 */
/** اسم دالة التجزئة إن كان الاستدعاء `bcrypt.hash`/`bcrypt.hashSync`، وإلا null. */
function bcryptHashMethod(callee) {
  if (callee.type !== "MemberExpression") return null;
  if (callee.object.type !== "Identifier" || callee.object.name !== "bcrypt") return null;
  if (callee.property.type !== "Identifier") return null;
  const { name } = callee.property;
  return name === "hash" || name === "hashSync" ? name : null;
}

/** نص حرفي أو قالب بلا تعبيرات (وهو نص حرفي فعليًا). */
function isLiteralString(node) {
  if (node.type === "Literal") return typeof node.value === "string";
  return node.type === "TemplateLiteral" && node.expressions.length === 0;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "لا تجزئة لكلمة مرور نصية حرفية — الكلمة المؤقتة تُولَّد آليًا",
    },
    schema: [],
    messages: {
      manualTempPassword:
        "كلمة مرور نصية حرفية تُمرَّر إلى {{call}} — استخدم generateTemporaryPassword() من lib/tempPassword (القرار #100)",
    },
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(/\\/g, "/");
    const isServerProductionFile =
      filename.includes("/apps/api/src/") && !/\.test\.ts$/.test(filename);
    if (!isServerProductionFile) return {};

    return {
      CallExpression(node) {
        const method = bcryptHashMethod(node.callee);
        if (method === null) return;

        const [first] = node.arguments;
        if (!first || !isLiteralString(first)) return;

        context.report({
          node: first,
          messageId: "manualTempPassword",
          data: { call: `bcrypt.${method}(...)` },
        });
      },
    };
  },
};
