import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { color, font, radius, spacing } from "@/constants/theme";
import { useBlockHardwareBack } from "@/hooks/useBlockHardwareBack";
import { LoginRequestError, changePassword, fetchCurrentUser } from "@/lib/api";
import { targetAfterLogin } from "@/lib/authFlow";
import { clearToken, readToken } from "@/lib/session";

/**
 * تغيير كلمة المرور الإجباري — كل حساب يُنشأ بكلمة مؤقتة و`must_change_password`
 * (backend-technical-spec.md §11)، فهذا **المسار الافتراضي لكل مستخدم جديد**
 * لا حالة حافة.
 *
 * **بلا سهم رجوع، وبلا رجوع بزر النظام**: التغيير إجباري لا يُتجاوَز. لهذا
 * تُستخدم `AppHeader variant="main"` بلا `onBackPress`، ويُعترَض زر الرجوع
 * في أندرويد صراحةً — الاثنان معًا، لأن أحدهما وحده يترك ثغرة تجاوز.
 *
 * الحد الأدنى للطول 8 محارف: كلمة مؤقتة يضعها المشرف تُستبدل بكلمة يختارها
 * المستخدم؛ حدّ الـ12 محرفًا في §11 خاصّ بمدير المنصة وحده لا بمستخدمي
 * المستأجر (القرار #86).
 */
const MIN_PASSWORD_LENGTH = 8;

type FieldName = "current" | "next" | "confirm" | "form";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<{ field: FieldName; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // زر الرجوع في أندرويد لا يتجاوز هذه الشاشة — التغيير إجباري
  useBlockHardwareBack();

  async function handleSubmit(): Promise<void> {
    const invalid = validate({ currentPassword, nextPassword, confirmPassword });
    if (invalid !== null) {
      setError(invalid);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      setError(await submitChange({ currentPassword, nextPassword, router }));
    } catch (caught: unknown) {
      setError({ field: "form", message: changePasswordErrorMessage(caught) });
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
        <ForcedChangeIntro />

        <PasswordFields
          values={{ currentPassword, nextPassword, confirmPassword }}
          error={error}
          onChange={{
            current: setCurrentPassword,
            next: setNextPassword,
            confirm: setConfirmPassword,
          }}
        />

        <View style={styles.actions}>
          <Button
            label={submitting ? "جارٍ الحفظ" : "حفظ كلمة المرور"}
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

/** سبب وجود المستخدم هنا — لا شاشة نموذج بلا تفسير. */
function ForcedChangeIntro() {
  return (
    <View style={styles.intro}>
      <Text style={styles.title}>تغيير كلمة المرور</Text>
      <Text style={styles.explain}>
        دخلت بكلمة مرور مؤقتة — اختر كلمة مرور خاصة بك قبل المتابعة
      </Text>
    </View>
  );
}

/** الحقول الثلاثة ورسالة النموذج — كلها تحت حقلها مباشرة (§8.11). */
function PasswordFields({
  values,
  error,
  onChange,
}: {
  values: { currentPassword: string; nextPassword: string; confirmPassword: string };
  error: { field: FieldName; message: string } | null;
  onChange: {
    current: (next: string) => void;
    next: (next: string) => void;
    confirm: (next: string) => void;
  };
}) {
  const errorFor = (field: FieldName): string | undefined =>
    error?.field === field ? error.message : undefined;

  return (
    <View style={styles.form}>
      <PasswordField
        label="كلمة المرور الحالية"
        value={values.currentPassword}
        onChangeText={onChange.current}
        autoComplete="current-password"
        testID="change-current"
        error={errorFor("current")}
      />
      <PasswordField
        label="كلمة المرور الجديدة"
        value={values.nextPassword}
        onChangeText={onChange.next}
        autoComplete="new-password"
        testID="change-next"
        error={errorFor("next")}
      />
      <PasswordField
        label="تأكيد كلمة المرور الجديدة"
        value={values.confirmPassword}
        onChangeText={onChange.confirm}
        autoComplete="new-password"
        testID="change-confirm"
        error={errorFor("confirm")}
      />

      {error?.field === "form" ? (
        <Text style={styles.formError} testID="change-form-error" accessibilityRole="alert">
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

/** ثلاثة حقول بنفس الشكل — غلاف رفيع على FormField بلا مكوّن تصميم جديد. */
function PasswordField({
  label,
  value,
  onChangeText,
  autoComplete,
  testID,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  autoComplete: "current-password" | "new-password";
  testID: string;
  error: string | undefined;
}) {
  return (
    <FormField
      label={label}
      type="text"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry
      autoComplete={autoComplete}
      testID={testID}
      error={error}
    />
  );
}

/** تحقق محلي — كل رسالة تحت حقلها هي (§8.11). */
function validate(input: {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
}): { field: FieldName; message: string } | null {
  if (input.currentPassword.length === 0) {
    return { field: "current", message: "أدخل كلمة المرور الحالية" };
  }
  if (input.nextPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      field: "next",
      message: `كلمة المرور قصيرة — ${String(MIN_PASSWORD_LENGTH)} محارف على الأقل`,
    };
  }
  if (input.confirmPassword !== input.nextPassword) {
    return { field: "confirm", message: "التأكيد لا يطابق كلمة المرور الجديدة" };
  }
  return null;
}

/**
 * يحفظ كلمة المرور ثم **يعيد قراءة الملف من الخادم** — لا افتراض نجاح:
 * `must_change_password` يجب أن يصير false فعليًا قبل مغادرة هذه الشاشة.
 * @returns رسالة خطأ تُعرض، أو null إن تمّ الانتقال
 */
async function submitChange(args: {
  currentPassword: string;
  nextPassword: string;
  router: ReturnType<typeof useRouter>;
}): Promise<{ field: FieldName; message: string } | null> {
  const { currentPassword, nextPassword, router } = args;
  const token = await readToken();
  if (token === null) {
    // الرمز مفقود — العودة للدخول أصدق من إبقاء المستخدم أمام نموذج لن ينجح
    router.replace("/auth/login");
    return null;
  }

  await changePassword(token, { currentPassword, newPassword: nextPassword });

  const user = await fetchCurrentUser(token);
  const target = targetAfterLogin(user);
  if (target.kind === "error") return { field: "form", message: target.message };
  router.replace(target.href);
  return null;
}

/** رسالة عربية تقول السبب — لا "حدث خطأ ما" (§8.17). */
function changePasswordErrorMessage(caught: unknown): string {
  if (caught instanceof LoginRequestError) {
    const { status, code } = caught.failure;
    if (status === null) {
      return "تعذّر الاتصال بالخادم — تحقّق من الشبكة ثم أعد المحاولة";
    }
    if (status === 401 && code === "invalid_credentials") {
      return "كلمة المرور الحالية غير صحيحة";
    }
    if (status === 401) {
      // الرمز نفسه لم يعد مقبولًا — الجلسة انتهت، تُمحى فلا تبقى جلسة ميتة
      void clearToken();
      return "انتهت الجلسة — سجّل الدخول من جديد";
    }
    return `تعذّر حفظ كلمة المرور — استجابة غير متوقّعة من الخادم (${String(status)})`;
  }
  return "تعذّر حفظ كلمة المرور — أعد المحاولة";
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
    justifyContent: "space-between",
  },
  intro: {
    gap: spacing.xs,
    paddingTop: spacing.xxl,
  },
  title: {
    fontSize: font.size.screenTitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
    textAlign: "right",
  },
  explain: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
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
