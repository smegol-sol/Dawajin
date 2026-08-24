import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Card } from "@/components/ui/Card";
import { color, font, spacing } from "@/constants/theme";
import { LoginRequestError, login } from "@/lib/api";
import type { SelectableAccount } from "@/lib/api";
import { loginErrorView, type LoginErrorView } from "@/lib/authErrors";
import { targetAfterLogin } from "@/lib/authFlow";
import { clearPendingLogin, getPendingLogin } from "@/lib/pendingLogin";
import { saveToken } from "@/lib/session";

const ROLE_LABEL: Record<string, string> = {
  farmer: "مربي",
  supervisor: "مشرف",
  vet: "طبيب",
  owner: "مالك",
};

/**
 * اختيار الحساب عند تطابق الجوال وكلمة المرور مع أكثر من مستأجر — طبيب
 * مستقل يخدم عدة ملّاك (القرار #57).
 *
 * **بلا AppHeader** (القرار #93): متغيّرا §8.8 كلاهما يفترضان مستخدمًا داخل
 * التطبيق — سهم الرجوع يفترض شاشة سابقة يُرجَع إليها، والجرس يفترض إشعارات
 * لحساب قائم. هنا كلمة المرور تحققت لكن **لم يُختَر حساب بعد**، فلا جلسة
 * ولا إشعارات، والرجوع بلا وجهة. كتلة عنوان بسيطة كشاشة الدخول قبلها.
 *
 * البطاقة تعرض **اسم المستأجر** بارزًا لأنه وحده ما يميّز الحسابين، والاسم
 * والدور ثانويَّين تحته (القرار #84). **`tenantId` يُرسَل ولا يُعرَض إطلاقًا**
 * — §12 تمنع أي معرّف داخلي على الشاشة.
 */
export default function SelectAccountScreen() {
  const router = useRouter();
  const pending = getPendingLogin();
  const [error, setError] = useState<LoginErrorView | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function chooseAccount(tenantId: number): Promise<void> {
    if (pending === null || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      setError(
        await resolveAccount({
          phone: pending.phone,
          password: pending.password,
          tenantId,
          router,
        })
      );
    } catch (caught: unknown) {
      setError(
        caught instanceof LoginRequestError
          ? loginErrorView(caught.failure)
          : loginErrorView({ status: null, code: null })
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      testID="select-account-screen"
      header={
        <View style={styles.headerBlock}>
          <Text style={styles.title} testID="select-account-title">
            اختر الحساب
          </Text>
          <Text style={styles.subtitle}>نفس رقم الجوال مسجَّل لدى أكثر من مالك</Text>
        </View>
      }
    >
      <View style={styles.list}>
        <AccountList accounts={pending?.accounts ?? null} onChoose={chooseAccount} />

        {error !== null ? (
          <Text style={styles.formError} testID="select-account-error" accessibilityRole="alert">
            {error.message}
          </Text>
        ) : null}
      </View>
    </AuthScreen>
  );
}

/** قائمة الحسابات، أو سبب صريح إن انتهت الحالة الوسيطة — لا شاشة بيضاء. */
function AccountList({
  accounts,
  onChoose,
}: {
  accounts: SelectableAccount[] | null;
  onChoose: (tenantId: number) => Promise<void>;
}) {
  if (accounts === null) {
    // فُتحت الشاشة بلا مسار دخول سابق (تحديث الصفحة على الويب مثلًا)
    return (
      <Text style={styles.emptyState} testID="select-account-expired">
        انتهت جلسة الاختيار — ارجع وسجّل الدخول من جديد
      </Text>
    );
  }

  return (
    <>
      {accounts.map((account, index) => (
        <AccountCard
          key={String(account.tenantId)}
          account={account}
          index={index}
          onChoose={onChoose}
        />
      ))}
    </>
  );
}

/**
 * بطاقة حساب واحد. **اسم المستأجر عنوانًا** لأنه وحده ما يميّز الحسابين،
 * والاسم والدور سطرًا ثانويًا (القرار #84). لا `tenantId` في أي نص معروض.
 */
function AccountCard({
  account,
  index,
  onChoose,
}: {
  account: SelectableAccount;
  index: number;
  onChoose: (tenantId: number) => Promise<void>;
}) {
  return (
    <Card
      testID={`account-card-${String(index)}`}
      title={account.tenantName}
      subtitle={`${account.fullName} · ${ROLE_LABEL[account.role] ?? account.role}`}
      primaryActionLabel="الدخول بهذا الحساب"
      onPrimaryAction={() => {
        void onChoose(account.tenantId);
      }}
    />
  );
}

/**
 * يعيد الطلب بـ`tenantId` المختار وينتقل بنتيجته.
 * @returns رسالة خطأ تُعرض، أو null إن تمّ الانتقال
 */
async function resolveAccount(args: {
  phone: string;
  password: string;
  tenantId: number;
  router: ReturnType<typeof useRouter>;
}): Promise<LoginErrorView | null> {
  const { phone, password, tenantId, router } = args;
  const result = await login({ phone, password, tenantId });

  if (result.kind === "needsTenantSelection") {
    // غير متوقَّع: الطلب حُسم بـtenantId فلا يجوز أن يعود بطلب اختيار.
    // يُعرض سببه لا يُبتلع صامتًا (§8.17: حالة الخطأ تعرض السبب).
    return { field: "form", message: "تعذّر حسم الحساب — أعد تسجيل الدخول" };
  }

  await saveToken(result.token);
  clearPendingLogin();

  const target = targetAfterLogin(result.user);
  if (target.kind === "error") return { field: "form", message: target.message };
  router.replace(target.href);
  return null;
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: spacing.xxs,
  },
  list: {
    // flex + gap فقط — لا مسافة ثابتة على البطاقات (§10 قاعدة 5)
    gap: spacing.md,
  },
  title: {
    fontSize: font.size.screenTitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
    // العنوان محاذاته يمين حصرًا في كل الحالات (§10 قاعدة 4)
    textAlign: "right",
  },
  subtitle: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
  emptyState: {
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
