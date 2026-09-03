import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { FeedBlock } from "@/components/daily-log/FeedBlock";
import { MeasurementsBlock } from "@/components/daily-log/MeasurementsBlock";
import { MortalityBlock } from "@/components/daily-log/MortalityBlock";
import { AccountSheet } from "@/components/ui/AccountSheet";
import { AppHeader } from "@/components/ui/AppHeader";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { ListState } from "@/components/ui/ListState";
import { color, font, spacing } from "@/constants/theme";
import { useAccountSheet } from "@/lib/account";
import { fetchAssignedHouses, fetchHouseBatches, fetchProducts } from "@/lib/dailyLogApi";
import { dailyLogErrorMessage } from "@/lib/dailyLogErrors";
import {
  activeBatchOf,
  addFeedRow,
  arrivingBatchOf,
  emptyDraft,
  newClientId,
  patchFeedRow,
  removeFeedRow,
  saveDisabledReason,
  todayIso,
  type DailyLogDraft,
} from "@/lib/dailyLogForm";
import type { HouseCard } from "@/lib/infrastructureApi";
import { useAuthToken } from "@/lib/useAuthToken";
import { useDailyLogSubmit } from "@/lib/useDailyLogSubmit";

/**
 * **السجل اليوميّ — أوّلُ شاشةٍ فعلية للمربّي** (§5-أ-2، والقرار 278).
 *
 * **تدفّقٌ رأسيّ واحد متصل** — ممنوعٌ تقسيمُه إلى خطوات أو تبويبات (§2).
 *
 * **ولا تحرس الشاشةُ شيئًا، وما يُخفى فيها ليس حراسة:** الفرضُ كلُّه في
 * `POST /api/daily-logs` — المربّي وحده (§12.2) · عنبرُه المُسند (الفرض
 * المركزيّ) · دفعةٌ نشطة (422) · سجلٌّ واحد لليوم (409 بفهرسٍ في القاعدة).
 * **وما هنا يمنع زرًّا يفشل عند الضغط** (§11) لا أكثر.
 *
 * **والحالات الأربع إلزامية** (§8.17): تحميلٌ بهيكلٍ عظميّ · فارغةٌ بجملةٍ
 * ومدخلِ فعل · خطأٌ بسببه وإعادةِ محاولة · وعاديّة. **والفارغةُ هي الغالبة
 * اليوم** — **مقيس: `seed:demo` لا يُنشئ دفعةً إطلاقًا**، فعنبرُ المربّي في
 * كل بيئةٍ لم تُشغَّل عليها سلسلةُ الاستقبال بيدها بلا دفعة.
 *
 * **ولا رئيسية معها** (حكم المالك): بناؤها يوسّع الدفعة إلى أربعة مسارات لم
 * تُبنَ — **والتبويبُ يفتح هذه الشاشة مباشرةً، فالمدخلُ قائم**.
 */
export default function FarmerDailyLog() {
  const token = useAuthToken();
  const account = useAccountSheet();

  return (
    <View style={styles.screen}>
      <AppHeader title="السجل اليومي" variant="main" onAccountPress={account.open} />
      {/* **الجسمُ لا يُلفّ بتمريرٍ هنا**: زرُّ الحفظ ثابتٌ أسفل الشاشة (§2)،
          **فلا بدّ أن يكون شقيقًا للتمرير لا آخرَ عنصرٍ فيه** — وكلُّ حالةٍ
          تملك تمريرها. */}
      {typeof token !== "string" ? (
        <View style={styles.body}>
          <ListState state="loading" />
        </View>
      ) : (
        <Loaded token={token} />
      )}
      <AccountSheet
        visible={account.visible}
        onClose={account.close}
        identity={account.identity}
        onLogout={account.logout}
      />
    </View>
  );
}

/**
 * **ما تحتاجه الشاشة من الخادم — ثلاثةُ استعلامات، وكلُّها مفلترةٌ بالإسناد.**
 *
 * **ومفصولةٌ عن قرار الحالة لأن الحدّ يُحترم بالفصل لا برفعه** (`complexity`).
 */
function useScreenData(token: string) {
  const houses = useQuery({
    queryKey: ["assigned-houses"],
    queryFn: () => fetchAssignedHouses(token),
  });
  const list = houses.data ?? [];
  const house = list[0];

  const batches = useQuery({
    queryKey: ["house-batches", house?.id],
    queryFn: () => fetchHouseBatches(token, house?.id ?? 0),
    enabled: house !== undefined,
  });
  const products = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts(token) });

  const waiting = house === undefined ? houses.isPending : batches.isPending || products.isPending;
  return {
    house,
    otherHouseCount: Math.max(list.length - 1, 0),
    batches: batches.data ?? [],
    products: products.data ?? [],
    waiting: houses.isPending || waiting,
    failure: houses.error ?? batches.error ?? products.error,
    retry: (): void => {
      void houses.refetch();
      void batches.refetch();
      void products.refetch();
    },
  };
}

/** جسمُ الحالات غير النموذجية — **مبطَّنٌ وقابلٌ للتمرير على شاشةٍ قصيرة**. */
function Centered({ children }: { children: React.ReactNode }) {
  return <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>;
}

/** **قرارُ الحالة** — تحميلٌ · خطأٌ · فارغةٌ بلا عنبر · أو ما تقرّره الدفعة. */
function Loaded({ token }: { token: string }) {
  const data = useScreenData(token);

  if (data.waiting) {
    return (
      <Centered>
        <ListState state="loading" />
      </Centered>
    );
  }
  if (data.failure) {
    return (
      <Centered>
        <ListState state="error" reason={dailyLogErrorMessage(data.failure)} onRetry={data.retry} />
      </Centered>
    );
  }
  // **ومن لا عنبر له يُقال له ذلك** — لا يُترك أمام نموذجٍ لا يعمل
  if (data.house === undefined) {
    return (
      <Centered>
        <ListState
          state="empty"
          message="لا عنبر مُسند إليك بعد — راجع مشرفك ليُسنده"
          actionLabel="تحديث"
          onAction={data.retry}
        />
      </Centered>
    );
  }

  return (
    <HouseState
      token={token}
      house={data.house}
      batches={data.batches}
      products={data.products}
      otherHouseCount={data.otherHouseCount}
    />
  );
}

/** **الدفعةُ تقرّر: نموذجٌ أو حالةٌ فارغة** — ونصُّ الفارغة يتبع سببها. */
function HouseState({
  token,
  house,
  batches,
  products,
  otherHouseCount,
}: {
  token: string;
  house: HouseCard;
  batches: Parameters<typeof activeBatchOf>[0];
  products: React.ComponentProps<typeof FeedBlock>["products"];
  otherHouseCount: number;
}) {
  const router = useRouter();
  const active = activeBatchOf(batches);

  if (active === undefined) {
    const arriving = arrivingBatchOf(batches) !== undefined;
    return (
      <Centered>
        <ListState
          state="empty"
          message={
            arriving
              ? "شحنتك وصلت ولم تؤكّد استلامها بعد — التسجيل يبدأ بعد التأكيد"
              : "عنبرك بلا دفعة نشطة — التسجيل يبدأ بعد أن تصل الطيور وتؤكّد استلامها"
          }
          actionLabel="الذهاب إلى الاستلام"
          onAction={() => {
            router.navigate("/(farmer)/receiving");
          }}
        />
      </Centered>
    );
  }

  return (
    <Form
      token={token}
      house={house}
      batchBirds={active.receivedBirdCount}
      products={products}
      otherHouseCount={otherHouseCount}
    />
  );
}

/** **النموذج نفسه** — مفصولٌ لأن الحدّ يُحترم بالفصل لا برفعه. */
function Form({
  token,
  house,
  batchBirds,
  products,
  otherHouseCount,
}: {
  token: string;
  house: HouseCard;
  batchBirds: number | null;
  products: React.ComponentProps<typeof FeedBlock>["products"];
  otherHouseCount: number;
}) {
  const [draft, setDraft] = useState<DailyLogDraft>(emptyDraft);
  const logDate = useMemo(() => todayIso(new Date()), []);
  const submit = useDailyLogSubmit({
    token,
    houseId: house.id,
    logDate,
    tankCapacityL: house.waterTankCapacityL,
  });

  if (submit.saved !== undefined) {
    return (
      <Centered>
        <Saved feedKgTotal={submit.saved.feedKgTotal} onAgain={submit.reset} />
      </Centered>
    );
  }

  const reason = saveDisabledReason(draft, submit.pending);

  return (
    <View style={styles.formShell}>
      <ScrollView contentContainerStyle={styles.body}>
        <Context house={house} batchBirds={batchBirds} otherHouseCount={otherHouseCount} />
        <Fields
          draft={draft}
          setDraft={setDraft}
          products={products}
          house={house}
          logDate={logDate}
        />
        {submit.failure === undefined ? null : <Text style={styles.failure}>{submit.failure}</Text>}
      </ScrollView>
      {/**
       * **زرُّ الحفظ ثابتٌ أسفل الشاشة، شقيقًا للتمرير لا آخرَ عنصرٍ فيه**
       * (§2 نصًّا). **وهو عطبُ استعمالٍ لا ملاحظةُ عرض حين يُدفَن**: الزرُّ
       * **الفعلُ الوحيد في الشاشة**، **ومربٍّ لا يجده لا يسجّل شيئًا** —
       * ونموذجٌ بهذا الطول يدفعه تحت شريط التبويبات على كل جهاز.
       *
       * **ويحرسه تأكيدُ تخطيطٍ يقيس أنه مرئيّ بلا تمرير** لا أنه موجود
       * (`layout-tests/daily-log.layout.spec.ts`) — **و`react-test-renderer`
       * لا يُنفّذ تخطيط Yoga فلا يراه** (القرار #80).
       */}
      <View style={styles.saveBar}>
        <Button
          label="حفظ السجل"
          variant="primary"
          formSize
          onPress={() => {
            submit.save(draft);
          }}
          {...(reason === undefined ? {} : { disabledReason: reason })}
        />
      </View>
    </View>
  );
}

/** **حقولُ النموذج — تدفّقٌ رأسيّ واحد متصل** (§2)، مفصولةٌ عن حالة الحفظ. */
function Fields({
  draft,
  setDraft,
  products,
  house,
  logDate,
}: {
  draft: DailyLogDraft;
  setDraft: React.Dispatch<React.SetStateAction<DailyLogDraft>>;
  products: React.ComponentProps<typeof FeedBlock>["products"];
  house: HouseCard;
  logDate: string;
}) {
  const patch = (next: Partial<DailyLogDraft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };

  return (
    <>
      {/* **التاريخ معطَّل، وحدُّه معلن (قاعدة 268): لا منتقيَ تاريخٍ في
          المستودع اليوم — فالتسجيل على تاريخ الجهاز وحده، ويسقط الحدّ يوم
          يُبنى أوّلُ منتقٍ.** */}
      <FormField label="تاريخ السجل" type="date" value={logDate} disabled />
      <MortalityBlock
        count={draft.mortalityCount}
        cause={draft.mortalityCause}
        onCountChange={(mortalityCount) => {
          patch({ mortalityCount });
        }}
        onCauseChange={(mortalityCause) => {
          patch({ mortalityCause });
        }}
      />
      <FeedBlock
        rows={draft.feedRows}
        products={products}
        onChange={(key, rowPatch) => {
          setDraft((current) => patchFeedRow(current, key, rowPatch));
        }}
        onAdd={() => {
          setDraft((current) => addFeedRow(current, newClientId()));
        }}
        onRemove={(key) => {
          setDraft((current) => removeFeedRow(current, key));
        }}
      />
      <MeasurementsBlock
        draft={draft}
        tankCapacityL={house.waterTankCapacityL === null ? null : Number(house.waterTankCapacityL)}
        onChange={patch}
      />
    </>
  );
}

/**
 * **سياقُ العنبر ودفعته** — **ولا يُعرض المشترى**: المربّي أعمى عنه (القرار
 * 276)، **والخادم لا يُرسله إليه أصلًا** (280).
 *
 * **و«عنبرٌ آخر» يُذكر عددًا ولا يُبدَّل إليه:** مبدّلُ العنبر بندٌ في
 * الرئيسية (§5-أ-1) **ولم تُبنَ** — **وذكرُ العدد أصدق من السكوت**.
 */
function Context({
  house,
  batchBirds,
  otherHouseCount,
}: {
  house: HouseCard;
  batchBirds: number | null;
  otherHouseCount: number;
}) {
  return (
    <View style={styles.context}>
      <Text style={styles.contextTitle}>{house.name}</Text>
      {batchBirds === null ? null : (
        <Text style={styles.contextLine}>{`عدد الطيور المستلم: ${String(batchBirds)}`}</Text>
      )}
      {otherHouseCount > 0 ? (
        <Text style={styles.contextLine}>
          {`ولك ${String(otherHouseCount)} عنبرٌ آخر — التبديل بينها لم يُبنَ بعد`}
        </Text>
      ) : null}
    </View>
  );
}

/** **ما بعد الحفظ** — **ولا وضعَ قراءةٍ للسجل**: لا مسارَ قراءةٍ للسجلات (§14.2 لم تُبنَ). */
function Saved({ feedKgTotal, onAgain }: { feedKgTotal: number; onAgain: () => void }) {
  return (
    <View style={styles.context}>
      <Text style={styles.contextTitle}>حُفظ سجل اليوم</Text>
      <Text style={styles.contextLine}>{`إجمالي العلف المخصوم: ${String(feedKgTotal)} كجم`}</Text>
      <Text style={styles.contextLine}>عرضُ السجل المحفوظ وإضافةُ ملاحظةٍ عليه لم يُبنيا بعد</Text>
      <Button label="سجل يوم آخر" variant="secondary" onPress={onAgain} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.lg },
  /** الحقولُ تُمرَّر والزرُّ ثابت — **فالغلافُ عمودٌ يملأ ما بقي من الشاشة**. */
  formShell: { flex: 1 },
  /**
   * **شريطُ الحفظ — فوق شريط التبويبات مباشرةً وبخلفيةٍ صمّاء**: شفافيةٌ
   * تجعل نصّ النموذج يمرّ تحته فيصير الزرُّ غيرَ مقروء تحت الشمس، **ولا
   * شفافية في هذا التطبيق أصلًا**. **وحدٌّ علويّ يفصله عمّا يُمرَّر تحته.**
   */
  saveBar: {
    padding: spacing.lg,
    backgroundColor: color.surfacePage,
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
  },
  context: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: color.surfaceSunken,
  },
  contextTitle: {
    fontSize: font.size.subtitle,
    fontFamily: font.familyBold,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
  contextLine: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
  failure: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.statusCritical,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
