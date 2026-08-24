import { Redirect } from "expo-router";
import type { Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { color } from "@/constants/theme";
import { LoginRequestError, fetchCurrentUser } from "@/lib/api";
import { homeRouteForRole } from "@/lib/roleRoutes";
import { clearToken, readToken } from "@/lib/session";

/**
 * نقطة الدخول — تستعيد جلسة محفوظة في expo-secure-store وتوجّه لتبويبات
 * الدور، أو لشاشة الدخول إن لم توجد جلسة صالحة.
 *
 * **الرمز وحده لا يكفي**: يُتحقق منه بـ`GET /auth/me` قبل التوجيه. رمز
 * لم يعد مقبولًا (منتهٍ، أو حساب عُطِّل) يُمحى فورًا بدل توجيه المستخدم
 * لشاشة ستفشل كل طلباتها.
 */
export default function Index() {
  const [target, setTarget] = useState<Href | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      const token = await readToken();
      if (token === null) {
        if (!cancelled) setTarget("/auth/login");
        return;
      }

      try {
        const user = await fetchCurrentUser(token);
        if (cancelled) return;

        if (user.mustChangePassword) {
          setTarget("/auth/change-password");
          return;
        }
        setTarget(homeRouteForRole(user.role) ?? "/auth/login");
      } catch (caught: unknown) {
        // انقطاع شبكة (status === null) ليس رمزًا باطلًا — لا تُمحى الجلسة
        // بسببه، وإلا خرج المربي من التطبيق كلما ضعفت الشبكة في العنبر
        const isRejectedToken =
          caught instanceof LoginRequestError && caught.failure.status !== null;
        if (isRejectedToken) await clearToken();
        if (!cancelled) setTarget("/auth/login");
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  if (target === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={color.brandPrimary} />
      </View>
    );
  }

  return <Redirect href={target} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surfacePage,
  },
});
