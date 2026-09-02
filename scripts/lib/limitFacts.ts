import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

import * as schema from "@dawajin/db";

import { introspectRoutes } from "./introspectRoutes";

/**
 * حقائقُ المستودع التي تكذّب الحدود المعلنة (القرار 269 على 268).
 *
 * **ثلاثةُ أسئلة لا رابع لها**، **ولكلٍّ مجموعةٌ مغلقة يُصدَّق بها الوسم** —
 * **فاسمٌ خارجها «لا أعرف» لا «صادق»**: وسمٌ فيه خطأٌ إملائيّ يُقرأ صادقًا
 * إلى الأبد ولا يُكتشف، **وهو أسوأ ما بُني هذا الفاحص ليمنعه**.
 */

const PROD_ROOTS = ["apps/api/src", "packages/shared/src", "packages/db/src"];

function isProductionFile(path: string): boolean {
  return (
    path.endsWith(".ts") &&
    !path.includes(".test.") &&
    !path.includes("test-support") &&
    !path.endsWith(".d.ts")
  );
}

export function productionFiles(roots: readonly string[] = PROD_ROOTS): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (isProductionFile(full)) out.push(full);
    }
  };
  for (const root of roots) walk(root);
  return out;
}

export function sourceOf(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

/**
 * أعمدةُ كل جدول في المخطط — **المجموعة المغلقة لسؤال الكاتب**.
 *
 * **تُقرأ من رمز drizzle الداخلي لا من `getTableColumns`** — الأخيرة تطلب نوع
 * `Table` فتُجبر على تأكيدٍ غير آمن على قيمةٍ مجهولة النوع من `Object.entries`.
 */
const DRIZZLE_COLUMNS = Symbol.for("drizzle:Columns");

export function schemaColumns(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [name, value] of Object.entries(schema)) {
    if (typeof value !== "object") continue;
    const columns = (value as unknown as Record<symbol, unknown>)[DRIZZLE_COLUMNS];
    if (columns === null || typeof columns !== "object") continue;
    out.set(name, new Set(Object.keys(columns)));
  }
  return out;
}

/** يتتبّع `x.insert(T).values(…)` أو `x.update(T).set(…)` إلى جدولها. */
function chainTable(call: ts.CallExpression): string | null {
  let node: ts.Expression = call.expression;
  while (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const kind = node.expression.name.text;
      if (kind === "insert" || kind === "update") {
        const target = node.arguments[0];
        return target && ts.isIdentifier(target) ? target.text : "<غير معرّف>";
      }
      node = node.expression.expression;
    } else if (ts.isPropertyAccessExpression(node)) node = node.expression;
    else break;
  }
  return null;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/**
 * أعمدةُ كائنٍ حرفيّ — **ونشرُ `...(cond ? {…} : {…})` معدودٌ لا غامض**
 * (مقيس: كلُّ نشرٍ في المستودع من هذه الصيغة، صفر عصيّ).
 * @returns الأعمدة، أو `null` إن كان الشكل غير قابل للعدّ
 */
function literalColumns(node: ts.Expression): string[] | null {
  const expr = unwrap(node);
  if (ts.isArrowFunction(expr)) {
    return ts.isBlock(expr.body) ? null : literalColumns(expr.body);
  }
  if (ts.isCallExpression(expr)) return mapCallColumns(expr);
  if (ts.isConditionalExpression(expr)) {
    const left = literalColumns(expr.whenTrue);
    const right = literalColumns(expr.whenFalse);
    return left === null || right === null ? null : [...left, ...right];
  }
  return ts.isObjectLiteralExpression(expr) ? objectColumns(expr) : null;
}

/** `rows.map((r) => ({ … }))` — الشكلُ الوحيد المستعمَل في المستودع (مقيس). */
function mapCallColumns(expr: ts.CallExpression): string[] | null {
  if (!ts.isPropertyAccessExpression(expr.expression)) return null;
  if (expr.expression.name.text !== "map") return null;
  const fn = expr.arguments[0];
  return fn !== undefined && ts.isArrowFunction(fn) ? literalColumns(fn) : null;
}

function objectColumns(expr: ts.ObjectLiteralExpression): string[] | null {
  const columns: string[] = [];
  for (const prop of expr.properties) {
    if (ts.isSpreadAssignment(prop)) {
      const nested = literalColumns(prop.expression);
      if (nested === null) return null;
      columns.push(...nested);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      columns.push(prop.name.text);
      continue;
    }
    if (!ts.isPropertyAssignment(prop)) return null;
    const name = prop.name;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) columns.push(name.text);
    else return null;
  }
  return columns;
}

export interface WriterFacts {
  /** الجدول ← الأعمدة المكتوبة في الإنتاج. */
  written: Map<string, Set<string>>;
  /** الجدول ← أوّلُ موضعِ كتابةٍ لا يُقرأ (فيصير الجدول كلُّه «لا أعرف»). */
  opaque: Map<string, string>;
}

/** يقرأ موضعَ كتابةٍ واحدًا: إمّا يزيد أعمدةً معدودة، وإمّا يسجّل عتمة. */
function readWriteSite(
  node: ts.CallExpression,
  src: ts.SourceFile,
  file: string,
  facts: WriterFacts
): void {
  const table = chainTable(node);
  if (table === null) return;
  const line = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
  const arg = node.arguments[0];
  const columns = arg === undefined ? null : literalColumns(arg);
  if (table === "<غير معرّف>" || columns === null) {
    if (!facts.opaque.has(table)) facts.opaque.set(table, `${file}:${String(line)}`);
    return;
  }
  const set = facts.written.get(table) ?? new Set<string>();
  for (const column of columns) set.add(column);
  facts.written.set(table, set);
}

/** `SQL` خام يكتب — **لا يُقرأ، فيُعتِم جدولَه** بدل أن يُتجاهل صامتًا. */
function readRawWrite(
  node: ts.CallExpression,
  src: ts.SourceFile,
  file: string,
  facts: WriterFacts
): void {
  const arg = node.arguments[0];
  const match = /INSERT\s+INTO\s+(\w+)|UPDATE\s+(\w+)\s+SET/i.exec(
    arg === undefined ? "" : arg.getText(src)
  );
  if (match === null) return;
  const table = match[1] ?? match[2] ?? "<sql>";
  const line = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
  if (!facts.opaque.has(table)) facts.opaque.set(table, `${file}:${String(line)} (SQL خام)`);
}

/** يمسح كتّاب الأعمدة في كود الإنتاج — وما لا يُقرأ يُسجَّل عتمةً لا يُتجاوز. */
export function writerFacts(files: readonly string[]): WriterFacts {
  const facts: WriterFacts = { written: new Map(), opaque: new Map() };
  for (const file of files) {
    const src = sourceOf(file);
    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const name = node.expression.name.text;
        if (name === "values" || name === "set") readWriteSite(node, src, file, facts);
        else if (name === "execute") readRawWrite(node, src, file, facts);
      }
      ts.forEachChild(node, walk);
    };
    walk(src);
  }
  return facts;
}

export interface ExportFacts {
  /** اسمُ الدالّة المُصدَّرة ← ملفُّ إعلانها — **المجموعة المغلقة لسؤال المستدعي**. */
  declaredIn: Map<string, string>;
  /** اسمُ الدالّة ← عددُ مراجعها الإنتاجية خارج ملفّها. */
  references: Map<string, number>;
}

export function exportFacts(files: readonly string[]): ExportFacts {
  const declaredIn = new Map<string, string>();
  const sources = new Map<string, ts.SourceFile>();
  for (const file of files) {
    const src = sourceOf(file);
    sources.set(file, src);
    ts.forEachChild(src, (node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        declaredIn.set(node.name.text, file);
      }
    });
  }

  const references = new Map<string, number>();
  for (const [file, src] of sources) {
    const walk = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const home = declaredIn.get(node.text);
        if (home !== undefined && home !== file) {
          references.set(node.text, (references.get(node.text) ?? 0) + 1);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(src);
  }
  return { declaredIn, references };
}

/**
 * المسارات المُعلنة في المواصفة التقنية — **المجموعة المغلقة الثانية لسؤال
 * المسار**، **وبها وحدها يُسدّ ثقبُ الإملاء** (قرار المالك، 269).
 *
 * **وتطبيعُ البادئة شرطُ المقارنة لا تفصيلَ تنفيذ:** المواصفة تكتب
 * `/auth/me` والكود يسجّل `/api/auth/me`.
 */
export function specRoutes(specPath = "docs/backend-technical-spec.md"): Set<string> {
  const text = readFileSync(specPath, "utf8");
  const out = new Set<string>();
  for (const [, method, path] of text.matchAll(/\b(GET|POST|PATCH|PUT|DELETE)\s+(\/[\w/:-]+)/g)) {
    if (method === undefined || path === undefined) continue;
    out.add(`${method} ${path.startsWith("/api/") ? path : `/api${path}`}`);
  }
  return out;
}

export async function registeredRoutes(): Promise<Set<string>> {
  const routes = await introspectRoutes();
  return new Set(routes.map((r) => `${r.method} ${r.path}`));
}
