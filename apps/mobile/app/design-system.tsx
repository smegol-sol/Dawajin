import {
  Activity,
  Ban,
  Bell,
  ClipboardList,
  ClockAlert,
  CircleCheck,
  CircleCheckBig,
  CircleX,
  DoorClosed,
  DoorOpen,
  Home,
  Hourglass,
  RefreshCw,
  Scale,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "@/components/ui/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chart } from "@/components/ui/Chart";
import { Chip } from "@/components/ui/Chip";
import { FormField } from "@/components/ui/FormField";
import { ListState } from "@/components/ui/ListState";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatTile } from "@/components/ui/StatTile";
import { color, font, radius, spacing } from "@/constants/theme";

/**
 * صفحة عرض نظام التصميم — تعرض كل مكوّن مشترك بكل حالاته للاعتماد قبل بناء
 * أي شاشة فعلية (docs/app-complete-spec.md §15-6: "صفحة نظام التصميم أولًا،
 * تُراجَع وتُعتمد قبل تصميم أي شاشة"). مسار مستقل خارج كل تخطيطات الأدوار —
 * لا يظهر في أي مكدّس تبويب عمدًا (أداة عمل داخلية لا شاشة منتج).
 */
export default function DesignSystemScreen() {
  return (
    <View style={styles.screen}>
      <AppHeader variant="main" title="نظام التصميم" hasNotifications />
      <ScrollView contentContainerStyle={styles.content}>
        <BadgeSection />
        <ButtonSection />
        <CardSection />
        <StatTileSection />
        <AppHeaderSection />
        <BottomTabBarSection />
        <NumberStepperSection />
        <FormFieldSection />
        <ListStateSection />
        <ChipSection />
        <SegmentedControlSection />
        <BottomSheetSection />
        <ProgressBarSection />
        <ChartSection />
      </ScrollView>
    </View>
  );
}

const BATCH_BADGES = [
  { tone: "success", icon: Activity, label: "دفعة نشطة" },
  { tone: "warning", icon: ClockAlert, label: "بانتظار مراجعة" },
  { tone: "info", icon: RefreshCw, label: "صُحِّح" },
  { tone: "critical", icon: CircleX, label: "رُفض" },
  { tone: "success", icon: CircleCheck, label: "مطابق" },
  { tone: "warning", icon: Scale, label: "فرق مسجّل" },
  { tone: "critical", icon: ShieldAlert, label: "نزاع" },
] as const;

const HOUSE_BADGES = [
  { tone: "success", icon: DoorClosed, label: "مشغول" },
  { tone: "warning", icon: DoorOpen, label: "تحت الإخلاء" },
  { tone: "info", icon: Sparkles, label: "تحت التنظيف والتطهير" },
  { tone: "info", icon: Hourglass, label: "في فترة الراحة" },
  { tone: "success", icon: CircleCheckBig, label: "جاهز للإسكان" },
  { tone: "warning", icon: Wrench, label: "تحت الصيانة" },
  { tone: "critical", icon: Ban, label: "معطّل" },
] as const;

function BadgeSection() {
  return (
    <Section title="Badge — شارة الحالة" count={14}>
      <Text style={styles.groupLabel}>الدفعات والسجلات</Text>
      <Row>
        {BATCH_BADGES.map((b) => (
          <Badge key={b.label} tone={b.tone} icon={b.icon} label={b.label} />
        ))}
      </Row>
      <Text style={styles.groupLabel}>العنابر</Text>
      <Row>
        {HOUSE_BADGES.map((b) => (
          <Badge key={b.label} tone={b.tone} icon={b.icon} label={b.label} />
        ))}
      </Row>
    </Section>
  );
}

function ButtonSection() {
  const noop = () => undefined;
  return (
    <Section title="Button — أربعة متغيّرات" count={4}>
      <Button label="حفظ السجل" variant="primary" onPress={noop} formSize />
      <Button label="عرض التفاصيل" variant="secondary" onPress={noop} />
      <Button label="رفض السجل" variant="danger" onPress={noop} />
      <Button
        label="إغلاق الدفعة"
        variant="primary"
        onPress={noop}
        disabledReason="يوجد سجلان بانتظار مراجعة المشرف"
      />
    </Section>
  );
}

function CardSection() {
  const noop = () => undefined;
  return (
    <Section title="Card — بطاقة كيان" count={3}>
      <Card
        title="عنبر 1"
        subtitle="دفعة روس 308 — اليوم 22 من 42"
        badge={<Badge tone="success" icon={Activity} label="دفعة نشطة" />}
        primaryActionLabel="عرض التفاصيل"
        onPrimaryAction={noop}
        onMorePress={noop}
      >
        <StatTile label="FCR" value="1.62" standardValue="1.65" trend="down" tone="success" />
        <StatTile label="نفوق" value="0.4%" standardValue="0.5%" trend="flat" />
      </Card>
      <Card
        title="عنبر رقم أربعة عشر - الجناح الشرقي الملحق بمزرعة الوادي الأخضر"
        subtitle="اسم طويل لاختبار الالتفاف — القاعدة #7 من §10"
        badge={<Badge tone="warning" icon={Wrench} label="تحت الصيانة" />}
        edgeTone="warning"
      />
      <Card title="الدفعة 2024-014 — روس 308" subtitle="اليوم 40 من 42" variant="identity">
        <StatTile label="الوزن الحالي" value="2.1" unit="كجم" standardValue="2.2 كجم" />
      </Card>
    </Section>
  );
}

function StatTileSection() {
  return (
    <Section title="StatTile" count={4}>
      <Row>
        <StatTile label="FCR" value="1.62" standardValue="1.65" trend="down" tone="success" />
        <StatTile
          label="نسبة النفوق التراكمي"
          value="2.1%"
          standardValue="1.8%"
          trend="up"
          tone="critical"
        />
        <StatTile label="نسبة الماء إلى العلف" unavailableReason="لم تُسجَّل معاينة وزن" />
        <StatTile label="أيام تغطية العلف" value="18" unit="يوم" trend="flat" />
      </Row>
    </Section>
  );
}

function AppHeaderSection() {
  const noop = () => undefined;
  return (
    <Section title="AppHeader — متغيّران" count={2}>
      <Text style={styles.groupLabel}>رئيسية (مستخدَم أعلى هذه الصفحة نفسها)</Text>
      <Text style={styles.groupLabel}>فرعية</Text>
      <View style={styles.headerPreview}>
        <AppHeader
          variant="sub"
          title="تفاصيل العنبر"
          contextLine="عنبر 1 — مزرعة الوادي الأخضر"
          onBackPress={noop}
          onBellPress={noop}
        />
      </View>
    </Section>
  );
}

function BottomTabBarSection() {
  return (
    <Section title="BottomTabBar" count={1}>
      <BottomTabBar
        tabs={[
          { key: "home", label: "الرئيسية", icon: Home, active: true },
          { key: "logs", label: "سجلاتي", icon: ClipboardList, active: false },
          { key: "notif", label: "الإشعارات", icon: Bell, active: false, badgeCount: 3 },
          { key: "users", label: "المستخدمون", icon: Users, active: false },
          { key: "settings", label: "الإعدادات", icon: Settings, active: false },
        ]}
      />
    </Section>
  );
}

function NumberStepperSection() {
  const [mortality, setMortality] = useState(3);
  const [feedBags, setFeedBags] = useState(12.5);
  return (
    <Section title="NumberStepper" count={2}>
      <Row>
        <NumberStepper value={mortality} step={1} onChange={setMortality} computedLine="عدد النافق" />
        <NumberStepper
          value={feedBags}
          step={0.5}
          onChange={setFeedBags}
          computedLine={`= ${feedBags * 25} كجم`}
        />
      </Row>
    </Section>
  );
}

function FormFieldSection() {
  const [text, setText] = useState("");
  return (
    <Section title="حقول النموذج — أربع حالات" count={4}>
      <FormField label="اسم الدفعة (عادي)" type="text" value={text} onChangeText={setText} />
      <FormField label="اسم الدفعة (مركّز)" type="text" forceFocusedStyle />
      <FormField label="اسم الدفعة (خطأ)" type="text" error="هذا الحقل إلزامي" />
      <FormField label="اسم الدفعة (معطّل)" type="text" value="دفعة 2024-014" disabled />
      <FormField label="ملاحظات" type="longText" />
      <FormField label="السلالة" type="select" value="روس 308" onPress={() => undefined} />
      <FormField label="تاريخ الاستلام" type="date" onPress={() => undefined} />
    </Section>
  );
}

function ListStateSection() {
  const noop = () => undefined;
  return (
    <Section title="الحالات الأربع للقوائم" count={4}>
      <Text style={styles.groupLabel}>عادية</Text>
      <ListState state="content">
        <Card title="عنبر 1" subtitle="دفعة روس 308" />
      </ListState>
      <Text style={styles.groupLabel}>تحميل</Text>
      <ListState state="loading" skeletonCount={2} />
      <Text style={styles.groupLabel}>فارغة</Text>
      <ListState
        state="empty"
        message="لا توجد شحنات هذا الأسبوع. سجّل شحنة علف عند وصولها"
        actionLabel="تسجيل شحنة"
        onAction={noop}
      />
      <Text style={styles.groupLabel}>خطأ</Text>
      <ListState
        state="error"
        reason="تعذّر تحميل البيانات — السبب: انقطاع الاتصال بالشبكة في العنبر"
        onRetry={noop}
      />
    </Section>
  );
}

function ChipSection() {
  const [selected, setSelected] = useState("مرض تنفسي");
  const causes = ["مرض تنفسي", "إجهاد حراري", "مشاكل مياه/علف", "حادث", "غير معروف", "أخرى"];
  return (
    <Section title="Chips" count={2}>
      <Row>
        {causes.map((cause) => (
          <Chip
            key={cause}
            label={cause}
            selected={selected === cause}
            onPress={() => { setSelected(cause); }}
          />
        ))}
      </Row>
    </Section>
  );
}

function SegmentedControlSection() {
  const [selected, setSelected] = useState("all");
  return (
    <Section title="Segmented Control" count={1}>
      <SegmentedControl
        options={[
          { key: "all", label: "الكل", count: 12 },
          { key: "pending", label: "معلّقة", count: 3 },
          { key: "received", label: "مستلمة", count: 9 },
          { key: "cancelled", label: "ملغاة (مخفية لأن عددها صفر)", count: 0 },
        ]}
        selectedKey={selected}
        onChange={setSelected}
      />
    </Section>
  );
}

function BottomSheetSection() {
  const [visible, setVisible] = useState(false);
  return (
    <Section title="Bottom Sheet" count={1}>
      <Button label="فتح مبدّل العنبر" variant="secondary" onPress={() => { setVisible(true); }} />
      <BottomSheet visible={visible} onClose={() => { setVisible(false); }} title="اختر العنبر">
        <Text style={styles.groupLabel}>عنبر 1 · عنبر 2 · عنبر 3</Text>
      </BottomSheet>
    </Section>
  );
}

function ProgressBarSection() {
  return (
    <Section title="شريط التقدّم" count={3}>
      <ProgressBar value={12} ceiling={14} tone="success" />
      <ProgressBar value={4} ceiling={14} tone="warning" />
      <ProgressBar value={1} ceiling={14} tone="critical" />
    </Section>
  );
}

function ChartSection() {
  return (
    <Section title="نمط الرسم البياني" count={1}>
      <Chart actual={[1.9, 1.85, 1.75, 1.68, 1.62]} standard={[1.9, 1.82, 1.74, 1.69, 1.65]} />
    </Section>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} count={count} />
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surfacePage,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
  sectionBody: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  groupLabel: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
  headerPreview: {
    borderWidth: 1,
    borderColor: color.borderSubtle,
    borderRadius: radius.card,
    overflow: "hidden",
  },
});
