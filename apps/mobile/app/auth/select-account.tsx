import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "@/components/ui/AppHeader";
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
 * مستقل يخدم عدة ملّاك (القرار #57). **شاشة فرعية** بمتغيّر `sub` من
 * AppHeader: سهم رجوع يمينًا يعيد لشاشة الدخول (§8.8 و§10 قاعدة 1).
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

  function goBackToLogin(): void {
    clearPendingLogin();
    router.replace("/auth/login");
  }

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
    <View style={styles.flex}>
      <AppHeader
        variant="sub"
        title="اختر الحساب"
        contextLine="نفس رقم الجوال مسجَّل لدى أكثر من مالك"
        onBackPress={goBackToLogin}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <AccountList accounts={pending?.accounts ?? null} onChoose={chooseAccount} />

        {error !== null ? (
          <Text style={styles.formError} testID="select-account-error" accessibilityRole="alert">
            {error.message}
          </Text>
        ) : null}
      </ScrollView>
    </View>
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
  flex: {
    flex: 1,
    backgroundColor: color.surfacePage,
  },
  scroll: {
    padding: spacing.lg,
    // flex + gap فقط — لا مسافة ثابتة على البطاقات (§10 قاعدة 5)
    gap: spacing.md,
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
