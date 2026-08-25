import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * فاحص «الشعار مصدر واحد» — يفشل البناء إن ضُمِّن الشعار خارج ملفه (القرار
 * #109). الغرض عملي لا شكلي: تغيير الشعار مستقبلًا يجب أن يكون تعديلًا في
 * **ملف واحد لا أكثر**، وهذا لا يصمد بالاتفاق وحده — أول شاشة تكتب اسم
 * التطبيق نصًا تُعيد المشكلة صامتة.
 *
 * ثلاثة أشكال للتضمين، كلها ممنوعة خارج `components/ui/Logo.tsx`:
 *   1. **اسم العلامة نصًا كعلامة** — أبسط صور التضمين وأكثرها وقوعًا فعلًا.
 *      الاسم كلمة عربية شائعة، فالمطابقة على استعماله **وحده** عقدةَ نصّ أو
 *      قيمةً حرفية، لا على وروده داخل جملة (`مزارع دواجن التسمين` سليم).
 *   2. **بيانات مسار SVG** (`<Path d="…">`) — نسخ مسارات العمل الفني.
 *   3. **استيراد أصل الشعار** من `assets/` — حين يصل عمل فني حقيقي.
 *
 * `Chart.tsx` يستعمل `react-native-svg` بشرعية (تمثيل بيانات لا عمل فني)
 * ولا يحتاج استثناءً: هو يبني `Polyline` من نقاط محسوبة، ولا يكتب `d=`.
 * منع بيانات المسار تحديدًا — لا منع SVG كلّه — هو ما يجعل الفاحص بلا
 * قائمة استثناءات تُوسَّع لاحقًا فتُفرغه.
 *
 * `app.json` معفى: إعداد Expo لاسم التطبيق على نظام التشغيل، ليس شاشة.
 */

const MOBILE_DIR = join(process.cwd(), "apps/mobile");
const LOGO_FILE = join("components", "ui", "Logo.tsx");
const SKIP_DIRS = new Set(["node_modules", ".expo", "dist"]);

/** اسم العلامة كما يظهر للمستخدم — القيمة نفسها المعرَّفة في `Logo.tsx`. */
const BRAND_NAME = "دواجن";

/**
 * اسم العلامة **وحده** عقدةَ نصّ أو قيمةً حرفية — لا مجرد وروده داخل جملة.
 * الاسم كلمة عربية شائعة، فسطر مثل «نظام إدارة مزارع دواجن التسمين» استعمال
 * لغوي عادي لا تضمين للشعار. المطابقة على الاستعمال **كعلامة**: عقدة JSX
 * لا تحمل غيره (`>دواجن<`)، أو نصّ حرفي يساويه بالضبط (`"دواجن"`).
 */
const BRAND_AS_MARK = new RegExp(`>\\s*${BRAND_NAME}\\s*<|["']${BRAND_NAME}["']`);
const SVG_PATH_DATA = /<Path[^>]*\sd=/;

/**
 * استيراد **أصل** شعار — لا استيراد المكوّن نفسه: المسار يجب أن يكون ملف
 * وسائط (امتداد صريح أو تحت `assets/`). بلا هذا التقييد يبلّغ الفاحص عن
 * `from "@/components/ui/Logo"` في كل شاشة تستعمله، أي عن الاستعمال الصحيح.
 */
const LOGO_ASSET_IMPORT =
  /from\s+["'](?:[^"']*assets\/[^"']*logo[^"']*|[^"']*logo[^"']*\.(?:svg|png|jpg|webp))["']/i;

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

export function checkLogoSingleSource(): { ok: boolean; message: string } {
  const violations: string[] = [];

  for (const file of walkFiles(MOBILE_DIR)) {
    const relPath = relative(MOBILE_DIR, file);
    if (relPath === LOGO_FILE) continue;

    const content = readFileSync(file, "utf8");
    if (BRAND_AS_MARK.test(content)) {
      violations.push(`${relPath}: اسم العلامة "${BRAND_NAME}" نصًا — استعمل <Logo />`);
    }
    if (SVG_PATH_DATA.test(content)) {
      violations.push(`${relPath}: بيانات مسار SVG (<Path d=…>) — العمل الفني في Logo.tsx وحده`);
    }
    if (LOGO_ASSET_IMPORT.test(content)) {
      violations.push(`${relPath}: استيراد أصل شعار — يُستورد في Logo.tsx وحده`);
    }
  }

  if (violations.length > 0) {
    return {
      ok: false,
      message: `الشعار مُضمَّن خارج ملفه الوحيد:\n  - ${violations.join("\n  - ")}`,
    };
  }
  return { ok: true, message: `الشعار في ${LOGO_FILE} وحده — لا تضمين في أي شاشة` };
}
