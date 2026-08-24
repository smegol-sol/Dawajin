/**
 * float بدل numeric في عمود كمية — يمنع real()/doublePrecision() في مخطط
 * packages/db/src/schema/** (القرار #61). الكميات (أوزان، جرعات، أرصدة)
 * يجب أن تبقى numeric ذات دقة ثابتة (drizzle-orm/pg-core numeric()) لا
 * float ثنائي يراكم خطأ تقريب في دفتر حركة يُجمَع باستمرار (المبدأ #3).
 */
const FLOAT_COLUMN_FNS = new Set(["real", "doublePrecision"]);

export default {
  meta: {
    type: "problem",
    docs: { description: "لا real()/doublePrecision() في مخطط قاعدة البيانات" },
    schema: [],
    messages: {
      floatColumn: '"{{fn}}()" يستخدم float لعمود — استخدم numeric() من drizzle-orm/pg-core (المبدأ #3)',
    },
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(/\\/g, "/");
    if (!/packages\/db\/src\/schema\//.test(filename)) return {};

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !FLOAT_COLUMN_FNS.has(node.callee.name)) return;
        context.report({ node, messageId: "floatColumn", data: { fn: node.callee.name } });
      },
    };
  },
};
