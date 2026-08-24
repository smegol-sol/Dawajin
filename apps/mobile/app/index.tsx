import { Redirect } from "expo-router";

/**
 * نقطة الدخول — لاحقًا (المرحلة 1) تتحقق من رمز مخزَّن في expo-secure-store
 * وتوجّه مباشرة لتخطيط الدور المناسب. حاليًا: توجيه ثابت لشاشة الدخول.
 */
export default function Index() {
  return <Redirect href="/auth/login" />;
}
