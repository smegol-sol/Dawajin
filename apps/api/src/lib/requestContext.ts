import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** يُستدعى مرة واحدة من middleware/requestId.ts فقط. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * يُستدعى من أي مكان في مسار تنفيذ الطلب (مثل lib/auditLog.ts) بلا الحاجة
 * لتمرير معرّف الطلب يدويًا عبر كل استدعاء دالة — هذا هو جوهر الطلب:
 * "يُمرَّر تلقائيًا لكل كتابة تدقيق — لا يدويًا في كل موضع".
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
