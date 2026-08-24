import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { color, font, radius, spacing } from "@/constants/theme";
import { LoginRequestError, fetchAccountsForPhone } from "@/lib/api";
import { LOGIN_VALIDATION, loginErrorView, type LoginErrorView } from "@/lib/authErrors";
import { setPendingLogin } from "@/lib/pendingLogin";

/**
 * شاشة تسجيل الدخول — **الخطوة الأولى** في تدفّق الشكل الرابع (القرار #106):
 * الرقم وحده بلا كلمة مرور. الخادم يعيد حسابات الرقم، ثم تُطلب كلمة المرور
 * مقابل حساب محدَّد — فلا تُقارَن كلمة شخص بصف شخص آخر أبدًا.
 *
 * نمط "نموذج إدخال" (§9-4): تدفق رأسي واحد، الإجراء
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
  const [error, setError] = useState<LoginErrorView | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    const invalid = validate(phone);
    if (invalid !== null) {
      setError(invalid);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      setError(await submitPhone({ phone: phone.trim(), router }));
    } catch (caught: unknown) {
      setError(failureView(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      testID="login-screen"
      header={
        <View style={styles.brand}>
          <Text style={styles.appName}>دواجن</Text>
          <Text style={styles.tagline}>نظام إدارة مزارع دواجن التسمين</Text>
        </View>
      }
      footer={
        <Button
          label={submitting ? "جارٍ البحث" : "متابعة"}
          variant="primary"
          formSize
          onPress={() => {
            void handleSubmit();
          }}
          {...(submitting ? { disabledReason: "جارٍ إرسال الطلب — انتظر لحظة" } : {})}
        />
      }
    >
      <LoginFields phone={phone} error={error} onPhoneChange={setPhone} />
    </AuthScreen>
  );
}

/** الحقلان ورسائلهما — التسمية فوق الحقل والخطأ تحته مباشرة (§8.11). */
function LoginFields({
  phone,
  error,
  onPhoneChange,
}: {
  phone: string;
  error: LoginErrorView | null;
  onPhoneChange: (value: string) => void;
}) {
  const errorFor = (field: LoginErrorView["field"]): string | undefined =>
    error?.field === field ? error.message : undefined;

  return (
    <View style={styles.form}>
      {/* الحقل وسطره التوضيحي مجموعة واحدة بمسافة أضيق (xxs) — بلا ذلك
          يقع السطر في منتصف المسافة بين الحقلين فيُقرأ كأنه يخصّ الحقل
          التالي لا السابق */}
      <View style={styles.fieldWithHint}>
        <FormField
          label="رقم الجوال"
          type="text"
          value={phone}
          onChangeText={onPhoneChange}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="77xxxxxxx"
          testID="login-phone"
          error={errorFor("phone")}
        />
        <Text style={styles.hint} testID="login-phone-hint">
          بصفر بادئ أو بدونه، وبرمز الدولة أو بدونه — النظام يوحّد الصيغ
        </Text>
      </View>

      {error?.field === "form" ? (
        <Text style={styles.formError} testID="login-form-error" accessibilityRole="alert">
          {error.message}
        </Text>
      ) : null}
    </View>
  );
}

/** تحقق محلي قبل أي طلب شبكة — الرسالة تحت الحقل الناقص نفسه. */
function validate(phone: string): LoginErrorView | null {
  if (phone.trim().length === 0) {
    return { field: "phone", message: LOGIN_VALIDATION.phoneRequired };
  }
  return null;
}

/**
 * يجلب حسابات الرقم وينتقل بالنتيجة (القرار #106):
 * صفر ← رسالة · واحد ← كلمة المرور مباشرة · أكثر ← شاشة الاختيار.
 * @returns رسالة خطأ تُعرض على الشاشة، أو null إن تمّ الانتقال
 */
async function submitPhone(args: {
  phone: string;
  router: ReturnType<typeof useRouter>;
}): Promise<LoginErrorView | null> {
  const { phone, router } = args;
  const accounts = await fetchAccountsForPhone(phone);

  if (accounts.length === 0) {
    return { field: "phone", message: LOGIN_VALIDATION.phoneNotRegistered };
  }

  const single = accounts.length === 1 ? accounts[0] : undefined;
  setPendingLogin({ phone, accounts, selectedTenantId: single ? single.tenantId : null });
  // حساب واحد: لا معنى لشاشة اختيار من عنصر واحد — تُتخطّى لكلمة المرور
  router.push(single ? "/auth/password" : "/auth/select-account");
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
  fieldWithHint: {
    gap: spacing.xxs,
  },
  hint: {
    // حجم المحتوى لا technicalRef (11px): هذا نص يقرؤه المربي تحت شمس
    // مباشرة، و§7.2 تحصر ما دون 15px في الشارات والتبويبات والمراجع التقنية
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
  formError: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.statusCritical,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
