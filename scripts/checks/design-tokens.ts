import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import tokens from "../../apps/mobile/constants/tokens.json" with { type: "json" };

/**
 * فاحص رموز التصميم — يمنع لونًا حرفيًا · رماديًا أفتح من #4A4A4A · إيموجي ·
 * نصف قطر خارج المقياس · وزن/عائلة خط خارج المسموح · نص محتوى أصغر من
 * $minContentSize (backend-technical-spec.md §21 · app-complete-spec.md §7.2
 * و§12: "لا وزن أخف من 500"، "الحد الأدنى لنص المحتوى 15px").
 *
 * القيم المسموحة كلها تُقرأ من tokens.json/theme.ts — لا تُكرَّر كثوابت هنا،
 * فتعديل الرمز المركزي يكفي لتحديث الفاحص بلا تعارض بينهما.
 *
 * **فحص اللون وحده يجري على الكود بلا تعليقات** (القرار #107): مرجع قرار
 * ثلاثي الخانات مثل `#106` هو لون سداسي مختصر صالح شكلًا، فكان الفاحص يبلّغ
 * عن كل إشارة إلى قرار في تعليق. الحدّ الصحيح أن "اللون الحرفي" قيمة في
 * الكود لا إشارة في نثر. وتُستثنى معها صيغة «القرار #NNN» أينما وردت، لأنها
 * تظهر في عناوين الاختبارات وهي نصوص لا تعليقات. بقية الفحوص (الإيموجي
 * خصوصًا) تبقى على النص كاملًا: الإيموجي ممنوع في التعليقات أيضًا.
 */

const MOBILE_DIR = join(process.cwd(), "apps/mobile");
const EXEMPT_FILES = new Set(["constants/tokens.json", "constants/theme.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".expo", "dist", "assets"]);

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
// `//` تبدأ تعليقًا إلا إن سبقتها نقطتان (`https://`) — الاستثناء الوحيد
// الموجود فعلًا في كود الموبايل، ولو زال يبقى النمط صحيحًا
const LINE_COMMENT = /(?<!:)\/\/[^\n]*/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
// إشارة قرار داخل نص ظاهر (عنوان اختبار مثلًا) — ليست تعليقًا فلا يكفي
// حذف التعليقات، و"القرار" قبلها تجعلها لا تلتبس بلون قط
const DECISION_REFERENCE = /القرار(?:ان|ين|ات)?\s*#\d+(?:\s*(?:،|و)\s*#\d+)*/g;
// نطاقات الإيموجي الشائعة (لا تلتقط علامات RTL أو رموز نصية عادية)
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;
const BORDER_RADIUS_LITERAL = /borderRadius:\s*(-?\d+(?:\.\d+)?)/g;
const FONT_WEIGHT_ASSIGNMENT = /fontWeight:\s*([^,\n}]+)/g;
const FONT_FAMILY_ASSIGNMENT = /fontFamily:\s*([^,\n}]+)/g;
const FONT_SIZE_ASSIGNMENT = /fontSize:\s*([^,\n}]+)/g;
const ALLOWED_FONT_WEIGHTS = new Set([
  String(tokens.typography.weights.regular),
  String(tokens.typography.weights.bold),
]);
const ALLOWED_FONT_FAMILIES = new Set([
  tokens.typography.loadedFamilies.regular,
  tokens.typography.loadedFamilies.bold,
]);
// أحجام النص المسموح لها بالنزول عن الحد الأدنى — الثلاثة المصرَّح بها حرفيًا
// في §7.2 (الشارات · تسميات التبويبات · المراجع التقنية)، مقروءة من الرمز.
const MIN_CONTENT_SIZE = tokens.typography.$minContentSize;
const ALLOWED_SMALL_SIZES = new Set([
  tokens.typography.size.badge,
  tokens.typography.size.tabLabel,
  tokens.typography.size.technicalRef,
]);

/**
 * يستخرج القيمة الحرفية من تعبير fontWeight/fontFamily/fontSize، أو null إن
 * كان التعبير مشتقًا من `font.weight*`/`font.family*`/`font.size.*` (موثوق
 * مركزيًا عبر theme.ts، لا حاجة لفحصه حرفيًا هنا).
 */
function extractFontLiteral(rawExpression: string): string | null {
  const trimmed = rawExpression.trim();
  if (
    trimmed.includes("font.weight") ||
    trimmed.includes("font.family") ||
    trimmed.includes("font.size")
  )
    return null;
  const quoted = trimmed.match(/^["']([^"']+)["']/);
  if (quoted) return quoted[1] ?? null;
  const bare = trimmed.match(/^([A-Za-z0-9_]+)/);
  return bare ? (bare[1] ?? null) : null;
}

/**
 * النص الذي يُفحَص بحثًا عن لون حرفي: الكود بلا تعليقات وبلا إشارات القرارات
 * (القرار #107). لا يُستعمل لبقية الفحوص — الإيموجي ممنوع في التعليقات أيضًا.
 */
function colorScannableText(content: string): string {
  return content
    .replaceAll(BLOCK_COMMENT, "")
    .replaceAll(LINE_COMMENT, "")
    .replaceAll(DECISION_REFERENCE, "");
}

function collectAllowedHexColors(): Set<string> {
  const allowed = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node === "string" && /^#[0-9a-fA-F]{3,8}$/.test(node)) {
      allowed.add(node.toLowerCase());
    } else if (node && typeof node === "object") {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(tokens);
  return allowed;
}

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function isGrayscaleLighterThanBody(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6 && clean.length !== 3) return false;
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (r !== g || g !== b) return false; // ليس رماديًا محايدًا
  return r > 0x4a; // أفتح من #4A4A4A
}

export function checkDesignTokens(): { ok: boolean; message: string } {
  const allowedHex = collectAllowedHexColors();
  const allowedRadii = new Set(Object.values(tokens.radius as Record<string, number>));
  const violations: string[] = [];

  for (const file of walkFiles(MOBILE_DIR)) {
    const relPath = relative(MOBILE_DIR, file);
    if (EXEMPT_FILES.has(relPath)) continue;

    const content = readFileSync(file, "utf8");
    for (const match of colorScannableText(content).matchAll(HEX_COLOR)) {
      const hex = match[0].toLowerCase();
      if (!allowedHex.has(hex)) {
        const reason = isGrayscaleLighterThanBody(hex)
          ? "رمادي أفتح من #4A4A4A"
          : "لون حرفي خارج ملف الرموز";
        violations.push(`${relPath}: "${hex}" — ${reason}`);
      }
    }

    for (const match of content.matchAll(EMOJI)) {
      violations.push(`${relPath}: إيموجي "${match[0]}" ممنوع — استخدم lucide-react-native`);
    }

    for (const match of content.matchAll(BORDER_RADIUS_LITERAL)) {
      const value = Number(match[1]);
      if (!allowedRadii.has(value)) {
        violations.push(`${relPath}: borderRadius=${value} خارج المقياس الخمسي`);
      }
    }

    for (const match of content.matchAll(FONT_WEIGHT_ASSIGNMENT)) {
      const literal = extractFontLiteral(match[1] ?? "");
      if (literal !== null && !ALLOWED_FONT_WEIGHTS.has(literal)) {
        violations.push(`${relPath}: fontWeight="${literal}" — لا وزن أخف من 500، فقط 500 أو 700`);
      }
    }

    for (const match of content.matchAll(FONT_FAMILY_ASSIGNMENT)) {
      const literal = extractFontLiteral(match[1] ?? "");
      if (literal !== null && !ALLOWED_FONT_FAMILIES.has(literal)) {
        violations.push(
          `${relPath}: fontFamily="${literal}" — استخدم font.familyRegular أو font.familyBold`
        );
      }
    }

    for (const match of content.matchAll(FONT_SIZE_ASSIGNMENT)) {
      const literal = extractFontLiteral(match[1] ?? "");
      if (literal === null) continue; // مشتق من font.size.* — موثوق مركزيًا
      const size = Number(literal);
      if (Number.isNaN(size)) continue;
      if (size < MIN_CONTENT_SIZE && !ALLOWED_SMALL_SIZES.has(size)) {
        violations.push(
          `${relPath}: fontSize=${size} — دون الحد الأدنى لنص المحتوى (${MIN_CONTENT_SIZE}px)، محصور بـ font.size.badge/tabLabel/technicalRef`
        );
      }
    }
  }

  if (violations.length > 0) {
    return { ok: false, message: `مخالفات رموز التصميم:\n  - ${violations.join("\n  - ")}` };
  }
  return { ok: true, message: "لا مخالفات لرموز التصميم" };
}
