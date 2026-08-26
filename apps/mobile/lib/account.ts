import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { fetchCurrentUser } from "./api";
import { clearToken, readToken } from "./session";

/**
 * حالة ورقة الحساب — **الاسم والدور والخروج** (القرار #166).
 *
 * الاسم والدور معروضان عمدًا لا زينةً: من يبدّل بين حسابات في جهاز واحد
 * **ينسب ما يراه إلى الحساب الخطأ** إن لم يقرأ من هو، وهي أشيع أخطاء
 * مراجعة الصلاحيات — أن يُظنّ التسريبُ صحيحًا أو الصحيحُ تسريبًا.
 */

/** أسماء الأدوار كما تُعرض — جدول صريح لا اشتقاق من قيمة الـenum. */
const ROLE_LABEL: Record<string, string> = {
  farmer: "مربّي",
  supervisor: "مشرف",
  vet: "طبيب بيطري",
  owner: "مالك",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

export interface AccountIdentity {
  fullName: string;
  role: string;
}

export interface AccountSheetState {
  visible: boolean;
  identity: AccountIdentity | undefined;
  open: () => void;
  close: () => void;
  logout: () => void;
}

/**
 * يقرأ هوية الحساب الحالي ويدير فتح الورقة والخروج منها.
 *
 * **والخروج يمحو الرمز ثم يوجّه إلى نقطة الدخول** — لا إلى شاشة الدخول
 * مباشرة: `app/index.tsx` هو من يقرّر الوجهة، فتوجيهٌ يتجاوزه يكرّر قراره
 * في موضعين ويتفارقان.
 * @returns حالة الورقة وأفعالها
 */
export function useAccountSheet(): AccountSheetState {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [identity, setIdentity] = useState<AccountIdentity | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    readToken()
      .then(async (token) => {
        if (token === null) return;
        const user = await fetchCurrentUser(token);
        if (alive) setIdentity({ fullName: user.fullName, role: user.role });
      })
      .catch(() => {
        // هوية العرض ليست حارسًا — فشلها لا يمنع الخروج ولا يُظهر خطأ،
        // فالمستخدم يخرج من حسابه سواء عرف النظام اسمه أم لا.
      });
    return () => {
      alive = false;
    };
  }, []);

  const logout = useCallback(() => {
    void (async () => {
      await clearToken();
      setVisible(false);
      router.replace("/");
    })();
  }, [router]);

  return {
    visible,
    identity,
    open: () => {
      setVisible(true);
    },
    close: () => {
      setVisible(false);
    },
    logout,
  };
}
