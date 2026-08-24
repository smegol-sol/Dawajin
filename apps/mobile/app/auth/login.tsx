import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { color, font, radius, spacing } from "@/constants/theme";
import { LoginRequestError, login } from "@/lib/api";
import { LOGIN_VALIDATION, loginErrorView, type LoginErrorView } from "@/lib/authErrors";
import { targetAfterLogin } from "@/lib/authFlow";
import { setPendingLogin } from "@/lib/pendingLogin";
import { saveToken } from "@/lib/session";

/**
 * شاشة تسجيل الدخول — نمط "نموذج إدخال" (§9-4): تدفق رأسي واحد، الإجراء
 * أسفل الشاشة (قاعدة الإبهام §11)، وكل رسالة خطأ **تحت حقلها مباشرة** لا
 * أعلى الشاشة (§8.11).
 *
 * أربع حالات فشل، كلٌّ برسالة تقول السبب لا رسالة عامة (§8.17 و§11):
 * بيانات خاطئة · حساب معطّل (القرار #84) · تجاوز المحاولات · انقطاع الشبكة.
 * صياغتها كلها في `lib/authErrors.ts` — مفصولة عن الشاشة كي تُختبر وحدها.
 *
 * بلا AppHeader: هذه شاشة ما قبل الدخول، لا حساب ولا إشعارات ولا رجوع
 * (§8.8 يصف متغيّرَي الهيدر داخل التطبيق بعد الدخول).
 */
export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginErrorView | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    const invalid = validate(phone, password);
    if (invalid !== null) {
      setError(invalid);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      setError(await submitLogin({ phone: phone.trim(), password, router }));
    } catch (caught: unknown) {
      setError(failureView(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.appName}>دواجن</Text>
          <Text style={styles.tagline}>نظام إدارة مزارع دواجن التسمين</Text>
        </View>

        <LoginFields
          phone={phone}
          password={password}
          error={error}
          onPhoneChange={setPhone}
          onPasswordChange={setPassword}
        />

        <View style={styles.actions}>
          <Button
            label={submitting ? "جارٍ تسجيل الدخول" : "تسجيل الدخول"}
            variant="primary"
            formSize
            onPress={() => {
              void handleSubmit();
            }}
            {...(submitting ? { disabledReason: "جارٍ إرسال الطلب — انتظر لحظة" } : {})}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** الحقلان ورسائلهما — التسمية فوق الحقل والخطأ تحته مباشرة (§8.11). */
function LoginFields({
  phone,
  password,
  error,
  onPhoneChange,
  onPasswordChange,
}: {
  phone: string;
  password: string;
  error: LoginErrorView | null;
  onPhoneChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}) {
  const errorFor = (field: LoginErrorView["field"]): string | undefined =>
    error?.field === field ? error.message : undefined;

  return (
    <View style={styles.form}>
      <FormField
        label="رقم الجوال"
        type="text"
        value={phone}
        onChangeText={onPhoneChange}
        keyboardType="phone-pad"
        autoComplete="tel"
        testID="login-phone"
        error={errorFor("phone")}
      />

      <FormField
        label="كلمة المرور"
        type="text"
        value={password}
        onChangeText={onPasswordChange}
        secureTextEntry
        autoComplete="current-password"
        testID="login-password"
        error={errorFor("password")}
      />

      {error?.field === "form" ? (
        <Text style={styles.formError} testID="login-form-error" accessibilityRole="alert">
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

/** تحقق محلي قبل أي طلب شبكة — الرسالة تحت الحقل الناقص نفسه. */
function validate(phone: string, password: string): LoginErrorView | null {
  if (phone.trim().length === 0) {
    return { field: "phone", message: LOGIN_VALIDATION.phoneRequired };
  }
  if (password.length === 0) {
    return { field: "password", message: LOGIN_VALIDATION.passwordRequired };
  }
  return null;
}

/**
 * ينفّذ الطلب وينتقل بنتيجته.
 * @returns رسالة خطأ تُعرض على الشاشة، أو null إن تمّ الانتقال
 */
async function submitLogin(args: {
  phone: string;
  password: string;
  router: ReturnType<typeof useRouter>;
}): Promise<LoginErrorView | null> {
  const { phone, password, router } = args;
  const result = await login({ phone, password });

  if (result.kind === "needsTenantSelection") {
    // كلمة المرور تبقى في الذاكرة وحدها لإعادة الطلب مع tenantId المختار
    setPendingLogin({ phone, password, accounts: result.accounts });
    router.push("/auth/select-account");
    return null;
  }

  await saveToken(result.token);

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
  flex: {
    flex: 1,
    backgroundColor: color.surfacePage,
  },
  scroll: {
    flexGrow: 1,
    padding: spacing.xxl,
    gap: spacing.xxl,
    // الإجراء أسفل الشاشة والنموذج فوقه — قاعدة الإبهام (§11)
    justifyContent: "space-between",
  },
  brand: {
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xxl,
  },
  appName: {
    // screenTitle لا heroNumber: heroNumber رمز دلالي لـ"الرقم البطل" (§8.5)
    // وهو مؤشر رقمي لا اسم شاشة — استعارته هنا تُفرغه من دلالته
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
  actions: {
    gap: spacing.md,
  },
});
