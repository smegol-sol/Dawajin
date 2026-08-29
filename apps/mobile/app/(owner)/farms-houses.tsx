import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, View } from "react-native";

import { FarmsLevel } from "@/components/infrastructure/FarmsLevel";
import { HousesLevel } from "@/components/infrastructure/HousesLevel";
import { SitesLevel } from "@/components/infrastructure/SitesLevel";
import { AccountSheet } from "@/components/ui/AccountSheet";
import { AppHeader } from "@/components/ui/AppHeader";
import { ListState } from "@/components/ui/ListState";
import { spacing } from "@/constants/theme";
import { useAccountSheet } from "@/lib/account";
import { fetchCurrentUser } from "@/lib/api";
import { infrastructureCapabilitiesFor } from "@/lib/capabilities";
import type { FarmCard, SiteCard } from "@/lib/infrastructureApi";
import {
  contextLine,
  currentLevel,
  descend,
  goBack,
  initialTrail,
  type Level,
  type TrailEntry,
} from "@/lib/infrastructureNavigation";
import { useAuthToken } from "@/lib/useAuthToken";

/**
 * المواقع والمزارع والعنابر — **ثلاثة مستويات في شاشة واحدة** (§5-د-2).
 *
 * **لا تفترض هذه الشاشة أن المستخدم يرى كل شيء:** القوائم والعدّادات مفلترة
 * بالإسناد في الخادم (القراران #129 و#131)، وتُعرض كما جاءت بلا إعادة حساب. والقدرات
 * تُسأل لا الأدوار (`capabilities.ts`).
 *
 * والتخطّي والرجوع في `lib/infrastructureNavigation.ts` — نموذج خالص مفحوص
 * وحده، فلا يختلط «إلى أين يعود من هبط بلا اختيار؟» بجلب البيانات.
 */
export default function OwnerFarmsHouses() {
  const router = useRouter();
  const token = useAuthToken();
  const [trail, setTrail] = useState<TrailEntry[]>(initialTrail);
  const level = currentLevel(trail);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchCurrentUser(token ?? ""),
    enabled: typeof token === "string",
  });
  const capabilities = infrastructureCapabilitiesFor(me.data?.role ?? "");

  const back = useCallback(() => {
    setTrail((current) => {
      const next = goBack(current);
      if (next === null) {
        router.back();
        return current;
      }
      return next;
    });
  }, [router]);

  useHardwareBack(trail, back);
  const account = useAccountSheet();

  const openSite = useCallback((site: SiteCard, automatic: boolean) => {
    setTrail((current) =>
      descend(current, { kind: "farms", siteId: site.id, siteName: site.name }, automatic)
    );
  }, []);

  const line = contextLine(trail);

  return (
    <View style={styles.screen}>
      <AppHeader
        title={headerTitle(level)}
        variant={trail.length === 1 ? "main" : "sub"}
        onBackPress={back}
        onAccountPress={account.open}
        {...(line === undefined ? {} : { contextLine: line })}
      />
      <ScrollView contentContainerStyle={styles.body}>
        {typeof token !== "string" ? (
          <ListState state="loading" />
        ) : (
          <LevelSwitch
            level={level}
            token={token}
            capabilities={capabilities}
            onOpenSite={openSite}
            setTrail={setTrail}
          />
        )}
      </ScrollView>
      <AccountSheet
        visible={account.visible}
        onClose={account.close}
        identity={account.identity}
        onLogout={account.logout}
      />
    </View>
  );
}

/** المستوى المعروض — تفرّع واحد صريح بدل شرط منثور في الشاشة. */
function LevelSwitch({
  level,
  token,
  capabilities,
  onOpenSite,
  setTrail,
}: {
  level: Level;
  token: string;
  capabilities: ReturnType<typeof infrastructureCapabilitiesFor>;
  onOpenSite: (site: SiteCard, automatic: boolean) => void;
  setTrail: React.Dispatch<React.SetStateAction<TrailEntry[]>>;
}) {
  if (level.kind === "sites") {
    return <SitesLevel token={token} capabilities={capabilities} onOpen={onOpenSite} />;
  }

  if (level.kind === "farms") {
    const siteName = level.siteName;
    return (
      <FarmsLevel
        token={token}
        siteId={level.siteId}
        capabilities={capabilities}
        onOpen={(farm: FarmCard, automatic: boolean) => {
          setTrail((current) =>
            descend(
              current,
              { kind: "houses", farmId: farm.id, farmName: farm.name, siteName },
              automatic
            )
          );
        }}
      />
    );
  }

  return (
    <HousesLevel
      token={token}
      farmId={level.farmId}
      farmName={level.farmName}
      capabilities={capabilities}
    />
  );
}

function headerTitle(level: Level): string {
  if (level.kind === "sites") return "المواقع";
  if (level.kind === "farms") return level.siteName;
  return level.farmName;
}

/**
 * زر الرجوع العتادي في أندرويد — **نفس سلوك سهم الرأس بالضبط**.
 *
 * يبتلع الحدث ما دام في الأثر مستوى يُرجَع إليه، ويتركه للنظام حين لا يبقى
 * شيء — فتُغادَر الشاشة كما يُغادَر أي تبويب. بلا هذا يخرج المستخدم من
 * التبويب كله من المستوى الثالث بدل أن يصعد مستوى.
 */
function useHardwareBack(trail: TrailEntry[], back: () => void): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (goBack(trail) === null) return false;
      back();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [trail, back]);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
});
