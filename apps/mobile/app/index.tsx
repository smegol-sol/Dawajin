import { Redirect } from "expo-router";
import { useSyncExternalStore } from "react";

import { homeRouteForRole } from "@/lib/roleRoutes";
import { restoreSnapshot, subscribeRestore } from "@/lib/sessionRestore";

/**
 * نقطة الدخول — **توجيه إعلاني ومستهلك رفيع** (القرار رقم 177).
 *
 * **لا منطق شبكة هنا ولا استعادة**: كلاهما في `lib/sessionRestore.ts` ويبدأ
 * على نطاق الوحدة عند الاستيراد من الجذر، فينجو من تفكيك أي مكوّن. هذه
 * الشاشة تقرأ الحصيلة الجاهزة وتصيّر `<Redirect>` — لا أكثر.
 *
 * **والتوجيه إعلاني لا أمري**: `router.replace` من تخطيط الجذر ترفضه
 * expo-router برسالة صريحة، والبديل الذي تسمّيه الرسالة نفسها هو مُنقِّل
 * مركَّب من أول طلاء وتوجيه في المسار — وهو هذا.
 *
 * وحين تُطلى هذه الشاشة تكون الاستعادة قد استقرّت: بوّابة الجذر تحجب كل شيء
 * قبل ذلك.
 */
export default function Index() {
  const session = useSyncExternalStore(subscribeRestore, restoreSnapshot);

  // الجذر يحجب ما قبل الاستقرار وحالة تعذّر الاتصال — فلا يصلان هنا
  if (session.status !== "settled" || session.outcome.kind === "unreachable") {
    return null;
  }

  const { outcome } = session;
  if (outcome.kind === "signed-in") {
    if (outcome.user.mustChangePassword) {
      return <Redirect href="/auth/change-password" />;
    }
    return <Redirect href={homeRouteForRole(outcome.user.role) ?? "/auth/login"} />;
  }

  return <Redirect href="/auth/login" />;
}
