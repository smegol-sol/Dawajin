import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Card } from "@/components/ui/Card";
import { color, font, spacing } from "@/constants/theme";
import type { SelectableAccount } from "@/lib/api";
import { getPendingLogin, selectPendingTenant } from "@/lib/pendingLogin";

/**
 * اختيار الحساب حين يكون الرقم مسجَّلًا لدى أكثر من مالك — طبيب مستقل مثلًا
 * (القرار #57). **الخطوة الوسطى** في تدفّق الشكل الرابع (القرار #106): تأتي
 * **قبل** كلمة المرور لا بعدها، فلا تعود تظهر بحسب تطابق الكلمة (قناة جانبية
 * كانت تقول «كلمتك تطابق أكثر من حساب»)، بل بحسب الرقم وحده.
 *
 * **بلا AppHeader** (القرار #93): متغيّرا §8.8 كلاهما يفترضان مستخدمًا داخل
 * التطبيق — سهم الرجوع يفترض شاشة سابقة يُرجَع إليها، والجرس يفترض إشعارات
 * لحساب قائم. هنا **لم يُختَر حساب بعد ولم تُدخَل كلمة مرور أصلًا**، فلا جلسة
 * ولا إشعارات، والرجوع بلا وجهة. كتلة عنوان بسيطة كشاشة الدخول قبلها.
 *
 * البطاقة تعرض **اسم المستأجر وحده** — لا اسم ولا دور: الخادم لا يُرجعهما
 * قبل التحقق (القيد ب، القرار #106)، لأن إرجاع الاسم الكامل يحوّل التسريب من «هذا
 * الرقم مسجَّل لدى مزرعة» إلى «هذا الرقم يخصّ فلانًا تحديدًا».
 * **`tenantId` يُرسَل ولا يُعرَض إطلاقًا** — §12 تمنع أي معرّف داخلي على الشاشة.
 */
export default function SelectAccountScreen() {
  const router = useRouter();
  const pending = getPendingLogin();

  // لا طلب شبكة هنا: الاختيار يثبّت الحساب فقط، وكلمة المرور تُطلب بعده
  function chooseAccount(tenantId: number): void {
    if (pending === null) return;
    selectPendingTenant(tenantId);
    router.push("/auth/password");
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
  onChoose: (tenantId: number) => void;
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
 * بطاقة حساب واحد. **اسم المستأجر وحده عنوانًا** — لا سطر ثانوي: هو كل ما
 * يُرجعه الخادم قبل التحقق (القيد ب، القرار #106). لا `tenantId` في أي نص معروض.
 */
function AccountCard({
  account,
  index,
  onChoose,
}: {
  account: SelectableAccount;
  index: number;
  onChoose: (tenantId: number) => void;
}) {
  return (
    <Card
      testID={`account-card-${String(index)}`}
      title={account.tenantName}
      primaryActionLabel="متابعة بهذا الحساب"
      onPrimaryAction={() => {
        onChoose(account.tenantId);
      }}
    />
  );
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
});
