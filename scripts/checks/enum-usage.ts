import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";

/**
 * فاحص صحة enum — **بوابة إنفاذ حقيقية**: يفشل البناء عند قيمة enum معرَّفة
 * في المخطط ولا يقبلها أي مخطط تحقّق في الـAPI، فلا مسار يستطيع كتابتها
 * (backend-technical-spec.md §21 و§8، ومعيار القبول §26).
 *
 * **المشكلة الأصلية التي أُنشئ لأجلها:** قيمتان ميتتان في نسخة سابقة من هذا
 * النظام — معرَّفتان في المخطط وبلا أي مسار يكتبهما — أفسدتا تقرير الفاقد،
 * لأن التقرير جمّع حسب قيم لا يمكن أن تظهر في البيانات إطلاقًا.
 *
 * ## لماذا أُعيدت كتابته كليًا (القرار #127)
 *
 * المعيار السابق كان: «طبقة الكتابة (`.insert(`/`.update(`) تذكر العمود
 * **وتكتب القيمة نصًّا حرفيًا**». وهذا المعيار **غير قابل للتحقق بنيويًا في
 * هذه المعمارية إطلاقًا**: لا خدمة تكتب قيمة enum حرفية — القيم تصل من جسم
 * الطلب، يتحقق منها zod مقابل الثابت المشترك، وتُدرَج **كمتغيّر**. فالحرفيات
 * لا توجد إلا في `packages/shared/src/enums.ts` (خارج المجلد الممسوح)، وفي
 * `openapi/spec.json` (ليس `.ts`)، وفي الاختبارات (مستثناة).
 *
 * **النتيجة: البوابة أعلنت نجاحًا وهي تحرس صفر قيمة منذ أول commit في
 * المستودع** — مُقاس بتشغيل فاحص كل commit على شجرته: `0/26` عند
 * `036c8f7` و`0/27` من `5db3b82` فصاعدًا. لم تكن انحدارًا بل وُلدت خاملة.
 *
 * ## المعيار الجديد — الارتباط لا الذِّكر
 *
 * enum **مربوط بالـAPI** إن وُجد `z.enum(...)` في `apps/api/src` يربطه:
 * - `z.enum(SHARED_NAME)` — يقبل **كل** قيم الثابت المشترك
 * - `z.enum(["أ", "ب"])` — يقبل **هذه القيم وحدها** (ربط مضيَّق)
 *
 * **القيمة الميتة = قيمة في الثابت المشترك لا يقبلها أي ربط لهذا النوع.**
 * وهذا يلتقط صنف العطب الحقيقي: تضييق مخطط التحقّق إلى قائمة حرفية جزئية،
 * فتصير القيمة الباقية غير قابلة للكتابة من أي مسار.
 *
 * **نوع غير مربوط يُتجاوَز** — ليس قيمة ميتة بل ميزة لم تُبنَ (المسارات
 * تُبنى تدريجيًا). أول `z.enum` يربطه يُفعِّل الحراسة عليه كاملة فورًا.
 *
 * **والقراءة بالـAST لا بمطابقة نصية** (‏§7-ب البند 11): لا يُخدَع بذِكر داخل
 * تعليق ولا بتصادم اسم عمود بين نوعين — وكلاهما وقع فعلًا مع الفاحص السابق.
 */

const SHARED_ENUMS_FILE = join(process.cwd(), "packages/shared/src/enums.ts");
const API_DIR = join(process.cwd(), "apps/api/src");

interface EnumDef {
  name: string;
  values: string[];
}

/** ربط واحد: النوع المقصود، والقيم التي يقبلها هذا الربط، وموضعه للتقرير. */
interface Binding {
  enumName: string;
  accepts: Set<string>;
  where: string;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, files);
    } else if (full.endsWith(".ts") && !full.endsWith(".d.ts") && !full.endsWith(".test.ts")) {
      // تجهيزات الاختبار ليست طبقة تحقّق في الـAPI (القرار #125)
      if (full.includes(`${sep}test-support${sep}`)) continue;
      files.push(full);
    }
  }
  return files;
}

function parseSource(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

/**
 * يستخرج كل `export const NAME = ["أ", "ب"] as const;` من الثوابت المشتركة
 * **بقراءة الشجرة** لا بـregex — فلا يلتقط تعريفًا داخل تعليق ولا يفوّت
 * تعريفًا امتد على أسطر بصيغة غير متوقَّعة.
 */
function parseSharedEnums(): EnumDef[] {
  const defs: EnumDef[] = [];
  const source = parseSource(SHARED_ENUMS_FILE);

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !/^[A-Z][A-Z0-9_]*$/.test(decl.name.text)) continue;
      const init = decl.initializer;
      // الشكل `[...] as const` — الشجرة تعطي AsExpression حول ArrayLiteral
      const array =
        init && ts.isAsExpression(init) && ts.isArrayLiteralExpression(init.expression)
          ? init.expression
          : init && ts.isArrayLiteralExpression(init)
            ? init
            : undefined;
      if (!array) continue;

      const values = array.elements
        .filter(ts.isStringLiteral)
        .map((element) => element.text)
        .filter((value) => value.length > 0);
      if (values.length > 0) defs.push({ name: decl.name.text, values });
    }
  }
  return defs;
}

/** يطابق `z.enum(...)` تحديدًا — لا أي دالة أخرى اسمها enum. */
function isZodEnumCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "enum" &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "z"
  );
}

/**
 * يجمع كل ارتباطات `z.enum` في طبقة الـAPI.
 *
 * الوسيط معرِّفًا (`z.enum(HOUSE_TYPE)`) ← ربط كامل بذلك النوع.
 * الوسيط قائمة حرفية (`z.enum(["مفتوح"])`) ← ربط مضيَّق بالنوع **الوحيد**
 * الذي يحتوي كل قيمها. قائمة لا تنتمي لأي نوع مشترك (مثل مستويات السجل في
 * `env.ts`) تُتجاهَل، وقائمة تنتمي لأكثر من نوع تُبلَّغ التباسًا لا تُتجاهَل.
 */
function collectBindings(
  enums: EnumDef[],
  files: string[]
): { bindings: Binding[]; ambiguous: string[] } {
  const byName = new Map(enums.map((def) => [def.name, def]));
  const bindings: Binding[] = [];
  const ambiguous: string[] = [];

  for (const file of files) {
    const source = parseSource(file);
    const rel = relative(process.cwd(), file);

    const visit = (node: ts.Node): void => {
      if (isZodEnumCall(node)) {
        const arg = node.arguments[0];
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const where = `${rel}:${String(line)}`;

        if (arg && ts.isIdentifier(arg)) {
          const def = byName.get(arg.text);
          if (def) bindings.push({ enumName: def.name, accepts: new Set(def.values), where });
        } else if (arg && ts.isArrayLiteralExpression(arg)) {
          const literals = arg.elements.filter(ts.isStringLiteral).map((e) => e.text);
          if (literals.length > 0 && literals.length === arg.elements.length) {
            const owners = enums.filter((def) => literals.every((v) => def.values.includes(v)));
            if (owners.length === 1 && owners[0]) {
              bindings.push({
                enumName: owners[0].name,
                accepts: new Set(literals),
                where,
              });
            } else if (owners.length > 1) {
              ambiguous.push(
                `${where}: [${literals.join(", ")}] ← ${owners.map((o) => o.name).join(" أو ")}`
              );
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return { bindings, ambiguous };
}

export function checkEnumUsage(): { ok: boolean; message: string } {
  const enums = parseSharedEnums();
  const files = existsSync(API_DIR) ? walk(API_DIR) : [];
  const { bindings, ambiguous } = collectBindings(enums, files);

  const acceptedByEnum = new Map<string, Set<string>>();
  const placesByEnum = new Map<string, string[]>();
  for (const binding of bindings) {
    const accepted = acceptedByEnum.get(binding.enumName) ?? new Set<string>();
    for (const value of binding.accepts) accepted.add(value);
    acceptedByEnum.set(binding.enumName, accepted);
    placesByEnum.set(binding.enumName, [
      ...(placesByEnum.get(binding.enumName) ?? []),
      binding.where,
    ]);
  }

  const dead: string[] = [];
  const bound: EnumDef[] = [];
  const unbound: string[] = [];

  for (const def of enums) {
    const accepted = acceptedByEnum.get(def.name);
    if (!accepted) {
      unbound.push(def.name);
      continue;
    }
    bound.push(def);
    for (const value of def.values) {
      if (!accepted.has(value)) {
        dead.push(
          `${def.name}."${value}" — مربوط في ${(placesByEnum.get(def.name) ?? []).join("، ")} ولا يقبلها`
        );
      }
    }
  }

  const totalValues = enums.reduce((sum, d) => sum + d.values.length, 0);
  const guardedValues = bound.reduce((sum, d) => sum + d.values.length, 0);
  const header =
    `${String(bound.length)}/${String(enums.length)} نوع enum مربوط بمخطط تحقّق في الـAPI ` +
    `(${String(guardedValues)}/${String(totalValues)} قيمة تحت الحراسة)`;

  if (ambiguous.length > 0) {
    return {
      ok: false,
      message:
        `قائمة حرفية في z.enum تنتمي لأكثر من نوع — الربط ملتبس:\n  - ${ambiguous.join("\n  - ")}\n` +
        `\n${header}\nاستعمل الثابت المشترك بالاسم بدل القائمة الحرفية.`,
    };
  }

  if (dead.length > 0) {
    return {
      ok: false,
      message:
        `قيم enum ميتة — معرَّفة في المخطط ولا مخطط تحقّق في الـAPI يقبلها:\n  - ${dead.join("\n  - ")}\n` +
        `\n${header}\nقيمة ميتة تفسد كل تقرير يجمّع حسب هذا النوع (السبب الأصلي للفاحص — القرار #71).`,
    };
  }

  const boundNames = bound.map((d) => d.name).join("، ");
  const suffix =
    unbound.length > 0
      ? `\n  مربوطة ومحروسة: ${boundNames}` +
        `\n  أنواع لا يربطها أي مخطط تحقّق بعد (ميزات لم تُبنَ، تُحرَس فور أول z.enum يربطها): ${unbound.join(", ")}`
      : " — كل الأنواع مربوطة وكل قيمها مقبولة";

  return { ok: true, message: `${header}${suffix}` };
}
