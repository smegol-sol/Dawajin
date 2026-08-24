import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { color, component, font, radius, spacing } from "@/constants/theme";

export interface BottomTabItem {
  key: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** شارة عدد حمراء عند اللزوم (§8.9) — مثل مهام صحية عاجلة أو مراجعات معلّقة. */
  badgeCount?: number;
}

/**
 * BottomTabBar — عرض تقديمي مطابق لرموز §8.9، مستقل عن react-navigation
 * (يُستخدم في صفحة عرض نظام التصميم؛ التنقّل الفعلي عبر Tabs من expo-router
 * وtabBarOptions.tsx).
 */
export function BottomTabBar({
  tabs,
  onTabPress,
}: {
  tabs: BottomTabItem[];
  onTabPress?: (key: string) => void;
}) {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const tintColor = tab.active ? color.accentSuccess : color.textBody;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabPress?.(tab.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: tab.active }}
            style={styles.tab}
          >
            <View>
              <Icon color={tintColor} size={22} strokeWidth={tab.active ? 2.5 : 2} />
              {tab.badgeCount !== undefined && tab.badgeCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badgeCount}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                { color: tintColor, fontFamily: tab.active ? font.familyBold : font.familyRegular },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    height: component.bottomTabBar.height,
    backgroundColor: color.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  label: {
    fontSize: font.size.tabLabel,
    writingDirection: "rtl",
  },
  badge: {
    position: "absolute",
    top: -4,
    left: -8,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: color.statusCritical,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxs,
  },
  badgeText: {
    fontSize: font.size.technicalRef,
    color: color.textOnDark,
    fontFamily: font.familyNumber,
    writingDirection: "ltr",
  },
});
