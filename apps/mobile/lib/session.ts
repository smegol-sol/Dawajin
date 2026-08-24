import * as SecureStore from "expo-secure-store";

/**
 * تخزين رمز الدخول — **expo-secure-store حصريًا** (backend-technical-spec.md
 * §11: "JWT في expo-secure-store"). لا AsyncStorage ولا أي مخزن آخر للرمز
 * إطلاقًا: AsyncStorage نص عادي على القرص، وهو بالضبط ما تمنعه القاعدة.
 *
 * هذا الملف هو **نقطة العبور الوحيدة** للرمز في التطبيق كله — أي قراءة أو
 * كتابة له تمر من هنا، فلا يتسرّب استدعاء مباشر لمخزن آخر في شاشة لاحقة.
 */

const TOKEN_KEY = "dawajin.auth.token";

/**
 * يحفظ رمز الدخول في المخزن الآمن.
 * @param token رمز JWT كما أرجعه الخادم
 */
export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/**
 * يقرأ الرمز المخزَّن إن وُجد.
 * @returns الرمز، أو null إن لم تكن هناك جلسة محفوظة
 */
export async function readToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

/** يمحو الجلسة المحفوظة — خروج، أو رفض الخادم لرمز لم يعد صالحًا. */
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
