/**
 * لا نص إنجليزي في رسالة خطأ تصل المستخدم (§18: "رسالة عربية جاهزة للعرض
 * دائمًا"، القرار #61). يفحص: الوسيط الثالث لـnew HttpError(status, code,
 * message, details) ورسائل zod المخصصة (.min/.max/.email/.refine/.regex).
 * الفحص نصي بسيط (لا حروف عربية في السلسلة) — كافٍ هنا لأن كل رسائل
 * المشروع الحقيقية عربية بالفعل؛ رقم أو رمز وحده (مثل "8") لا يُطابَق أصلًا
 * لأنه ليس Literal من نوع string يحوي حروفًا لاتينية.
 */
const ZOD_MESSAGE_METHODS = new Set([
  "min",
  "max",
  "email",
  "refine",
  "regex",
  "length",
  "gt",
  "lt",
]);
const ARABIC_RANGE = /[؀-ۿ]/;
const LATIN_LETTERS = /[A-Za-z]{2,}/;

function looksEnglish(text) {
  return LATIN_LETTERS.test(text) && !ARABIC_RANGE.test(text);
}

/** يُبلّغ إن كانت العقدة سلسلة نصية حرفية تبدو إنجليزية. يتجاهل أي شيء آخر بصمت. */
function reportIfEnglishLiteral(context, node) {
  if (!node || node.type !== "Literal") return;
  if (typeof node.value !== "string" || !looksEnglish(node.value)) return;
  context.report({ node, messageId: "englishError", data: { text: node.value } });
}

/** يستخرج قيمة الخاصية `message` من خاصية كائن، أو undefined إن لم تكن كذلك. */
function messagePropertyValue(prop) {
  if (prop.type !== "Property") return undefined;
  if (prop.key.type !== "Identifier" || prop.key.name !== "message") return undefined;
  return prop.value;
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
        // الوسيط الثالث في HttpError(status, code, message, details?)
        reportIfEnglishLiteral(context, node.arguments[2]);
      },
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier")
          return;
        if (!ZOD_MESSAGE_METHODS.has(node.callee.property.name)) return;

        for (const arg of node.arguments) {
          reportIfEnglishLiteral(context, arg);
          if (arg.type === "ObjectExpression") {
            for (const prop of arg.properties) {
              reportIfEnglishLiteral(context, messagePropertyValue(prop));
            }
          }
        }
      },
    };
  },
};
