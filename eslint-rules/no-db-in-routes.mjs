/**
 * منع استعلام Drizzle مباشر داخل ملفات معالجات المسارات في
 * apps/api/src/routes/**.
 * الاستعلام يجب أن يعيش في طبقة services (القرار #61) — الـroute يستدعي
 * دالة service ولا يعرف db/tx مباشرة.
 *
 * النيّة: **«ملف معالج مسار»** لا «أي ملف داخل مجلد routes/». ملفات
 * الاختبار المجاورة (`*.test.ts`) مستثناة صراحةً في المُطابِق أدناه: تجهيز
 * بيانات الاختبار (fixtures) يُدرج في القاعدة مباشرة عمدًا، وهو مسار
 * مختلف تمامًا عن `seed:demo` الذي يمر بالـAPI حصريًا (القرار #27 يفرّق
 * بينهما صراحةً). أول نسخة من هذه القاعدة طابقت المجلد كله فأطلقت 33
 * بلاغًا كلها في ملفات اختبار — خلل في المُطابِق لا دين تقني.
 */
const DB_IDENTIFIERS = new Set(["db", "tx"]);
const QUERY_METHODS = new Set(["select", "insert", "update", "delete", "execute", "transaction"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description: "لا استعلام Drizzle مباشر في route — استخدم طبقة services",
    },
    schema: [],
    messages: {
      dbInRoute:
        "استعلام Drizzle مباشر ({{call}}) داخل ملف route — انقله إلى دالة في apps/api/src/services (القرار #61)",
    },
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(/\\/g, "/");
    const isRouteHandlerFile =
      /\/apps\/api\/src\/routes\/[^/]+\.ts$/.test(filename) && !/\.test\.ts$/.test(filename);
    if (!isRouteHandlerFile) {
      return {};
    }

    return {
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || node.property.type !== "Identifier") return;
        if (!DB_IDENTIFIERS.has(node.object.name)) return;
        if (!QUERY_METHODS.has(node.property.name)) return;

        context.report({
          node,
          messageId: "dbInRoute",
          data: { call: `${node.object.name}.${node.property.name}(...)` },
        });
      },
    };
  },
};
