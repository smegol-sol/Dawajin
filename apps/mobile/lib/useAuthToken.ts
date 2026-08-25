import { useEffect, useState } from "react";

import { readToken } from "./session";

/**
 * يقرأ رمز الجلسة مرة واحدة عند التركيب.
 *
 * `undefined` = لم تُقرأ بعد، و`null` = لا جلسة. التمييز ضروري: بلا وجود
 * الحالة الأولى تبدأ الشاشة بطلب برمز فارغ فتُظهر خطأ مصادقة كاذبًا في أول
 * إطار قبل أن يصل الرمز.
 */
export function useAuthToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    readToken()
      .then((value) => {
        if (alive) setToken(value);
      })
      .catch(() => {
        if (alive) setToken(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return token;
}
