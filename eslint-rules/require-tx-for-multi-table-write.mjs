/**
 * كتابة في أكثر من جدول داخل نفس الدالة يجب أن تمر عبر tx (من
 * db.transaction()) لا db مباشرة — وإلا فالعمليتان غير ذريتين معًا
 * (المبدأ #2، القرار #61). لا يفحص استخدام tx نفسه — استخدام tx صحيح دائمًا
 * هنا؛ الفحص فقط على db.insert/update/delete عبر أكثر من جدول في نفس الدالة.
 */
const WRITE_METHODS = new Set(["insert", "update", "delete"]);
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description: "كتابة متعددة الجداول عبر db مباشرة بلا tx — استخدم db.transaction()",
    },
    schema: [],
    messages: {
      missingTx:
        'كتابة في جدول "{{table}}" عبر db مباشرة، بعد كتابة سابقة في جدول آخر بنفس الدالة — لفّهما في db.transaction() (المبدأ #2)',
    },
  },
  create(context) {
    const scopeStack = [{ node: null, tables: new Map() }];

    function enterFunction(node) {
      scopeStack.push({ node, tables: new Map() });
    }
    function exitFunction() {
      scopeStack.pop();
    }

    return {
      Program() {
        // القاعدة أصلًا: scopeStack[0] هو النطاق الجذر (خارج أي دالة)
      },
      ":function"(node) {
        if (FUNCTION_TYPES.has(node.type)) enterFunction(node);
      },
      ":function:exit"(node) {
        if (FUNCTION_TYPES.has(node.type)) exitFunction();
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (callee.object.type !== "Identifier" || callee.object.name !== "db") return;
        if (callee.property.type !== "Identifier" || !WRITE_METHODS.has(callee.property.name)) return;

        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== "Identifier") return; // جدول ديناميكي — لا يمكن تتبعه ثابتًا
        const tableName = firstArg.name;

        const scope = scopeStack[scopeStack.length - 1];
        if (!scope.tables.has(tableName)) {
          scope.tables.set(tableName, node);
        }
        if (scope.tables.size > 1) {
          context.report({ node, messageId: "missingTx", data: { table: tableName } });
        }
      },
    };
  },
};
