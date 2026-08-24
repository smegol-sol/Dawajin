/**
 * منع استعلام Drizzle مباشر داخل apps/api/src/routes/**.
 * الاستعلام يجب أن يعيش في طبقة services (القرار #61) — الـroute يستدعي
 * دالة service ولا يعرف db/tx مباشرة.
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
    const filename = context.filename ?? context.getFilename();
    if (!/[\\/]apps\/api\/src\/routes\/[^\\/]+\.ts$/.test(filename)) {
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
