/**
 * لا نص إنجليزي في رسالة خطأ تصل المستخدم (§18: "رسالة عربية جاهزة للعرض
 * دائمًا"، القرار #61). يفحص: الوسيط الثالث لـnew HttpError(status, code,
 * message, details) ورسائل zod المخصصة (.min/.max/.email/.refine/.regex).
 * الفحص نصي بسيط (لا حروف عربية في السلسلة) — كافٍ هنا لأن كل رسائل
 * المشروع الحقيقية عربية بالفعل؛ رقم أو رمز وحده (مثل "8") لا يُطابَق أصلًا
 * لأنه ليس Literal من نوع string يحوي حروفًا لاتينية.
 */
const ZOD_MESSAGE_METHODS = new Set(["min", "max", "email", "refine", "regex", "length", "gt", "lt"]);
const ARABIC_RANGE = /[؀-ۿ]/;
const LATIN_LETTERS = /[A-Za-z]{2,}/;

function looksEnglish(text) {
  return LATIN_LETTERS.test(text) && !ARABIC_RANGE.test(text);
}

export default {
  meta: {
    type: "problem",
    docs: { description: "لا نص إنجليزي في رسالة خطأ تصل المستخدم" },
    schema: [],
    messages: {
      englishError: 'نص "{{text}}" يبدو إنجليزيًا في رسالة تصل المستخدم — استخدم العربية (§18)',
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "HttpError") return;
        const messageArg = node.arguments[2];
        if (messageArg?.type === "Literal" && typeof messageArg.value === "string" && looksEnglish(messageArg.value)) {
          context.report({ node: messageArg, messageId: "englishError", data: { text: messageArg.value } });
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier") return;
        if (!ZOD_MESSAGE_METHODS.has(node.callee.property.name)) return;

        for (const arg of node.arguments) {
          if (arg.type === "Literal" && typeof arg.value === "string" && looksEnglish(arg.value)) {
            context.report({ node: arg, messageId: "englishError", data: { text: arg.value } });
          } else if (arg.type === "ObjectExpression") {
            for (const prop of arg.properties) {
              if (
                prop.type === "Property" &&
                prop.key.type === "Identifier" &&
                prop.key.name === "message" &&
                prop.value.type === "Literal" &&
                typeof prop.value.value === "string" &&
                looksEnglish(prop.value.value)
              ) {
                context.report({ node: prop.value, messageId: "englishError", data: { text: prop.value.value } });
              }
            }
          }
        }
      },
    };
  },
};
