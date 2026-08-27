import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * تخزين رمز الدخول — **`expo-secure-store` على الجوال، ومخزن المتصفح على
 * الويب** (القرار #165).
 *
 * **الجوال لم يتغيّر:** المواصفة §11 («JWT في `expo-secure-store`») قائمة كما
 * هي، **ولا `AsyncStorage` إطلاقًا** — فهو نصّ عادي على قرص الجهاز، وهو بالضبط
 * ما تمنعه القاعدة.
 *
 * **والويب أُضيف لأن `expo-secure-store` لا يعمل في المتصفح أصلًا** — لا يوجد
 * فيه Keychain ولا Keystore. فاستدعاؤه هناك **يرمي استثناءً عند أول قراءة،
 * فيعلق التطبيق على شاشة التحميل قبل أن يرسم شيئًا** (وقع فعلًا في أول تشغيل
 * على متصفح).
 *
 * **وحدّ هذا صريح ولا يُقرأ تصريحًا مفتوحًا:** `localStorage` **أضعف حمايةً**
 * من مخزن الجوال — لا تشفير على القرص، ويقرؤه أي سكربت يعمل في نفس الأصل.
 * وهو مقبول في **التطوير والمراجعة على المتصفح**، **ومنصة المحاسبين المخطَّطة
 * (القراران #137 و#138) تحتاج قرارها المستقل** في تخزين الرمز حين تُبنى.
 *
 * وهذا الملف يبقى **نقطة العبور الوحيدة** للرمز في التطبيق كله — أي قراءة أو
 * كتابة تمر من هنا، فلا يتسرّب استدعاء مباشر لمخزن آخر في شاشة لاحقة.
 */

const TOKEN_KEY = "dawajin.auth.token";

/** ما يحتاجه هذا الملف من مخزن المتصفح — لا أكثر. */
interface WebStore {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * مخزن المتصفح إن كان متاحًا.
 *
 * **يُقرأ داخل `try` لا بفحص وجود:** المتصفح في وضع التصفح الخاص، أو حين
 * تُمنع بيانات المواقع، **يرمي عند لمس `localStorage` نفسه** لا عند
 * استعماله — ففحص الوجود وحده لا يكفي.
 * @returns المخزن، أو `null` إن تعذّر — فيعمل التطبيق بلا جلسة محفوظة
 */
function webStore(): WebStore | null {
  try {
    // النوع هنا **أوسع من تصريح TypeScript عمدًا**: `lib.dom` يعلن
    // `localStorage` موجودًا دائمًا، **وهو غير موجود في بيئة React Native
    // أصلًا** — فالتصريح يصف المتصفح لا المنصات كلها.
    const store = (globalThis as { localStorage?: WebStore }).localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

const isWeb = Platform.OS === "web";

/**
 * يحفظ رمز الدخول في المخزن المناسب للمنصة.
 * @param token رمز JWT كما أرجعه الخادم
 */
export async function saveToken(token: string): Promise<void> {
  if (isWeb) {
    webStore()?.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/**
 * يقرأ الرمز المخزَّن إن وُجد.
 * @returns الرمز، أو `null` إن لم تكن هناك جلسة محفوظة
 */
export async function readToken(): Promise<string | null> {
  if (isWeb) return webStore()?.getItem(TOKEN_KEY) ?? null;
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

/** يمحو الجلسة المحفوظة — خروج، أو رفض الخادم لرمز لم يعد صالحًا. */
export async function clearToken(): Promise<void> {
  if (isWeb) {
    webStore()?.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
