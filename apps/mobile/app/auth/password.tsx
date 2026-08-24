import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { color, font, radius, spacing } from "@/constants/theme";
import { LoginRequestError, login } from "@/lib/api";
import { LOGIN_VALIDATION, loginErrorView, type LoginErrorView } from "@/lib/authErrors";
import { targetAfterLogin } from "@/lib/authFlow";
import { clearPendingLogin, getPendingLogin } from "@/lib/pendingLogin";
import { saveToken } from "@/lib/session";

/**
 * **الخطوة الأخيرة** في تدفّق الشكل الرابع (القرار #106): كلمة المرور مقابل
 * **حساب محدَّد** (`tenantId`)، فيتحقق الخادم من صف واحد بالمفتاح الفريد
 * `(tenant_id, phone_e164)` — لا مقارنة عبر مستأجرين، وهو جوهر إغلاق الثقب
 * العرَضي في #98.
 *
 * اسم المزرعة يظهر هنا ليعرف المستخدم **لأي حساب** يُدخل كلمته — خصوصًا حين
 * تُخطّى شاشة الاختيار لأن الحساب واحد. **`tenantId` يُرسَل ولا يُعرَض** (§12).
 *
 * رسائل الفشل الأربع (بيانات خاطئة · حساب معطّل · تجاوز المحاولات · انقطاع
 * الشبكة) انتقلت إلى هنا من شاشة الدخول: كلها نتائج **التحقق من كلمة المرور**،
 * وهي لم تعد تُدخَل هناك.
 *
 * بلا AppHeader كسابقتيها: ما قبل الدخول، لا جلسة ولا إشعارات (القرار #93).
 */
export default function PasswordScreen() {
  const router = useRouter();
  const pending = getPendingLogin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginErrorView | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tenantId = pending?.selectedTenantId ?? null;

  async function handleSubmit(): Promise<void> {
    if (pending === null || tenantId === null) {
      // فُتحت الشاشة بلا مسار دخول سابق (تحديث صفحة على الويب مثلًا)
      router.replace("/auth/login");
      return;
    }
    if (password.length === 0) {
      setError({ field: "password", message: LOGIN_VALIDATION.passwordRequired });
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      setError(await submitPassword({ phone: pending.phone, password, tenantId, router }));
    } catch (caught: unknown) {
      setError(failureView(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      testID="password-screen"
      header={<PasswordHeader tenantName={tenantNameOf(pending, tenantId)} />}
      footer={
        <Button
          label={submitting ? "جارٍ تسجيل الدخول" : "تسجيل الدخول"}
          variant="primary"
          formSize
          onPress={() => {
            void handleSubmit();
          }}
          {...(submitting ? { disabledReason: "جارٍ إرسال الطلب — انتظر لحظة" } : {})}
        />
      }
    >
      <PasswordFields password={password} error={error} onPasswordChange={setPassword} />
    </AuthScreen>
  );
}

/** اسم المزرعة المختارة للعرض — فارغ إن انتهت الحالة الوسيطة. */
function tenantNameOf(
  pending: ReturnType<typeof getPendingLogin>,
  tenantId: number | null
): string {
  return pending?.accounts.find((a) => a.tenantId === tenantId)?.tenantName ?? "";
}

/** كتلة العنوان: الغرض، ثم **لأي حساب** تُدخَل الكلمة. */
function PasswordHeader({ tenantName }: { tenantName: string }) {
  return (
    <View style={styles.brand}>
      <Text style={styles.appName}>كلمة المرور</Text>
      {tenantName.length > 0 ? (
        <Text style={styles.tagline} testID="password-tenant-name">
          {tenantName}
        </Text>
      ) : null}
    </View>
  );
}

/** الحقل ورسالته — التسمية فوقه والخطأ تحته مباشرة (§8.11). */
function PasswordFields({
  password,
  error,
  onPasswordChange,
}: {
  password: string;
  error: LoginErrorView | null;
  onPasswordChange: (value: string) => void;
}) {
  return (
    <View style={styles.form}>
      <FormField
        label="كلمة المرور"
        type="text"
        value={password}
        onChangeText={onPasswordChange}
        secureTextEntry
        autoComplete="current-password"
        placeholder="كلمة المرور التي سلّمها لك المشرف"
        testID="password-field"
        error={error?.field === "password" ? error.message : undefined}
      />
      {error !== null && error.field !== "password" ? (
        <Text style={styles.formError} testID="password-form-error" accessibilityRole="alert">
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * يُرسل الكلمة مقابل الحساب المختار ثم يوجّه بحسب الدور أو إجبار التغيير.
 * @returns رسالة خطأ تُعرض على الشاشة، أو null إن تمّ الانتقال
 */
async function submitPassword(args: {
  phone: string;
  password: string;
  tenantId: number;
  router: ReturnType<typeof useRouter>;
}): Promise<LoginErrorView | null> {
  const { phone, password, tenantId, router } = args;
  const result = await login({ phone, password, tenantId });
  await saveToken(result.token);
  clearPendingLogin();

  const target = targetAfterLogin(result.user);
  if (target.kind === "error") return { field: "form", message: target.message };

  router.replace(target.href);
  return null;
}

/** أي استثناء غير متوقَّع يُعامَل كانقطاع شبكة — لا شاشة معلّقة بلا رسالة. */
function failureView(caught: unknown): LoginErrorView {
  return caught instanceof LoginRequestError
    ? loginErrorView(caught.failure)
    : loginErrorView({ status: null, code: null });
}

const styles = StyleSheet.create({
  brand: {
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.lg,
  },
  appName: {
    fontSize: font.size.screenTitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  tagline: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    textAlign: "center",
    writingDirection: "rtl",
  },
  form: {
    gap: spacing.lg,
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    padding: spacing.lg,
  },
  formError: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.statusCritical,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
