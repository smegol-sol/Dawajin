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
 * **الاستثناء الوحيد في فحص اللون هو صيغة «القرار #NNN»** (القرار #110،
 * تضييقًا للقرار #107): مرجع قرار ثلاثي الخانات مثل `#106` هو لون سداسي
 * مختصر صالح شكلًا، فكان الفاحص يبلّغ عن كل إشارة إلى قرار.
 *
 * النسخة الأولى من العلاج حذفت **التعليقات كلها** قبل فحص اللون، وكان ذلك
 * أوسع من المشكلة: لون حقيقي في تعليق (`// كان #AB12CD سابقًا`) كان يمرّ —
 * **مُثبَت بمخالفة متعمَّدة، لا مُستنتَجًا.** الاستثناء صار مقصورًا على نمط
 * الإحالة نفسه، فيُفحص كل ما عداه في التعليقات كما في الكود.
 *
 * بقية الفحوص تبقى على النص كاملًا كما كانت — الإيموجي ممنوع في التعليقات.
 */

const MOBILE_DIR = join(process.cwd(), "apps/mobile");
const EXEMPT_FILES = new Set(["constants/tokens.json", "constants/theme.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".expo", "dist", "assets"]);

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
/**
 * **إحالة قرار وحدها** — لا التعليقات كلها (القرار #110 يضيّق #107):
 * `القرار` (أو تثنيتها/جمعها) ثم `#` ثم رقم من ثلاث خانات فأقل، مع سلسلة
 * أرقام تالية معطوفة. الكلمة قبل الرقم هي كل الفرق: بلا اشتراطها يصير
 * الاستثناء لكل نصّ في تعليق، فيمرّ لون حقيقي مثل `// كان #AB12CD سابقًا`.
 *
 * ولذلك **صيغة الاستشهاد موحَّدة إلزامًا**: `القرار #NNN` لا `#NNN` وحدها
 * ولا `في #NNN`. الفاحص يفرض التوحيد فرضًا — وقد أمسك ثلاثة مواضع مخالفة
 * له عند تضييق النمط.
 */
const DECISION_REFERENCE = /القرار(?:ان|ين|ات)?\s*#\d{1,3}(?:\s*(?:،|و)\s*#\d{1,3})*/g;
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
/**
 * **كتلةُ نمطٍ بلا أقواسٍ متداخلة** — `name: { ... }` في `StyleSheet.create`.
 * **والنمطُ لا يعبر التداخل عمدًا**: كتلٌ متداخلة نادرةٌ في أنماط هذا
 * المستودع، **وتوسيعُه يجعل التطابقَ يبتلع كتلًا مجاورة فيُنتج إنذارًا أوسع**.
 */
const STYLE_BLOCK = /(\w+):\s*\{([^{}]*)\}/g;

/**
 * **كتلٌ تضبط `fontSize` بلا `fontFamily` — ومسموحٌ لها ذلك بعلّتها.**
 *
 * **قائمةٌ موجبةٌ باسم الملف والكتلة، واتجاهُ سكوتها صحيح** (القرار 276):
 * **ما لا يُدرَج يُمنع** — كتلةٌ جديدة لا تُعفى بالسكوت.
 *
 * **والواحدةُ القائمة مقيسة:** `BottomTabBar.label` **تضبط العائلة في موضع
 * الاستدعاء لا في الكتلة** (`fontFamily: tab.active ? familyBold : familyRegular`)
 * — **لأنها تتغيّر بحالة التبويب فلا تثبت في نمطٍ ساكن**. **يسقط الاستثناء
 * يوم تصير العائلةُ ثابتةً في الكتلة** (القرار 268).
 */
const FONT_FAMILY_EXEMPT = new Set(["components/ui/BottomTabBar.tsx:label"]);

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
 * النص الذي يُفحَص بحثًا عن لون حرفي: الملف كاملًا **عدا إحالات القرارات**
 * (القرار #110). التعليقات تُفحَص كبقية الكود — لون حرفي فيها مخالفة أيضًا.
 */
function colorScannableText(content: string): string {
  return content.replaceAll(DECISION_REFERENCE, "");
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

    // **الخاصّيةُ الغائبة لا القيمةُ المكتوبة** (القرار 289): كلُّ الفحوص
    // أعلاه تقرأ ما كُتب، **فكتلةٌ تضبط `fontSize` ولا تضبط `fontFamily`
    // تمرّ صامتةً** — **ونصُّها العربيّ يسقط على خطّ النظام**، وهو ما وقع في
    // `PlaceholderScreen` فأصاب **ثمانَ عشرةَ شاشة**.
    //
    // **واتجاهُ خطئه معلَن (270): يفشل ظلمًا** حين تُضبط العائلة في موضع
    // الاستدعاء — **مقيس: موضعٌ واحد من ثلاثةٍ يوم كُتب**، وله استثناءٌ بعلّته.
    // **ولا يمرّ ظلمًا فيما يفحصه**، **ويفوته ما لا يُكتب في كتلةِ نمطٍ أصلًا**
    // — **وذاك يمسكه ماسحُ الشاشات في تأكيدات التخطيط**.
    for (const match of content.matchAll(STYLE_BLOCK)) {
      const body = match[2] ?? "";
      if (!body.includes("fontSize") || body.includes("fontFamily")) continue;
      if (FONT_FAMILY_EXEMPT.has(`${relPath}:${match[1] ?? ""}`)) continue;
      violations.push(
        `${relPath}: كتلة «${match[1] ?? ""}» تضبط fontSize بلا fontFamily — ` +
          `النصّ العربيّ يسقط على خطّ النظام`
      );
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
