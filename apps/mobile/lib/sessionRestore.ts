import { LoginRequestError, fetchCurrentUser, type AuthenticatedUser } from "./api";
import { clearToken, readToken } from "./session";

/**
 * استعادة الجلسة — **على نطاق الجذر لا داخل `app/index.tsx`** (القرار رقم 177).
 *
 * **السبب مقيس لا مفترض:** جسم مؤثّر `index.tsx` لم يُنفَّذ إطلاقًا في أربع
 * جولات قياس؛ لم تُسجَّل حتى أول علامة داخله، ولم يغادر طلبه الجهاز — مستمع
 * مستقل يسجّل **عند الاستلام** لم يرَ شيئًا بينما سجّل كل طلب ضابط من الجوال
 * نفسه. فكل منطق يعتمد على تنفيذ كود داخل تلك الشاشة ساقط سلفًا، ونطاق الوحدة
 * في الجذر هو ما ثبت عمله ثلاث مرات.
 *
 * فالملف كله **منطق خالص قابل للاختبار بلا تصيير**، والمخزن أدناه يبدأ عند
 * الاستيراد من `app/_layout.tsx` — لا من مؤثّر شاشة.
 */

/** المهلة الصريحة لكل محاولة: طلب معلّق ينتهي إلى نتيجة معلنة لا إلى صمت. */
export const RESTORE_TIMEOUT_MS = 8_000;

export type SessionOutcome =
  | { kind: "signed-out" }
  | { kind: "signed-in"; user: AuthenticatedUser }
  | { kind: "unreachable" };

export type RestoreState = { status: "pending" } | { status: "settled"; outcome: SessionOutcome };

/**
 * **القاعدة الحاكمة: فشل الشبكة لا يُنهي الجلسة.**
 *
 * الخادم وحده يقرّر أن الرمز لم يعد صالحًا (401، أو حساب عُطِّل) — وعندها
 * يُمحى الرمز وتُعرض شاشة الدخول. أما انقطاع الشبكة أو انتهاء المهلة أو خطأ
 * خادم (5xx) **فلا يمسّ الرمز إطلاقًا**: مربٍّ داخل عنبر ضعيف التغطية يجب
 * ألّا يُطرد من جلسته ويُطالَب بكلمة مرور لا يحملها معه.
 */
function serverRejectedToken(caught: unknown): boolean {
  if (!(caught instanceof LoginRequestError)) return false;
  const { status, code } = caught.failure;
  if (status === 401) return true;
  return status === 403 && code === "account_disabled";
}

/** محاولة واحدة بمهلة صريحة عبر `AbortController`. */
async function attempt(token: string): Promise<SessionOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, RESTORE_TIMEOUT_MS);

  try {
    const user = await fetchCurrentUser(token, controller.signal);
    return { kind: "signed-in", user };
  } catch (caught: unknown) {
    if (!serverRejectedToken(caught)) return { kind: "unreachable" };
    await clearToken();
    return { kind: "signed-out" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * يقرأ الرمز المحفوظ ويتحقق منه، **بمحاولة إعادة واحدة لا أكثر**.
 * @returns نتيجة معلنة دائمًا — لا صمت ولا تعليق
 */
export async function resolveSession(): Promise<SessionOutcome> {
  const token = await readToken();
  if (token === null) return { kind: "signed-out" };

  const first = await attempt(token);
  if (first.kind !== "unreachable") return first;
  // إعادة واحدة: الشبكة في العنبر تتقطّع لحظيًّا، ومحاولة ثانية تكفي غالبًا
  return await attempt(token);
}

// ── مخزن الحالة: يبدأ عند الاستيراد من الجذر، ويبقى حيًّا عبر كل تحويل ──

let state: RestoreState = { status: "pending" };
let started = false;
const listeners = new Set<() => void>();

function publish(next: RestoreState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** يبدأ الاستعادة مرة واحدة — استدعاؤه مرارًا لا يعيد إطلاق الطلب. */
export function beginRestore(): void {
  if (started) return;
  started = true;
  void resolveSession().then((outcome) => {
    publish({ status: "settled", outcome });
  });
}

/** إعادة المحاولة بيد المستخدم بعد حالة «تعذّر الاتصال». */
export function retryRestore(): void {
  started = false;
  publish({ status: "pending" });
  beginRestore();
}

export function subscribeRestore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function restoreSnapshot(): RestoreState {
  return state;
}
