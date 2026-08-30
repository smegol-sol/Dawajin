import "@/lib/rtl"; // يجب أن يبقى أول استيراد — انظر تعليق الملف نفسه

import { Tajawal_500Medium, Tajawal_700Bold } from "@expo-google-fonts/tajawal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Font from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ListState } from "@/components/ui/ListState";
import { color } from "@/constants/theme";
import { bestEffort } from "@/lib/bestEffort";
import { beginRestore, restoreSnapshot, retryRestore, subscribeRestore } from "@/lib/sessionRestore";

bestEffort(SplashScreen.preventAutoHideAsync());

// **يبدأ عند الاستيراد، على نطاق وحدة الجذر** — لا داخل مؤثّر شاشة (القرار
// رقم 177). هذا هو النطاق الوحيد الذي ثبت تنفيذه بالقياس.
beginRestore();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const session = useSyncExternalStore(subscribeRestore, restoreSnapshot);
  useEffect(() => {
    bestEffort(
      Font.loadAsync({
        // الوزنان المسموحان فقط (docs/app-complete-spec.md §7.2: "لا وزن أخف من 500") —
        // لا Tajawal_400Regular ولا أي وزن أخف، رغم توفّره في الحزمة نفسها.
        Tajawal_500Medium,
        Tajawal_700Bold,
      }).finally(() => {
        // يعمل في كلتا الحالتين — الخط الافتراضي مقبول مؤقتًا، والشاشة
        // يجب ألا تبقى معلّقة على فشل تحميل خط
        setFontsLoaded(true);
        bestEffort(SplashScreen.hideAsync());
      })
    );
  }, []);

  /**
   * **بوّابة الانتظار طبقة فوق المُنقِّل لا بديلًا عنه.**
   *
   * الجذر **يصيّر مُنقِّلًا في أول طلاء دائمًا**، وإرجاع `null` بدله يعني أن
   * لا مُنقِّل وقتها — فلا تُطلى الشاشة الأولى أصلًا. فالبوّابة تُصيَّر **فوق**
   * `Stack` وتحجب ما تحته حجبًا تامًّا، و`Stack` مركَّب طوال الوقت.
   *
   * **والجذر لا يوجّه**: التوجيه إعلاني في المسار نفسه (`app/index.tsx`).
   * `router.replace` من داخل تخطيط الجذر هو ما ترفضه expo-router صراحةً
   * برسالة «Attempted to navigate before mounting the Root Layout component»
   * — مُقاس على الجهاز، لا مُستنتَج (القرار رقم 177).
   *
   * والنتيجة المطلوبة قائمة: **لا يرى المستخدم أي شاشة — ولا شاشة الدخول —
   * قبل أن تستقرّ الاستعادة.**
   */
  const gate =
    !fontsLoaded || session.status === "pending" ? (
      <View style={styles.gate} />
    ) : session.outcome.kind === "unreachable" ? (
      // تعذّر الاتصال ليس خروجًا: الرمز باقٍ، والمعروض إعادة محاولة لا
      // مطالبة بكلمة مرور (القرار رقم 177).
      <View style={[styles.gate, styles.gateCentered]}>
        <ListState
          state="error"
          reason="تعذّر الاتصال بالخادم — تحقّق من الشبكة ثم أعد المحاولة"
          onRetry={retryRestore}
        />
      </View>
    ) : null;

  return (
    <QueryClientProvider client={queryClient}>
      {/* أندرويد 15+ يفرض edge-to-edge على كل تطبيق يستهدف API 35 فأعلى، ولا
          انسحاب منه في 36 — فالمحتوى يُرسم تحت شريطَي النظام ما لم تُقرأ
          المناطق الآمنة. المزوّد هنا هو مصدرها الوحيد (القرار #171). */}
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.surfacePage },
          }}
        >
          {/* **`index` أوّل معلَن — وموضعه هو ما يحسم شاشة البدء.**
              expo-router يرتّب شاشات المُنقِّل من إعلانات `<Stack.Screen>` نفسها
              متى وُجدت (`useScreens.js:54`)، ويُلحق غير المعلَن في الذيل. وكان
              `index` غير معلَن، فوقع آخر القائمة و`routeNames[0]` صار
              `auth/login` — **فبدأ المُنقِّل على شاشة الدخول رغم أن الرابط
              جذري** (مُقاس: `stack-names_…-idx_0-active_auth/login`). */}
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/select-account" />
          <Stack.Screen name="auth/password" />
          {/* بلا إيماءة رجوع: التغيير إجباري ولا يُتجاوَز (زر رجوع أندرويد
              معترَض داخل الشاشة نفسها أيضًا) */}
          <Stack.Screen name="auth/change-password" options={{ gestureEnabled: false }} />
          <Stack.Screen name="design-system" />
          <Stack.Screen name="(farmer)" />
          <Stack.Screen name="(supervisor)" />
          <Stack.Screen name="(vet)" />
          <Stack.Screen name="(owner)" />
        </Stack>
        {gate}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  gate: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.surfacePage,
  },
  gateCentered: {
    justifyContent: "center",
  },
});
