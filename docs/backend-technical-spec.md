# المواصفة التقنية الكاملة — إعادة البناء
## نظام إدارة مزارع دواجن التسمين

**النسخة 2.0 · وثيقة تنفيذية وتعاقدية للمطوّرين**

> **الغرض:** بناء النظام من الصفر. تُقرأ مع «الوثيقة الشاملة» (`docs/app-complete-spec.md`) التي تصف الواجهة.
>
> **الوثيقة الشاملة = ماذا يرى المستخدم · هذه الوثيقة = ماذا يحدث خلف الشاشة وكيف يُبنى.**
>
> **القاعدة الحاكمة:** كل قرار هنا له سبب في الملحق أ (`docs/decisions.md`). لا تُلغَ قيدًا قبل قراءة سببه — أغلب القيود نتجت عن أخطاء وقعت فعلًا.

> **ملاحظة تحويل:** هذا الملف نسخة Markdown نظيفة ومراجَعة يدويًا من `docs/backend-technical-spec.pdf` الأصلي، لجعل المحتوى قابلًا للمقارنة (diff) وللقراءة الآلية. عند أي تعارض دقيق، يبقى الـ PDF الأصلي هو المرجع الحرفي، لكن هذا الملف هو المصدر العملي اليومي للفريق.

---

## الفهرس

**الجزء الأول — المكدّس والبنية**
1. المبادئ المعمارية · 2. المكدّس التقني الكامل · 3. البنية التحتية والاستضافة · 4. بيئة التطوير · 5. بنية المشروع · 6. معايير الكود

**الجزء الثاني — البيانات**
7. مخطط قاعدة البيانات · 8. أنواع Enum · 9. الفهارس والقيود · 10. الترحيلات

**الجزء الثالث — المنطق**
11. المصادقة · 12. الصلاحيات · 13. دفتر المخزون · 14. التدفقات · 15. المعادلات · 16. المهام المجدولة والإشعارات

**الجزء الرابع — الواجهة البرمجية**
17. نقاط الـ API · 18. العقود · 19. رموز الأخطاء

**الجزء الخامس — الجودة والتشغيل**
20. الاختبارات · 21. الفحوص الآلية · 22. الأداء والحدود · 23. الأمان · 24. المراقبة · 25. النشر · 26. معايير القبول

**الملاحق**
أ. سجل القرارات ومبرراتها (→ `docs/decisions.md`) · ب. قائمة الحزم · ج. متغيرات البيئة

---
---

# الجزء الأول — المكدّس والبنية

---

# 1 · المبادئ المعمارية

> **ومدير المنصة طبقة منفصلة بنيويًا لا قيمةً في عمود (القرار #146).** لا يُخزَّن في نفس جدول أدوار المستأجر، ولا يُشتق من دور «المالك»، ولا يُمنح بقيمة إضافية في نفس الحقل. **أي تصميم يجعل الفرق بينهما قيمة واحدة مرفوض** — لأن **خطأ واحد في شرط استعلام يحوّل مالك مزرعة إلى مدير منصة**.
>
> **والفصل في التحقق كما في التخزين (القرار #147):** مسار دخول منفصل بعنوان وشاشة مختلفين، والتحقق في جدول مدير المنصة وحده. **شاشة موحَّدة تبحث في الجدولين ثم تقرر تعيد بناء الخلط من باب آخر** — الفصل في التخزين بلا فصل في التحقق يترك نفس النقطة الواحدة التي يقرّر فيها سطرٌ من أنت. والرفض في الاتجاهين برسالة واحدة لا تكشف أي جدول فيه الحساب.
>
> **والتصميم القائم اليوم يخالف ذلك ويُحسم قبل بناء أي شيء من مدير المنصة:** `platform_admin` قيمة سادسة في `USER_ROLE` تُخزَّن في `users.role`، و`users.tenant_id` قابل لـ`NULL`، و`requireTenant` يقصّر الدائرة على تلك القيمة وحدها — فسلسلة العزل كلها تُتخطّى بقيمة enum واحدة. §7-ب البند 25.

> **افتراض ملزم على كل ما يُبنى من الآن: للخادم مستهلك ثانٍ قادم** — منصة ويب للمحاسبين والمراجعين تشارك نفس قاعدة البيانات (القراران #137 و#138). فمنطق الصلاحيات والإسناد يبقى في **طبقة خدمة قابلة لإعادة الاستخدام** لا داخل معالجات المسارات، ولا شيء في المخطط يفترض أن هذه القاعدة لتطبيق الموبايل وحده.
>
> **والمحاسب دورٌ داخل المستأجر لا مدير منصة (القرار 204)** — ويُكتب صراحةً كي لا يُقرأ خطأً: **يرث العزل** (`tenant_id` من الرمز حصريًا) فيرى دفاتر مستأجره وحده، **ويدخل عبر هذا الخادم لا بالقاعدة** (#138)، **ولا علاقة له بـ`platform_admins`** (القرارات 194–196): **ذاك جدولٌ بلا `tenant_id` لأن مدير المنصة عابرٌ للمستأجرين، والمحاسب داخل واحد**. **وخلطهما يمنح محاسبَ عميلٍ رؤيةَ دفاتر عملاء آخرين** — وهو عين ما بُني الفصل لمنعه (#146 و#147). **وإضافته دورًا آمنةٌ بالبناء لا بالانتباه** (القرار 184): الحارس قائمة موجبة، **فدورٌ جديد لا يرى شيئًا حتى يُدرَج**. **وما يراه داخل مستأجره قرارُ مالك لم يُحسم** (#131).

> **والمنصة تمرّ بهذا الخادم لا باتصال مباشر بالقاعدة (القرار #138):** قواعد الإسناد وتقييد القراءة وفلترة السرد تعيش في طبقة الخدمة (القرارات #126 و#128 و#129 و#131) **لا في القاعدة**. الاتصال المباشر يتخطاها كلها ويجعل الصلاحيات مصدرَي حقيقة — وهو النمط الذي كلّف #99 و#128.

سبعة قيود بنيوية، كل واحد نتج عن خطأ وقع فعلًا. التفصيل الكامل لكل قرار في `docs/decisions.md`.

| # | المبدأ | القاعدة |
|---|---|---|
| 1 | الفرض المركزي | أي قيد أمني يُفرض في طبقة واحدة، لا باستدعاء يدوي في كل نقطة |
| 2 | المعاملة والقفل | كل عملية متعددة الجداول في معاملة، مع إعادة قراءة الحرّاس داخلها تحت القفل |
| 3 | دفتر حركة | لا عمود رصيد يُحدَّث — الرصيد = مجموع الحركات |
| 4 | السجل غير قابل للتعديل | لا `UPDATE` على سجل ميداني — التصحيح بسجل جديد مرتبط |
| 5 | لا يُمنع الميدان بسبب الإدارة | إعداد ناقص أو رصيد غير كافٍ يُنبّه ولا يمنع |
| 6 | الوجود ثم التعيين | غير موجود ← 404 · موجود غير مُسند ← 403 |
| 7 | عزل مطلق | `tenant_id` من JWT حصريًا · فلترة مركزية |

---

# 2 · المكدّس التقني الكامل

## 2.1 نظرة عامة

```
┌──────────────────────────────────────────────────────────┐
│  تطبيق الموبايل — Expo / React Native (iOS+Android)        │
└──────────────────────────────┬─────────────────────────────┘
                                │ HTTPS · REST · JWT
┌──────────────────────────────▼─────────────────────────────┐
│  خادم API — Node.js + Express + TypeScript                 │
│  ├─ middleware: auth · tenant · entityAccess                │
│  ├─ routes · services · lib                                 │
│  └─ cron: التصعيد · التنبيهات · الملخص اليومي                │
└──────────────────────────────┬─────────────────────────────┘
                                │ Drizzle ORM · pg
┌──────────────────────────────▼─────────────────────────────┐
│  PostgreSQL 15+                                             │
└──────────────────────────────────────────────────────────────┘
```

## 2.2 تطبيق الموبايل

| العنصر | الاختيار | الإصدار | لماذا |
|---|---|---|---|
| الإطار | Expo (Managed) | SDK 54+ | بلا Xcode/Android Studio لبناء iOS/Android · EAS Build · تحديثات OTA |
| القاعدة | React Native | 0.81+ | مربوط بإصدار Expo SDK |
| اللغة | TypeScript | 5.4+ | `strict: true` إلزامي |
| التوجيه | Expo Router | 6+ | توجيه قائم على الملفات · Tabs متداخل حقيقي لكل دور |
| جلب البيانات | TanStack Query | 5+ | تخزين مؤقت · إبطال · إعادة محاولة |
| عميل HTTP | Axios | 1.7+ | مع interceptor لتجديد الرمز |
| التخزين الآمن | expo-secure-store | — | JWT حصريًا — لا AsyncStorage للرموز |
| التخزين العادي | AsyncStorage | — | التفضيلات · مسودات النماذج · آخر عنبر مختار |
| الإشعارات | expo-notifications | — | بلا خادم دفع خاص — Expo Push |
| الكاميرا والصور | expo-image-picker · expo-camera | — | — |
| الصوت | expo-av | — | الملاحظة الصوتية (60 ثانية) |
| ضغط الصور | expo-image-manipulator | — | قبل الرفع |
| الخط | Tajawal (500 · 700) | expo-font | لا وزن أخف من 500 |
| الأيقونات | lucide-react-native | — | مكتبة واحدة · لا إيموجي إطلاقًا |
| الرسوم البيانية | react-native-svg + رسم يدوي | — | لا مكتبة ثقيلة — منحنى واحد لكل تقرير |
| التواريخ | date-fns + date-fns/locale/ar | 3+ | خفيفة وقابلة للاهتزاز الشجري |
| النماذج | react-hook-form + zod | — | نفس مخططات zod المستخدمة في الخادم |
| الحالة | Context API | — | الحالة العامة محدودة (auth · farmerContext) — لا Redux |

**قرارات مرفوضة صراحة:**
- ❌ Bare React Native — يضاعف عبء البناء بلا مكسب هنا
- ❌ Redux/Zustand — TanStack Query تغطي حالة الخادم، والباقي محلي
- ❌ NativeWind/Tailwind — نظام الرموز مباشر و`StyleSheet` أوضح للفريق
- ❌ الوضع الداكن — التطبيق يُستخدم تحت الشمس (انظر `docs/decisions.md`)

## 2.3 الخادم

| العنصر | الاختيار | الإصدار | لماذا |
|---|---|---|---|
| البيئة | Node.js LTS | 20+ | — |
| الإطار | Express | 4.19+ | بسيط · middleware واضح · يناسب حجم النظام |
| اللغة | TypeScript | 5.4+ | `strict: true` |
| البناء | esbuild | — | سريع · حزمة واحدة للنشر |
| التحقق | zod | 3+ | مشترك مع العميل — مصدر واحد للتحقق |
| المصادقة | jose | 5+ | JWT توقيعًا وتحققًا |
| التشفير | bcryptjs | 2.4+ | كلمات المرور · تكلفة 10 |
| التسجيل | pino | 9+ | JSON منظّم · سريع |
| الجدولة | node-cron | 3+ | التصعيد والتنبيهات |
| رفع الملفات | multer + S3 SDK | — | الصور والملاحظات الصوتية |
| التوثيق | OpenAPI 3.1 | — | مصدر الحقيقة لعقود الـ API |
| الحماية | helmet · cors · express-rate-limit | — | — |
| التوليد | openapi-typescript + orval | — | توليد hooks العميل من العقد |

**قرارات مرفوضة:**
- ❌ NestJS — عبء بنيوي أكبر من حاجة النظام
- ❌ GraphQL — التطبيق يستهلك مسارات محددة، وREST أوضح للتدقيق الأمني
- ❌ Prisma — Drizzle أخف وأقرب لـ SQL، ومهم هنا لأن دفتر المخزون يحتاج استعلامات تجميع دقيقة

## 2.4 قاعدة البيانات

| العنصر | الاختيار | لماذا |
|---|---|---|
| المحرك | PostgreSQL 15+ | معاملات · أقفال استشارية · فهارس جزئية · قيود `CHECK` كلها مستخدمة فعليًا |
| ORM | Drizzle ORM | مخطط بـ TypeScript·SQL شفاف · لا طبقة سحرية |
| الترحيلات | Drizzle Kit | ملفات مرقّمة + journal — لا `push` إطلاقًا |
| مجمّع الاتصالات | pg.Pool | حد أقصى قابل للضبط حسب خطة الاستضافة |

**ميزات PostgreSQL المستخدمة — لا بديل عنها:**
- `pg_advisory_xact_lock` — تسلسل العمليات على العنبر الواحد
- الفهارس الجزئية — `WHERE correction_of_id IS NULL` · `WHERE tenant_id IS NULL`
- قيود `CHECK` — مستوى المخزن مع مرجع موضعه (`warehouses`)، وطرفا التحويل مختلفان
- `numeric` للكميات (لا `float` — أخطاء تقريب تكسر ثابت الدفتر)
- `timestamptz` لكل الأوقات
- أنواع Enum أصلية

**قرارات مرفوضة:**
- ❌ MySQL — لا أقفال استشارية ولا فهارس جزئية
- ❌ MongoDB — النظام علائقي بامتياز، وثابت الدفتر يحتاج معاملات
- ❌ SQLite — لا يخدم عدة مستأجرين متزامنين

## 2.5 المونوريبو

`pnpm workspaces` — مشاركة الأنواع ومخططات zod ومخطط قاعدة البيانات بين التطبيق والخادم بلا نشر حزم.

## 2.6 الخدمات الخارجية

| الخدمة | الغرض | البديل |
|---|---|---|
| Expo Push | إشعارات الدفع | مجاني · لا خادم خاص |
| تخزين كائنات (S3 أو متوافق) | الصور والصوت | Cloudflare R2 · Supabase Storage |
| خدمة بريد | استعادة كلمة المرور (لاحقًا) | اختيارية |

لا مطلوب حاليًا: بوابة دفع (التفعيل يدوي) · SMS (المشرف ينشئ الحسابات) · خدمة تحليلات خارجية.

---

# 3 · البنية التحتية والاستضافة

## 3.1 المتطلبات

| المكوّن | الحد الأدنى | التوسّع |
|---|---|---|
| خادم API | 2 vCPU · 4 GB RAM | أفقي خلف موازن حمل |
| قاعدة البيانات | 2 vCPU · 4 GB RAM · 50 GB SSD | رأسي ثم نسخ قراءة |
| تخزين الكائنات | بداية 20 GB | حسب الاستهلاك |

## 3.2 البيئات الثلاث

| البيئة | القاعدة | البيانات |
|---|---|---|
| `development` | منفصلة | تجريبية كاملة |
| `test` | منفصلة · بعلامة · تُمسح كل تشغيل | تُولَّد لكل اختبار |
| `production` | منفصلة | لا بيانات تجريبية إطلاقًا |

## 3.3 النسخ الاحتياطي

- نسخ يومي تلقائي · احتفاظ 30 يومًا — **قرار مالك بالقرار 209، بعد أن كانا رقمَين مكتوبين هنا بلا قرار خلفهما**
- **خارج الخادم — في مزوّد أو منطقة أخرى** (القرار 209). **ونسخة على نفس الخادم تموت معه**
- استعادة مختبَرة — **نسخة لم تُختبر ليست نسخة**. **و«شهريًّا» صارت كل ثلاثة أشهر بالقرار 209، وأولُ اختبار قبل أول عميل حقيقي لا بعد شهرٍ من التشغيل**
- **والاختبار ليس شكليًّا** (209): **تُؤخذ نسخة، وتُبنى منها قاعدة، ويُتحقَّق أن الأرقام تطابق** — واختبارٌ يقرأ حجم الملف ليس اختبارًا
- نسخة يدوية قبل كل ترحيل على الإنتاج

> **وبحكم السطر الثالث نفسه: لا نسخة عندنا اليوم** — **لم يُختبر استرجاع مرة واحدة قطّ** (§7-ب البند 42). **والتنفيذ ينتظر اختيار خادم الإنتاج: الأداة تتبع المنصة ولا تُسمّى قبلها** (#143).

## 3.4 الشبكة والأمان

- HTTPS إلزامي · HSTS
- CORS مقيّد بنطاقات التطبيق
- تحديد معدل: 100 طلب/دقيقة للمستخدم · 5 محاولات دخول ثم تأخير

---

# 4 · بيئة التطوير

## 4.1 المتطلبات

Node.js 20+ · pnpm 9+ · PostgreSQL 15+ (محلي أو Docker) · Expo CLI · EAS CLI

## 4.2 التشغيل

```bash
pnpm install
cp .env.example .env
pnpm --filter @app/db run migrate        # الترحيلات
pnpm --filter @app/api run seed:demo     # بيانات تجريبية (تطوير فقط)
pnpm --filter @app/api run dev           # الخادم
pnpm --filter @app/mobile run start      # Expo
```

## 4.3 السكربتات الإلزامية

| السكربت | الوظيفة |
|---|---|
| `migrate` | تطبيق الترحيلات |
| `generate` | توليد ترحيل من تغيّر المخطط |
| `seed:demo` | بيانات تجريبية عبر الـ API بحارس بيئة |
| `test` | اختبارات الوحدة |
| `test:integration` | اختبارات التكامل · قاعدة منفصلة · متسلسلة |
| `typecheck` | `tsc --noEmit` لكل الحزم |
| `check:all` | الفحوص الآلية الستة (القسم 21) |
| `api:generate` | توليد hooks العميل من OpenAPI |

## 4.4 مؤشر البيئة

`GET /health` يُرجع: البيئة · اسم القاعدة · آخر ترحيل، وشريط علوي مرئي في غير الإنتاج مطبّق.

---

# 5 · بنية المشروع

```
workspace/
├── apps/
│   ├── mobile/
│   │   ├── app/
│   │   │   ├── (farmer)/_layout.tsx              ← Tabs متداخل
│   │   │   ├── (supervisor)/_layout.tsx
│   │   │   ├── (vet)/_layout.tsx
│   │   │   ├── (owner)/_layout.tsx
│   │   │   └── platform/                         ← مسار منفصل
│   │   ├── components/ui/                         ← المكوّنات المشتركة
│   │   ├── constants/theme.ts                     ← الرموز — مصدر وحيد
│   │   ├── lib/                                    ← auth · contexts · format
│   │   └── hooks/
│   └── api/
│       └── src/
│           ├── middleware/     ← requireAuth · requireTenant · enforceEntityAccess
│           ├── routes/
│           ├── services/       ← منطق الأعمال
│           ├── lib/            ← access · inventory · scheduler · notify
│           ├── openapi/
│           └── index.ts
├── packages/
│   ├── db/
│   │   ├── src/schema/
│   │   └── migrations/          ← Drizzle Kit مرقّمة
│   ├── shared/                  ← أنواع ومخططات zod مشتركة
│   └── api-client/              ← hooks موّلدة
├── docs/
│   ├── app-complete-spec.md
│   ├── backend-technical-spec.md    ← هذا الملف
│   ├── backend-technical-spec.pdf   ← النسخة الأصلية المرجعية
│   ├── decisions.md                 ← نسخة حيّة من الملحق أ
│   └── work-plan.md
└── scripts/                       ← الفحوص الآلية — بلا ترحيلات backfill
```

---

# 6 · معايير الكود

- `TypeScript strict: true` في كل الحزم · لا `any` ضمني
- ESLint + Prettier — تنسيق موحّد يُفرض في CI
- أسماء الجداول والأعمدة `snake_case` · الكود `camelCase` · التحويل في طبقة ORM مركزية
- رسائل الخطأ عربية جاهزة للعرض — لا نصوص إنجليزية تصل المستخدم
- لا قيمة مُدمَجة في الكود (hardcoded) لأي شيء قابل للضبط — انظر إعدادات المستأجر
- كل دالة تكتب في أكثر من جدول تستقبل `tx` (سياق المعاملة) — لا اتصالًا مستقلًا
- الأنواع المشتركة في `packages/shared` — لا تكرار تعريف بين التطبيق والخادم

---
---

# الجزء الثاني — البيانات

---

# 7 · مخطط قاعدة البيانات

## 7.1 الجداول الأساسية

### `tenants`
| العمود | النوع | ملاحظات |
|---|---|---|
| id | serial PK | |
| name | varchar(128) NOT NULL | |
| contact_phone | varchar(32) | |
| subscription_plan | varchar(64) NOT NULL DEFAULT 'أساسية' | |
| subscription_status | enum NOT NULL DEFAULT 'تجريبي' | |
| subscription_expires_at | timestamptz | |
| max_houses | integer NOT NULL DEFAULT 5 | |
| feed_starter_end_day | integer NOT NULL DEFAULT 10 | |
| feed_grower_end_day | integer NOT NULL DEFAULT 24 | |
| feed_anomaly_threshold_pct | integer NOT NULL DEFAULT 30 | |
| feed_low_stock_threshold_days | integer NOT NULL DEFAULT 3 | |
| min_rest_days | integer NOT NULL DEFAULT 10 | |
| prep_protocol | jsonb | |
| default_country_code | varchar(8) NOT NULL DEFAULT '+967' | |
| timezone | varchar(64) NOT NULL | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL | |

> **و`feed_bag_weight_kg` حُذف بالقرار 201.** وزن كيس العلف **ثابت ٥٠ كجم لا إعداد** — ومصدره الوحيد `products.package_size` **مع وحدته `package_unit`** على الصنف (#161 «ثالث عشر» ٥) — **والوحدة كانت مكتوبة في اسم العمود المحذوف، فنُقلت إلى القاعدة لا إلى ذاكرة القارئ**. **وإعدادٌ يملك المالك تغييره يناقض «ثابت» من حيث المبدأ لا من حيث الاستعمال**: وجوده يُعيد التعارض الثلاثي أول مرة يُغيَّر.


### `users`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id | FK NOT NULL | **`NOT NULL` — ولا استثناء** (القرار 194). كان `NULL` لمدير المنصة، **وصار مدير المنصة في `platform_admins`** — جدولٍ بلا `tenant_id` إطلاقًا — **فلم يبقَ في `users` من لا مستأجر له**. §7-ب البند 25 |
| username | varchar(64) NULL | للعرض والسجلات |
| password_hash | varchar(255) NOT NULL | bcrypt |
| full_name | varchar(128) NOT NULL | |
| role | enum user_role NOT NULL | |
| phone | varchar(30) NOT NULL | كما أُدخل |
| phone_e164 | varchar(20) NOT NULL | المطبَّع · حقل المطابقة |
| is_active | boolean NOT NULL DEFAULT true | |
| must_change_password | boolean NOT NULL DEFAULT false | |
| expo_push_token | varchar(255) | |
| last_active_at | timestamptz | |
| created_at | timestamptz NOT NULL | |

### `sites`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id | FK | |
| name | varchar(128) NOT NULL | |
| created_at | timestamptz NOT NULL | |

الموقع الجغرافي — المستوى الأعلى في الهرم (القرار #112). الموقع الواحد قد يضم
أكثر من مزرعة. **ولا يُخلط بمستوى المخزن** (`warehouses.level`): ذاك يعني
«على أي مستوى يقع المخزن» (مركزي · موقع · عنبر)، مفهوم مخزون لا مكان جغرافي
(القراران #113 و198). **وكان الخلط أوضح حين كان `location_type` في جداول
المخزون — وقد حُذف بالقرار 199** حين صار الدفتر يعنون مخزنًا بمعرّفه.

### `farms`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id · site_id | FK | `site_id` NOT NULL |
| name | varchar(128) NOT NULL | فريد داخل الموقع لا عبر المستأجر |
| power_sources | power_source[] NOT NULL | `cardinality >= 1` — لا مزرعة بلا طاقة |
| created_at | timestamptz NOT NULL | |

**مصادر الطاقة على المزرعة لا العنبر** (القرار #112): المولّد يخدم مزرعة فيها
أكثر من عنبر. قيمتان: شمسية · مولدات.

### `houses`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id · farm_id | FK | |
| name | varchar(64) NOT NULL | |
| type | enum house_type | |
| status | enum house_status NOT NULL DEFAULT 'جاهز للإسكان' | |
| status_changed_at | timestamptz NOT NULL | |
| water_tank_capacity_l | numeric(10,2) | NULL = حقل الماء مخفي |
| created_at | timestamptz | |

### `batches`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id · house_id | FK | |
| breed | enum NOT NULL | |
| start_date | date NOT NULL | |
| initial_bird_count | integer NOT NULL | |
| status | enum NOT NULL DEFAULT 'نشطة' | |
| closed_at | timestamptz | |
| sold_bird_count | integer | **يُستبدل بمجموع الحمولات — مقرَّر ولم يُنفَّذ** (#160 «عاشرًا» ٦، والقراران 204 و208؛ §7-ب البند 51). **رقمٌ واحد يُكتب عند الإغلاق لا يُطابق ثلاث شاحنات**، **وكتابته `UPDATE` على صفّ الدفعة تتقاطع مع المبدأ الرابع** |
| market_avg_weight_g | integer | **يصير متوسطًا مرجّحًا بالعدد على الحمولات** (#160 «عاشرًا» ١٢) — **والمتوسط البسيط يساوي بين حمولة من مئة طير وأخرى من خمسة آلاف** |
| housed_before_ready | boolean NOT NULL DEFAULT false | علامة دائمة |
| housed_reason | text | |
| created_at | timestamptz | |

### `user_assignments`
id · user_id FK · house_id FK (nullable) · **farm_id FK (nullable)** · **warehouse_id FK (nullable)** · tenant_id FK · **start_date (مطلوب، بلا افتراضي)** · **end_date (nullable)** · created_at

> **صُحِّح بالقرار 247** — كان هذا القسم يصف نموذجًا **أقدم بثلاثة قرارات** (158 و190 و198): بلا مستوى المخزن، وبلا المدّة، وبفهرسين فريدين حلّ محلّهما قيدا استبعاد. **وهو مرجعٌ مُلزم يُحسم إليه التعارض، فكذبُه يوجّه من يقرؤه** (القرار 240).

**تراكمية:** مستخدم واحد لعدة عنابر في نفس المزرعة (مربي مسؤول عن عنبرين متجاورين — حالة شائعة). **والمنع تداخلٌ زمنيّ لا تكرار** ← 409.

**وثلاثة مستويات لا مستويان (القرار #128، ثم القرار 198):** المربّي يُسند **بالعنبر** (`house_id`)، والمشرف والطبيب **بالمزرعة** (`farm_id`)، **والمشرف بمخزن موقعه وأمينُ المخزن بالمركزيّ** (`warehouse_id` — القراران 247 و254). صفٌّ واحد يحمل مستوى واحدًا حتمًا: `CHECK` يجمع الثلاثة ويشترط `= 1`.

**ونوعُ المخزن يطابق دورَ المُسنَد إليه — حكمٌ ثانٍ فوق تطابق الدور بالمستوى (القرار 254):** المستوى واحد في هذا الجدول (`warehouse_id`) **وأنواعُ المخازن ثلاثة** (مركزي · موقع · عنبر)، **فالمشرف لا يُسنَد إلا مخزنَ موقع وأمينُ المخزن لا يُسنَد إلا المركزيّ** — **ومخزنُ العنبر لا يُسنَد لأحد إطلاقًا** لأن صاحبه مربّيه بإسناد عنبره (القرار 199)، **فإسنادٌ فوقه لغو**. **والمخالفة 422 `warehouse_level_not_allowed_for_role`** — **وكان الرمز `warehouse_not_site_level` حين كان مخزن الموقع وحده مقبولًا**.

**والإسناد مدّة لا حالة (القرار #158، منفَّذ بالقرار 190):** `start_date` **مطلوب بلا قيمة افتراضية** — الصفّ يحمل ما اختاره من أنشأه لا ما سكت عنه؛ و`end_date` **فارغة تعني سريانًا بلا أجل**، وحين تُضبط **فهي آخر يوم مسؤولية شاملًا**. **ولا يُحذف إسناد ولا يُعدَّل بأثر رجعي** — السحب **إنهاء مدّة**، ومساره **فعلٌ مسمًّى** (`POST .../assignments/:assignmentId/end`) لا `DELETE` (القرار 247).

**والتفرّد بثلاثة قيود استبعاد لا بفهارس فريدة:** `EXCLUDE USING gist (user_id WITH =, <المستوى> WITH =, daterange(start_date, end_date, '[]') WITH &&)` — جزئيّ لكل مستوى على حدة. **والسؤال زمنيّ لا سؤال تساوٍ**: فهرس فريد يمنع التكرار ولا يمنع مدّتين متداخلتين ببدايتين مختلفتين. **والفهرسان القديمان أُزيلا** — وكانا يقبلان تكرار الإسناد صامتًا لأن `NULL` مميّزة دائمًا (**مُثبَت على القاعدة: ثلاثة صفوف متطابقة قُبلت**).

## 7.2 السجلات الميدانية

### `daily_logs`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · uuid · tenant_id · house_id · batch_id | | |
| log_date | date NOT NULL | |
| mortality_count | integer NOT NULL | |
| mortality_cause | enum | + mortality_cause_note text |
| water_tanks | numeric(8,3) | |
| water_liters | numeric(10,2) | محسوب |
| tank_capacity_l | numeric(10,2) | السائد وقت الإدخال |
| sampled_birds | integer | |
| sampled_weight_kg | numeric(8,3) | |
| avg_weight_g | numeric(8,2) | محسوب |
| temperature_c · humidity_pct | numeric(5,2) | |
| notes · photo_urls · voice_note_url | text · text[] · text | |
| review_status | enum NOT NULL DEFAULT 'none' | |
| correction_of_id | integer FK daily_logs | |
| client_id | uuid | عطالة عند إعادة الإرسال |
| created_by · created_at | | |

### `daily_log_feed_rows`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · **tenant_id** · daily_log_id FK · product_id FK | | **`tenant_id` أُضيف بالقرار 205**، **والمفتاحان مركَّبان** `(fk, tenant_id)`. **وكان الجدول بلا عمود مستأجر فمفاتيحه مفردة** — **وأُثبت على القاعدة**: صفٌّ يستشهد بصنف مستأجرٍ آخر قُبل صامتًا |
| feed_stage | enum NOT NULL | |
| bags | numeric(8,3) NOT NULL | |
| kg | numeric(10,2) NOT NULL | محسوب |
| bag_weight_kg | numeric(6,2) NOT NULL | السائد وقت الإدخال — **لقطة مجمَّدة لا مصدرٌ ثالث، فلا تُحذف** (القرار 201): السجل الميداني لا يُعدَّل (المبدأ الرابع)، **فسجلٌّ قديم يبقى محسوبًا بما كان لا بما صار** |

جدول منفصل لأن أيام الانتقال بين المراحل تحمل نوعين معًا.

### `log_notes`
id · **tenant_id** · daily_log_id FK · author_id FK · body text NOT NULL · created_at

غير قابلة للتعديل أو الحذف · إضافتها تنقل السجل لـ `pending_review` في نفس المعاملة.

> **`tenant_id` أُضيف بالقرار 205، والمفتاحان مركَّبان.** **وأُثبت على القاعدة قبل الإصلاح**: ملاحظةٌ على سجلّ يومٍ في مزرعة مستأجرٍ **يكتبها مستخدم مستأجرٍ آخر** قُبلت صامتة — `author_id → users.id` مفردًا.

## 7.3 المخزون

### `warehouses`
id · tenant_id FK · name · is_active · created_at

مخزن افتراضي واحد لكل مستأجر يُنشأ تلقائيًا · الجدول يسمح بأكثر لاحقًا.

### `products`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id | | |
| category | enum product_category NOT NULL | |
| name | varchar(160) NOT NULL | |
| feed_stage | enum | للعلف فقط |
| is_system | boolean NOT NULL DEFAULT false | |
| stock_unit | enum stock_unit NOT NULL | |
| package_size | numeric(10,3) | **المصدر الوحيد لوزن كيس العلف** (القرار 201) — **ولا يُقرأ بمعزل عن `package_unit` أبدًا**: قراءة الرقم وحده تفترض وحدة، **والافتراض هو ما مُنع**. مُشغِّلٌ في القاعدة يملأ ٥٠ **و«كجم» معًا** لصنف علف بلا قيمة، **وقيد `products_feed_package_size_ck` يضمن الاثنين**. **والخمسون للعلف وحده** — الدواء واللقاح والمطهّر تختلف عبواتها |
| package_unit | varchar(16) | وحدة حجم العبوة — **لا تُفصَل عن `package_size`** (القرار 201). **ونصّ لا `stock_unit` عمدًا**: وحدة عبوة اللقاح قد تكون «مل» أو «جرعة» وليستا في القائمة. **وقيد `products_package_unit_ck` يمنع حجمًا بلا وحدته من أي فئة** — ولا يفرض حجمًا على أحد |
| dose_unit | varchar(16) | |
| default_dose_amount | numeric(10,3) | |
| default_dose_basis | enum | |
| default_route | enum | |
| withdrawal_days | integer | |
| storage_conditions | enum | |
| supplier_id | integer FK | **المورّد كيانًا لا نصًّا** (القرار 202) — مركَّب `(supplier_id, tenant_id)`. **وكان `supplier varchar(160)`**. **وموضعه على الصنف يُسمَّى مشكوكًا فيه ولا يُحسم**: #161 «تاسعًا» يطلب متابعة الأداء **عبر الشحنات**، وصنفٌ واحد قد يُشترى من مورّدين — **فالمورّد أقرب إلى خاصية دفعة التوريد**، على نمط الصلاحية في القرار 198. **نقلُه قرارُ نموذج** |
| notes · is_active | text · boolean NOT NULL DEFAULT true | |
| created_by · created_at | | |

### `suppliers`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id | | `UNIQUE (id, tenant_id)` — يشترطه كل مفتاح مركَّب إليه |
| name | varchar(160) NOT NULL | `UNIQUE (tenant_id, name)` — **اسمٌ واحد لمورّد واحد داخل المستأجر** |
| is_active · created_at | boolean NOT NULL DEFAULT true · timestamptz | |

**كيان يُنشأ مرة واحدة لا نصٌّ في كل صفّ** (القرار 202) — تتقاطع عليه ثلاثة قرارات: سجل المورّد (#160 السؤال الرابع) · متابعة الأداء عبر الشحنات (#161 «تاسعًا») · واستلام الأدوية منه (#157 البند ٤). **و«المورّد أو الفقاسة» و«المورّد أو المطحنة» اسمان لدورٍ واحد لا كيانان** — تسميتان لمن اشتُري منه، **لا تصنيفٌ يطلب النظامُ حفظه**. **وحقوله ما تسمّيه القرارات وحده: الاسم.**

### `carriers`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id | | `UNIQUE (id, tenant_id)` |
| name | varchar(128) NOT NULL | `UNIQUE (tenant_id, name)` |
| is_active · created_at | boolean NOT NULL DEFAULT true · timestamptz | |

**كيان لا نصّ حرّ** (القرار 202، على حكم #157 البند ٣) — **وبه يسقط تعارض تقرير الفاقد**: التجميع «حسب الناقل» على نصّ يدوي مستحيل («أبو محمد» و«ابو محمد» ناقلان) وعلى كيان ممكن. **والاستلام الأعمى لا يتأثر** — الناقل معلوم لحظة الاستلام والكمية وحدها هي المخفية. **وربطه بسجل الزيارات (#154) حدٌّ معلن: لا جدول زيارات في المخطط.**

### `inventory_movements` — الدفتر
| العمود | النوع | ملاحظات |
|---|---|---|
| id · uuid · tenant_id | | |
| warehouse_id | integer FK NOT NULL | مركَّب `(warehouse_id, tenant_id)` — **موضع الحركة مخزنٌ بمعرّفه** (القرار 199) |
| batch_id | integer FK NULL | بُعد أعمال لا عنونة موضع — يبقى |
| product_id | integer FK NOT NULL | |
| movement_type | enum NOT NULL | |
| quantity | numeric(12,3) NOT NULL | موجب وارد · سالب منصرف |
| unit | enum stock_unit NOT NULL | |
| source_type | varchar(48) NOT NULL | |
| source_uuid | uuid NOT NULL | |
| notes · created_by · created_at | | |

**والقيد القديم حُذف بالقرار 199** — كان:

```sql
-- محذوف: كان يجعل معرّف الموقع هو معرّف العنبر نفسه
CHECK ( (location_type='house' AND location_id = house_id AND house_id IS NOT NULL)
        OR (location_type='warehouse' AND house_id IS NULL AND farm_id IS NULL) )
```

**والعلّة:** مخزن العنبر صار **كيانًا في `warehouses` له معرّفه** (القرار 198)،
**فالقيد يرفض النموذج الجديد لا يستوعبه** (#161 «ثاني عشر» البند ١). ومحلّه اليوم
**مفتاح مركَّب إلى `warehouses`** — والانتماء يُفرض بمرجع لا بمطابقة أعمدة.

**و`farm_id`/`house_id` حُذفا من الدفتر** (القرار 199): **مزرعة الحركة وعنبرها
يُشتقّان من مخزنها** (`warehouses.house_id → houses.farm_id`)، **وإبقاؤهما
عمودين يعني مصدرين للحقيقة الواحدة بلا قيد يمنع تناقضهما** — والقيد الذي كان
يمنعه هو نفسه ما حُذف.

**قواعد:** لا حذف أبدًا · الرصيد يُحسب لا يُخزَّن · كل حركة مرتبطة بمصدرها.

### `shipments`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · uuid · tenant_id · farm_id · house_id · batch_id | | |
| type · product_id FK NOT NULL | | |
| sent_quantity | numeric(12,3) NOT NULL | |
| unit | enum NOT NULL | مشتق من المنتج المختار |
| sent_by · sent_at | | |
| carrier_id | integer FK | **الناقل كيانًا لا نصًّا** (القرار 202) — مركَّب `(carrier_id, tenant_id)`. **وكان `carrier_name varchar(128)`**، **والتجميع عليه في تقرير الفاقد مستحيل** (#157 البند ٣) |
| vehicle_number | varchar(32) | **يبقى على الشحنة ولا ينتقل إلى الناقل** (القرار 202) — **صفة واقعة لا صفة كيان**: الناقل الواحد يبدّل شاحنته، ووضعها على الكيان **يُعيد كتابة الماضي** عند أول تبديل. نفس نمط «السائد وقت الإدخال» |
| handover_code | varchar(8) NOT NULL | 4 أرقام |
| notes_sender | text | |
| counted_quantity | numeric(12,3) | |
| received_by · received_at | | |
| variance | numeric(12,3) | محسوب |
| status | enum NOT NULL DEFAULT 'معلّقة' | |
| variance_status · notes_receiver | enum · text | |
| signature_url · photo_urls | | |
| dispute_status · dispute_outcome · dispute_reason | | |
| dispute_closed_by · dispute_closed_at | | |
| bypass_code_used | boolean NOT NULL DEFAULT false | |
| correction_of_uuid | uuid | |

### `farmer_requests`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id | | `UNIQUE (id, tenant_id)` — يشترطه المفتاح المركَّب من `inventory_transfers` |
| house_id · product_id | integer FK NOT NULL | مركَّبان مع `tenant_id` — **«لأي عنبر» و«أي صنف» بلفظ الحكم** |
| quantity · unit | numeric(12,3) NOT NULL · enum stock_unit NOT NULL | `CHECK (quantity > 0)`. **والوحدة لم يسمّها الحكم وتُضاف**: «كم» بلا وحدة لا يُلبّى (القرار 201) |
| requested_by | integer FK NOT NULL | **من طلب** |
| created_at | timestamptz NOT NULL | **متى — وهو ما يُقاس منه التصعيد**، فلا عمود آخر يلزم له |
| status | enum farmer_request_status NOT NULL DEFAULT 'مرفوع' | **مرفوع · ملبّى — قيمتان لا ثلاث**، ولا رفض (§7-ب البند 61) |
| fulfilled_at | timestamptz | `CHECK ((status = 'ملبّى') = (fulfilled_at IS NOT NULL))` |

**الطلب ليس ملاحظة** (القرار 211، على #160 و#161 «خامسًا») — **وقبله لا جدول طلبات في المخطط إطلاقًا، و`log_notes` للسجل اليومي وحده**. **والعلّة في الحكم:** «تأخر العلف يعني توقف نمو، **وهي خسارة لا تظهر في أي تقرير آخر**».

**ويُلبّى بتحويل يشير إليه: `inventory_transfers.request_id`** — **المرجع على التحويل لا على الطلب**، فالأمر يصدر **من** الطلب فيعرف مصدره، **وطلبٌ واحد قد يحمله أكثر من تحويل بلا جدول وسيط**. **فالشكل لا يقرّر التلبية الجزئية ولا يمنعها.**

**وجوهره مجمَّد منذ الرفع** (`farmer_request_freeze_guard`، المبدأ الرابع): **الحالة ووقتها وحدهما يتغيّران**، **ولا يُحذف إطلاقًا** — حذفُ طلبٍ لم يُلبَّ **يمحو الدليل الذي كُتب الحكم لحفظه**.

### `external_issue_orders`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · uuid · tenant_id | | `UNIQUE (id, tenant_id)` · **و`UNIQUE (uuid)`**: الدفتر يشير إلى الأمر بـ`uuid` فتفرّده شرطُ صحّة الحارس |
| warehouse_id · product_id | integer FK NOT NULL | مركَّبان مع `tenant_id`. **ولا يُقصر النوع على المركزي في المخطط — ما يقيّده من يأمر لا الجدول** |
| quantity · unit | numeric(12,3) NOT NULL · enum stock_unit NOT NULL | `CHECK (quantity > 0)` — الأمر يطلب إخراج كمية، **والحركة هي التي تُنقص** |
| reason · reason_note | enum external_issue_reason NOT NULL · text | «أخرى» **بنصّ ملزم بقيد** — «أخرى» بلا نصّ سببٌ لا يسمّي شيئًا |
| beneficiary | varchar(160) NOT NULL | **نصّ حرّ لا كيان** (القرار 203) — **على معيار 202 نفسه**: لا تقرير يجمّع على الجهة المستفيدة، **والنصّ يصير كيانًا حين يُجمَّع عليه لا حين يُذكر** |
| status | enum external_issue_status NOT NULL DEFAULT 'معلّق' | `CHECK ((status = 'معلّق') = (decided_by IS NULL))` |
| initiated_by · initiated_at | integer FK NOT NULL · timestamptz NOT NULL | **من بدأ الأمر** |
| decided_by · decided_at | integer FK · timestamptz | **من صادق أو رفض ومتى**، والحالة تقول أيّهما. `CHECK ((decided_at IS NULL) = (decided_by IS NULL))` |
| correction_of_uuid | uuid | **الأمر المصادَق عليه لا يُعدَّل** (المبدأ الرابع) — التصحيح بأمر مضاد والأصل يبقى ظاهرًا. **نفس نمط `shipments.correction_of_uuid`** |
| created_at | timestamptz NOT NULL | |

**`CHECK (decided_by IS NULL OR decided_by <> initiated_by)` — من بدأ الأمر لا يصادق عليه** (المبدأ #155). **وهو أقوى من «دورين مختلفين»: الدورُ يتغيّر والشخصُ هو من وقّع** — من بدأ الأمر أمينًا للمخزن ثم صار مالكًا يصادق على أمر نفسه بلا مخالفة واحدة، **والقيد على الشخص لا يُخترق بترقية**.

**ولا سعر ولا قيمة ولا أي عمود مالي — القرار #136**، ومكتوبٌ بلفظه كي لا يُضاف عمود سعر لاحقًا «إتمامًا»: «تُسجَّل حركة خروجها **عددًا فقط، بلا سعر ولا قيمة**» (#161 «عاشرًا»).

### `stocktakes` · `stocktake_items` · `wastage` · `inventory_transfers`

- **stocktakes:** id · uuid · tenant_id · **warehouse_id** · opened_by · opened_at · closed_by · closed_at · approved_by · approved_at · is_opening boolean
- **stocktake_items:** id · stocktake_id FK · product_id FK · counted_qty · book_qty · variance · reason text
- **wastage:** id · uuid · tenant_id · **warehouse_id** · product_id · quantity · unit · reason enum NOT NULL · notes · photo_url · created_by · created_at
- **transfers:** id · uuid · tenant_id · **from_warehouse_id** · **to_warehouse_id** (وقيد `from <> to`) · product_id · quantity · unit · reason · created_by · created_at · confirmed_by · confirmed_at

## 7.4 الصحة

- **health_tasks:** id · uuid · tenant_id · house_id · batch_id · product_id FK · dose_amount · dose_unit · dose_basis · route · scheduled_date · priority enum · notes_vet · status enum · created_by(vet) · created_at
- **health_task_executions:** id · **tenant_id** · task_id FK · executed_at · quantity_used · notes · photo_url · executed_by FK · failed boolean · failure_reason — **`tenant_id` والمفتاحان المركَّبان بالقرار 205**
- **health_observations:** id · uuid · tenant_id · house_id · batch_id · symptoms text[] NOT NULL · severity enum NOT NULL · affected_estimate · photo_urls · notes · status enum NOT NULL DEFAULT 'جديد' · vet_response · responded_by · responded_at · created_by · created_at
- **batch_diagnoses:** id · **tenant_id** · batch_id FK · observation_id FK NULL · diagnosis · treatment_plan · created_by(vet) FK · created_at — **`tenant_id` والمفاتيح الثلاثة المركَّبة بالقرار 205**

> **والقرار 205 أضاف كذلك `UNIQUE (id, tenant_id)` إلى `health_tasks` و`health_observations`** — **ولم يكونا موجودين**، و Postgres يرفض المفتاح المركَّب بلا مرجعٍ فريد مطابق ولو كان `id` مفتاحًا أساسيًّا. **فغيابهما كان يمنع الإصلاح لا يؤجّله.**

## 7.5 دورة العنبر

- **house_prep_cycles:** id · house_id FK · started_at · completed_at · rest_started_at
- **house_prep_steps:** id · cycle_id FK · step_key · label · is_required boolean · completed_at · completed_by · notes · photo_url · product_id FK NULL · quantity_used
- **house_status_history:** id · house_id FK · from_status · to_status · changed_by · changed_at · reason

## 7.6 المعايير

### `breed_standards`
| العمود | النوع | ملاحظات |
|---|---|---|
| id · tenant_id | NULL | NULL = عالمي · قيمة = تجاوز المستأجر |
| breed | enum NOT NULL | |
| day | integer NOT NULL | إلزامي |
| target_weight_g | integer NOT NULL | |
| cumulative_mortality_pct | numeric(5,2) NOT NULL | |
| target_fcr | numeric(5,3) NOT NULL | |
| daily_feed_g_per_bird | numeric(8,2) | |
| chick_weight_g | numeric(6,2) | |
| — | UNIQUE (tenant_id, breed, day) | |

كل مقارنة بالمعيار بلا معنى ما لم يُعبَّأ هذا الجدول من اليوم 1 إلى 45 للسلالات الثلاث.

## 7.7 الإشعارات والتدقيق

### `notifications`
id · uuid · tenant_id · user_id FK · type · urgency enum NOT NULL · title · body · entity_type · entity_id · deep_link · is_read · read_at · escalated_from_id FK notifications · push_scheduled_for timestamptz · created_at

**ثلاثة سجلات تدقيق منفصلة:**

| الجدول | النطاق |
|---|---|
| `entity_audit_log` | عمليات المالك التشغيلية |
| `settings_audit_log` | تغييرات الإعدادات |
| `admin_audit_log` | مدير المنصة حصريًا |

---

# 8 · أنواع Enum

| النوع | القيم |
|---|---|
| `user_role` | farmer · supervisor · vet · owner · platform_admin |
| `batch_status` | نشطة · منتهية |
| `breed` | Ross 308 · Cobb 500 · Arbor Acres |
| `house_status` | مشغول · تحت الإخلاء · تحت التنظيف والتطهير · في فترة الراحة · جاهز للإسكان · تحت الصيانة · معطّل |
| `house_type` | مفتوح · مغلق · هجين |
| `mortality_cause` | مرض تنفسي · إجهاد حراري · مشاكل مياه/علف · حادث · غير معروف · أخرى |
| `review_status` | none · pending_review · reviewed · correction_submitted |
| `feed_stage` | بادئ · نامي · ناهي |
| `product_category` | علف · دواء · لقاح · فيتامين · مستلزمات |
| `stock_unit` | عبوة · زجاجة · كيس · لتر · كجم · قطعة |
| `dose_basis` | لكل لتر ماء · لكل كجم وزن حي · لكل طير · لكل 1000 طير |
| `route` | مع الماء · مع العلف · حقن · رش · تقطير بالعين · فموي · أخرى |
| `inventory_movement_type` | استلام · شحن صادر · شحن وارد · مرتجع صادر · مرتجع وارد · تحويل صادر · تحويل وارد · استهلاك يومي · تنفيذ علاج · استهلاك تجهيز · تسوية جرد · هالك/تلف · **صرف خارجي** (القرار 203) · **تفريغ كيس** (القرار 212) |
| `external_issue_status` | معلّق · مصادَق · مرفوض |
| `external_issue_reason` | بيع · أخرى (**بنصّ ملزم**) |
| `empty_bag_condition` | صالح · تالف — **لا غير** (القرار 212، #161 «عاشرًا») |
| `shipment_status` | معلّقة · مستلمة · ملغاة |
| `shipment_variance_status` | مطابق · فرق مسجّل · قيد النزاع |
| `dispute_outcome` | خطأ قياس · فاقد نقل · فاقد بعد التسليم |
| `wastage_reason` | انتهاء صلاحية · تلف بالرطوبة · كسر · **تالف بسبب النقل** · **سوء تخزين** · تلوث · أخرى — **مقرَّر بالقرار 207 ولم يُنفَّذ بعد** (§7-ب البند 56): «انقطاع تبريد» يُستبدل بالسببين، **فهي واقعةٌ يعجز النظام عن كشفها ولا يملك ما يُنسب إليه** (`warehouses` بلا ظروف تخزين، #157 البند ٥)، **والبديلان تصريحٌ من المسجِّل عن حالةٍ رآها** — تمييز القرار 203 في حقل السبب |
| `health_task_status` | معلقة · منفّذة · متأخرة · متعذّرة · ملغاة |
| `health_observation_severity` | خفيف · متوسط · شديد |
| `notification_urgency` | urgent · action · info |
| `subscription_status` | تجريبي · نشط · موقوف · منتهي |

> **قاعدة:** كل قيمة enum يجب أن يكتبها مسار API فعلي — والفاحص الآلي يتحقق.

---

# 9 · الفهارس والقيود

```sql
UNIQUE (tenant_id, phone_e164)

-- يشمل المعطّلين
CREATE UNIQUE INDEX users_platform_phone_unique
  ON users (phone_e164) WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX daily_logs_batch_date_uq
  ON daily_logs (batch_id, log_date) WHERE correction_of_id IS NULL;

UNIQUE (user_id, house_id)
UNIQUE (farm_id, name)
UNIQUE (tenant_id, name)      -- sites
UNIQUE (site_id, name)        -- farms
UNIQUE (tenant_id, breed, day)

CREATE UNIQUE INDEX products_system_feed_uq
  ON products (tenant_id, feed_stage) WHERE is_system = true AND category='علف';

-- أداء
INDEX (warehouse_id, product_id)   -- inventory_movements
INDEX (tenant_id, house_id, log_date)
INDEX (tenant_id, status)      -- shipments
INDEX (user_id, is_read)       -- notifications
```

الحماية المنطقية في الخادم لا تكفي — طلبان متزامنان يتجاوزانها. الفهرس هو الحل، والخادم يحوّل `23505` إلى رسالة مفهومة مقيَّدة باسم القيد.

---

# 10 · الترحيلات

- Drizzle Kit حصريًا · ملفات مرقّمة + journal
- تُطبَّق كخطوة نشر صريحة — لا عند إقلاع الخادم
- `drizzle push` محذوف من كل السكربتات
- لا backfill تلقائي — أي تعديل بيانات مرة واحدة يدويًا ومسجّل
- الترحيل الأول: لقطة المخطط · الثاني: بذر معايير السلالات بحارس `NOT EXISTS`

---
---

# الجزء الثالث — المنطق

---

# 11 · المصادقة

**معرّف الدخول: رقم الجوال.** التطبيع إلزامي قبل الحفظ وكل مقارنة:

1. تحويل إلى E.164
2. حذف المسافات والشرطات والأقواس
3. تحويل الأرقام العربية-الهندية (٩-٠) إلى لاتينية
4. توحيد الصيغ (`967` · `967+` · `00967` · الصفر البادئ)

**قواعد:**
- لا كلمة مرور كنص عادي في القاعدة أو السجلات · bcrypt
- تجديد تلقائي عند 401 · JWT في expo-secure-store
- 5 محاولات ثم تأخير 60 ثانية · رسالة رفض عامة
- مدير المنصة: مسار منفصل · كلمة مرور 12 محرفًا · 3 محاولات · لا واجهة لإنشائه
- `must_change_password` عند الإنشاء بكلمة مؤقتة
- المستخدم لا يغيّر رقمه — المشرف أو المالك فقط مع audit

---

# 12 · الصلاحيات

## 12.1 الآلية

```
requireAuth        → التحقق من JWT وتحميل req.user
requireTenant       → tenant_id من JWT حصريًا → استدعاء enforceEntityAccess
enforceEntityAccess → مسح params+query+body عن:
                      farmId · houseId · fromHouseId · toHouseId · batchId
                    → تطبيق قواعد الإسناد → batchId يُحل لعنبره
```

المعرّفات المشتقة تُجلب بدوال مفحوصة تفرض الوصول قبل الإرجاع:
`getShipmentChecked` · `getDailyLogChecked` · `getHealthTaskChecked` · `getStocktakeChecked` · `getWastageChecked`

لا تجلب كيانًا بـ `select` خام ثم تستخدم `house_id` المشتق منه — هذا النمط أنتج ثلاث ثغرات سابقًا.

## 12.2 المصفوفة

| العملية | farmer | supervisor | vet | owner | storekeeper | platform |
|---|---|---|---|---|---|---|
| إنشاء سجل يومي | ✅ عنابره | ❌ | ❌ | ❌ | ❌ | ❌ |
| تعديل سجل محفوظ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إضافة ملاحظة مراجعة | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| تأكيد وإنشاء تصحيح | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| تصحيح دون ملاحظة | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إنشاء شحنة | ❌ | ✅ علف+مستلزمات | ✅ أدوية+لقاحات | ✅ الكل | ❌ | ❌ |
| تأكيد الاستلام | ✅ عنابره | ❌ | ❌ | ❌ | ❌ | ❌ |
| **رفع طلب** | **✅ عنابره** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **تسجيل استهلاك كيس (تفريغه)** | **✅ عنبره** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **تسجيل كيس فارغ تالفًا** | **✅ عنبره** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **اعتماد خروج الأكياس من مخزن العنبر** | ❌ | **✅ عنابر مزارعه** | ❌ | ❌ | ❌ | ❌ |
| **تلبية طلب — إصدار أمر صرف منه** | ❌ | **✅ عنابر مزارعه** | ❌ | ❌ | ❌ | ❌ |
| فتح نزاع | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| حسم نزاع | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| تحويل | ❌ | ✅ بفئته | ✅ بفئته | ✅ | ✅ المركزي (تنفيذًا لا أمرًا) | ❌ |
| **تسجيل هالك — مخزن العنبر** | **✅ عنبره** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **تسجيل هالك — مخزن الموقع** | ❌ | **✅ مخزن موقعه** | ❌ | ❌ | ❌ | ❌ |
| **تسجيل هالك — المخزن المركزي** | ❌ | ❌ | ❌ | ❌ | **✅ المركزي** | ❌ |
| **المصادقة على الهالك** | ❌ | **✅ عنابر مزارعه** | ❌ | **✅ المركزي ومخازن المواقع** | ❌ | ❌ |
| جرد افتتاحي — إدخال الرصيد | ✅ عنبره | ✅ مخزن موقعه | ❌ | ❌ | ✅ المركزي | ❌ |
| **الجرد الدوري — المخزن المركزي** | ❌ | ❌ | ❌ | ❌ | **✅ يجرد** | ❌ |
| **الجرد الدوري — مخزن الموقع** | ❌ | **✅ يجرد، عند نهاية الدفعة** | ❌ | ❌ | ❌ | ❌ |
| **المصادقة على الجرد الدوري** | ❌ | ❌ | ❌ | **✅ المستويان** | ❌ | ❌ |
| **صرف الأدوية واللقاحات لعنبر** | ❌ | ❌ | **✅ يأمر أو يوافق** | ❌ | **✅ ينفّذ بموافقة الطبيب** | ❌ |
| ~~استلام من مورّد~~ **[منسوخٌ بالقرار 233]** | ❌ | ~~✅ علف+مستلزمات~~ **❌** | ~~✅ أدوية+لقاحات~~ **❌** | ✅ الكل | ✅ **المركزي حصرًا** | ❌ |
| **إرسال أمر صرف خارجي** | ❌ | ❌ | ❌ | ✅ المركزي | ✅ المركزي | ❌ |
| **المصادقة على أمر صرف خارجي** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| مصادقة الرصيد الافتتاحي | ❌ | ✅ عنابر مزارعه | ❌ | ✅ المركزي ومخازن المواقع | ❌ | ❌ |
| إنشاء منتج | ❌ | ✅ مستلزمات | ✅ دواء+لقاح+فيتامين | ❌ | ❌ | ❌ |
| إنشاء مهمة صحية | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| تنفيذ مهمة صحية | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| رفع بلاغ صحي | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إصدار تصريح زيارة | ❌ | ✅ فنيون·صيانة·توريد·خدمات | ✅ بيطري·تطعيم | ✅ الكل | ❌ | ❌ |
| تسجيل دخول فعلي | ؟ | ؟ | ؟ | ؟ | ❌ | ❌ |
| رفع بلاغ أمني — دخول غير مصرّح | ✅ مزرعته | ؟ | ؟ | ؟ | ❌ | ❌ |
| قراءة البلاغ الأمني | ؟ | ✅ مزارعه | ✅ مزارعه | ✅ | ❌ | ❌ |
| الرد والتشخيص | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| إنشاء دفعة | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| إدخال شحنة كتاكيت | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| المصادقة على الشحنة وتوزيعها | ❌ | ✅ مزارعه | ❌ | ❌ | ❌ | ❌ |
| تأكيد استلام حصة الكتاكيت | ✅ عنابره | ❌ | ❌ | ❌ | ❌ | ❌ |
| أمر صرف طيور | ❌ | ✅ ضمن حصته | ❌ | ✅ الكل | ❌ | ❌ |
| تسجيل مذبوح لاستهلاك المربين | ✅ ضمن حصته | ❌ | ❌ | ✅ يعتمد الحصة | ❌ | ❌ |
| تصريح تسويق | ❌ | ❌ | ❌ | ✅ وحده | ❌ | ❌ |
| **مطابقة حمولة التسويق عند التحميل** | **✅ عنبره** | ❌ | ❌ | ❌ | ❌ | ❌ |
| تصفية دفعة | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| إعادة فتح دفعة | ❌ | ❌ | ❌ | ✅ بسبب | ❌ | ❌ |
| إنشاء/تعديل موقع | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| إنشاء/تعديل مزرعة | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| إنشاء/تعديل عنبر | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **قراءة بيانات عنبر** | ✅ عنابره | ✅ مزارعه | ✅ مزارعه | ✅ | ❌ | ❌ |
| تغيير حالة عنبر | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| خطوة تجهيز | ✅ المسندة | ✅ | ❌ | ✅ | ❌ | ❌ |
| اعتماد خطوة تجهيز | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| تعديل مدة الراحة | ❌ | ✅ تمديدًا (مزرعته ودوراتها) | ✅ تمديدًا · وتقصيرًا بسبب مكتوب | ✅ السياسة · وتقصيرًا بسبب مكتوب | ❌ | ❌ |
| إدارة المستخدمين | ❌ | ✅ **مرّبين فقط — إنشاءً وتعطيلًا وإسنادًا، في مزارعه المُسندة** | ❌ | ✅ | ❌ | ❌ |
| **إسناد مخزن موقع لمشرف** | ❌ | ❌ | ❌ | **✅** | ❌ | ❌ |
| **إسناد المخزن المركزي لأمين مخزن** | ❌ | ❌ | ❌ | **✅ وحده** | ❌ | ❌ |
| التقارير التحليلية | ❌ | ❌ | ✅ صحية فقط | ✅ | ❌ | ❌ |
| الإعدادات | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| إدارة المستأجرين | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| بيانات المستأجرين التشغيلية | — | — | — | — | ❌ | ❌ |

> **وعمود `storekeeper` أُضيف بالقرار 198** حين أُضيف الدور فعلًا إلى `USER_ROLE` — **وكان الجدول بلا عمود له لأن الدور لم يوجد** (#161 «ثاني عشر»). **وخاناته ❌ في كل صفّ إلا ثلاثة**: **استلام من مورّد** (صفّ جديد — #157 البند ٤) · **إدخال الرصيد الافتتاحي للمركزي** (#161 «ثامنًا») · **والجرد الدوري تنفيذًا لا أمرًا**. **فهو أمين حفظ لا آمر صرف** (#161 «ثالث عشر» البند ٢): يستلم وينفّذ ويجرد ويطلب، **والأمر بالصرف من المركزي للمالك وحده ومن مخزن الموقع للمشرف**. **ولا يصادق على ما أدخله** — فخانة «مصادقة الرصيد الافتتاحي» ❌ له، والمالك يصادق على المركزي (المبدأ #155). **ولا يرى نفوقًا ولا أوزانًا ولا تقارير إنتاجية** (#161 «سابعًا»)، فكل صفوف السجل اليومي والدفعات والتقارير ❌.
>
> **وصفّ «إدارة المستخدمين» صُحِّح بالقرار 251 — حسمًا لنقصٍ بين §17 و§12.2:** كانت §17 تضع كتلة المستخدمين كلها تحت `(owner)` بينما §12.2 تعطي المشرف «مرّبين فقط» **بلا بيان أيشمل الإسناد**. **والحكم: يشمله.** **وعلّتاه:** **(١) محكومٌ سلفًا** — القرار #158 ينصّ أن **الإسناد البديل بيد المشرف أو المالك**، فحرمانُه منه **نقضٌ لحكمٍ قائم**. **(٢) وميدانيّ** — المشرف **يعرف أيّ مربٍّ في أيّ عنبر اليوم، ومن غاب ومن يحلّ محلّه**، **ولو احتاج كلُّ تبديلٍ يوميّ إلى المالك لتعطّل التسجيل حتى يردّ**. **وحدودُه ثلاثة لا رابع:** الهدف **مربٍّ لا غير** · والكيان **في مزارعه المُسندة** · **ومخزن الموقع خارج ذلك كلّه** — المالك وحده يُسنده، **ولا يمتدّ إليه حدُّ «المرّبين فقط»**. **فكتلةُ المستخدمين في §17 ليست كلها تحت المالك.**
>
> **وصفّ «إسناد مخزن موقع لمشرف» أُضيف بالقرار 247 — حكمُ مالكٍ نصًّا:** **المالك وحده يُسند مخزن الموقع لمشرفه، لا يُسنده المشرف لنفسه ولا لغيره.** **وعلّته:** مخزن الموقع **رصيدٌ لا مزرعة** — **ومشرفٌ يُسند نفسه أو زميله إلى مخزن يفتح بابًا على رصيد لم يأتمنه عليه أحد**. **والمالك يملك المركزيّ أصلًا** (#161). **وحدّ «المشرف يدير المرّبين فقط» يبقى ولا يمتدّ إلى المخازن.**
>
> **وصفّ «إسناد المخزن المركزي لأمين مخزن» أُضيف بالقرار 254 — حكمُ مالكٍ نصًّا:** **الإسناد مخزنٌ بعينه — لا عدةُ مخازن ولا الشركةُ كلها.** **وعلّته أن المخزن رصيد**، **ونطاقُ من يمسّه يجب أن يُسمّى واحدًا واحدًا لا أن يُمنح جملةً**. **ومن أراد أمينًا على مخزنين أسنده مرتين** — **فيبقى كلُّ إسناد قابلًا للسحب وحده، ومعلومًا متى بدأ ومتى انتهى**. **ويوافق قيدَ المستوى الواحد القائم ولا يستحدث مستوًى جديدًا.** **والإسناد بيد المالك وحده — كمخزن الموقع وللعلّة نفسها: رصيدٌ لا مزرعة.** **وهذا حسمُ #161 «حادي عشر»** الذي كان يسأل عن صيغة الإسناد.
>
> **ونطاقُه بلفظ المالك:** **يرى مخزنه والحركات الصادرة منه والواردة إليه فقط.** **ولا يرى أرصدة العنابر ولا بيانات الدفعات ولا المزارع ولا المواقع** (#161 «سابعًا»). **وأمّا خانةُ «استلام من مورّد» فكانت مكتوبةً منذ 198 ولا تُبلَغ**: كان الدور **خارج قائمتَي `entityScope` معًا** فيردّه الفرضُ المركزي عن كل مسار — **وهو الحدُّ المعلن في القرار 227**، **ورُفع بإدراجه في `ASSIGNMENT_SCOPED_ROLES`**.
>
> **وصفّا الصرف الخارجي أُضيفا بالقرار 203، وخاناتهما متناظرة عمدًا:** المالك وأمين المخزن **كلاهما يرسل وكلاهما يصادق** — **لأن الحكم اتجاهان متناظران لا اتجاه واحد**، والطرفان لا بد منهما في الاثنين. **ومن بدأ الأمر لا يصادق عليه** — قيدٌ في القاعدة على **الشخص** (`decided_by <> initiated_by`) لا على الدور. **وأثره معلن ومقصود: أمر المالك نفسه لا يُخرج شيئًا بلا توقيع أمين المخزن** — وهو تقييدٌ للمالك يقبله الحكم صراحةً، **ولا يناقض «الآمر بالصرف من المركزي هو المالك»** (#161 «ثالث عشر» ٢): المالك يبقى الآمر، **والأمر وحده لا يُخرج**. **وأيُّ الدورين يملأ أيّ خانة في أي حالة فرضُ صلاحية يُبنى مع المسارات** — والمخطط لا يفرّق بينهما.

> **وصفّا التجهيز أُضيفا بالقرار 197 على حكم #153.** **«اعتماد خطوة تجهيز» منفصل عن «خطوة تجهيز»** لأن **المنفّذ يعلّم والمشرف يعتمد** — **وتعليم غيره عنه يجعل الأثر كذبًا**؛ والفصل مفروض في القاعدة لا في الوصف: `approved_by <> completed_by` قيدُ `CHECK`، قياسًا على #155 «من يُدخل رصيدًا لا يصادق عليه». **و«تعديل مدة الراحة» يقرأ القاعدة الحاكمة: التمديد سهل والتقصير صعب.** المشرف يرفع مدة مزرعته ودوراته **صعودًا فقط**؛ **والنزول عن أرضية السياسة للطبيب أو المالك وبسبب مكتوب** — ولو تساوى الاتجاهان **قصّرت الراحة عند أول ضغط تشغيلي، والخسارة تظهر بعد دفعتين فلا تُربط بسببها**. **وللطبيب فوق ذلك إلزام مدة أطول بعد دفعة مرضت** (#153). **وتحت الجميع حدّ أدنى مطلق ثلاثة أيام مفروض بقيد في القاعدة لا بإعداد.**
>
> **صف «قراءة بيانات عنبر» أُضيف بالقرار #126.** كانت المصفوفة تقيّد الأفعال (إنشاء سجل، تنفيذ مهمة) وتسكت عن القراءة — **والسكوت لم يكن قرارًا**، بل ثغرة قُرئت كإباحة. مربٍّ يفتح بيانات عنبر غير مُسند له اطّلاع على ما ليس له سواء كتب فيه أم لا، فالإسناد يقيّد القراءة كما يقيّد الكتابة.
>
> **والسرد مفلتر بالإسناد أيضًا (القرار #129):** `GET /farms/:farmId/houses` يُرجع للمربّي عنابره المُسندة وحدها، وللمشرف والطبيب عنابر مزارعهم المُسندة إليهم. **وما لا يخصّ المستخدم غائب من الرد لا معروضًا مُعطَّلًا** — «العنبر الشمالي» وحده يكشف بنية مزرعة ليست من اختصاصه. ومزرعة لا يبلغها إسناده تُرفض بـ**403 لا بقائمة فارغة**.
>
> **ومفروض فعلًا (القرار #128):** المربّي بإسناد العنبر، والمشرف والطبيب بإسناد المزرعة — صفٌّ واحد بـ`farm_id` يفتح كل عنابرها ولا يفتح ما خارجها. **مُثبَت بمخالفات متعمَّدة** لا بالوصف. والعزل بين المستأجرين يفرضه فلتر `tenant_id` والمفتاح المركَّب، مستقلًّا عن هذا كله.
>
> الصف الأخير مقصود: مدير المنصة يدير الاشتراكات ولا يرى بيانات المزارع التشغيلية (سجلات، مخزون) لأي مستأجر — فصل خصوصية صريح.
>
> **وصفوف الأمن الوقائي الأربعة أُضيفت بالقرار #154** (إصدار تصريح زيارة · تسجيل دخول فعلي · رفع بلاغ أمني · قراءة البلاغ الأمني)، **وأُعيدت تسمية صفّ «رفع بلاغ» إلى «رفع بلاغ صحي»** تمييزًا له عن البلاغ الأمني — فهما نوعان مختلفان لا صفّ واحد: الصحي يخصّ دفعة ولـه مسار حسم (رد الطبيب)، والأمني يخصّ مزرعة **ولا يتحوّل إلى تصريح أبدًا**.
>
> **و`؟` تعني «غير محسوم» لا «مباح» ولا «ممنوع».** الفرق مقصود ومكتوب هنا كي لا يُقرأ فراغ المصفوفة إباحةً — **وهو بالضبط ما وقع في صفّ «قراءة بيانات عنبر» قبل القرار #126**: سكتت المصفوفة عن القراءة فقُرئ السكوت إذنًا. **الفاعل في «تسجيل دخول فعلي» هو السؤال المفتوح الأول في القرار #154**، وبقية علامات الاستفهام تنتظر حسمه معه. **ولا يُبنى صفّ موسوم `؟` قبل أن يُحسم.**
>
> **و«رفع بلاغ أمني: ✅ مزرعته» على المزرعة لا على العنبر** — والقرار #129 يبقى قائمًا بلا استثناء: المربّي لا يرى أسماء العنابر غير المُسندة له **ولا لغرض البلاغ**، والمشرف هو من يربط البلاغ بالعنبر عند المعالجة (القرار #154).
>
> **وصفوف حركة الطيور السبعة أُضيفت بالقرار #160.** **وصفّ «إنشاء دفعة» يبقى كما هو ولا يُخوَّل المربّي الإنشاء** — القرار يفصل فعلين: **المشرف أو المالك يُنشئ سجل الدفعة عند التوزيع فتكون «قيد الوصول»، وتأكيد المربّي هو ما يبدأها فتصير «نشطة»**. فالمربّي لا يُنشئ دفعة **لكنه هو من يبدأها**، وصفّ «تأكيد استلام حصة الكتاكيت» هو موضع ذلك في المصفوفة.
>
> **و«أمر صرف طيور: ✅ ضمن حصته» للمشرف** — حصة دورية يحددها المالك، **وما تجاوزها يحتاج موافقة المالك قبل التنفيذ**، **وكل أمر يصدره المشرف يصل المالك حال إصداره** (القرار #160 «رابعًا»). **والمستفيد بالاسم حقل إلزامي بلا استثناء.**
>
> **وصفّ «تسجيل مذبوح»:** المربّي يسجّل **ضمن حصة يعتمدها المالك مسبقًا بلا استئذان**، **والموافقة على تجاوز الحصة للمالك** (محسوم — القرار #160).
>
> **و«المصادقة على الشحنة وتوزيعها: ❌ للمالك» منعٌ صريح لا سكوت** — **المالك هو من يُدخل الشحنة، فمصادقته عليها مصادقة على نفسه، وهو نقض للمبدأ #155** («من يُدخل رصيدًا لا يصادق عليه»). **المشرف وحده يصادق ويوزّع.**
>
> **وصفّ الجرد فُصل بالقرار #161: «جرد افتتاحي» ليس «جردًا دوريًّا».** المربّي **يُدخل الرصيد الافتتاحي لعنبره ولا يملك الجرد الدوري** — والفصل لازم لأن الافتتاحي **يخلق الرصيد من العدم** والدوري **يسوّي رصيدًا قائمًا** (القراران #155 و#157 البند ٢). **ولذلك صفّ «مصادقة الرصيد الافتتاحي» منفصل عن صفّ إدخاله: من يُدخل رصيدًا لا يصادق عليه.**
>
> **وصفوف الأكياس الفارغة الثلاثة أُضيفت بالقرار 212** (#161 «عاشرًا»): **المربّي يسجّل الاستهلاك والتالف، والمشرف يعتمد خروج الأكياس**. **وتسجيل التالف يجب أن يكون سهلًا ومباشرًا** — **وإلا أبلغ المربون أرقامًا متوازنة بدل الحقيقة وضاعت قيمة المعادلة**. **والتالف يبقى في رصيد الفارغ ولا يخرج منه، ولا يُسجَّل هالكًا** (حارسٌ في القاعدة). **واعتماد المشرف يوافق مصادِقي 207 و209 ولا يخالفهما: صاحب المستوى الأعلى يصادق، ومخزن العنبر مصادِقه المشرف.** **وبيع الأكياس حالةٌ من القرار 203 لا آلية جديدة** — أمر صرف خارجي سببه «بيع»، **عددًا فقط بلا سعر ولا قيمة** (#136).

> **وصفّا الطلب أُضيفا بالقرار 211** (#160 و#161 «خامسًا»): **المربّي يرفع الطلب لعنبره، والمشرف يلبّيه بإصدار أمر صرف منه** — **والطلب ليس ملاحظة**. **ولا صفّ لرفضٍ: الحكم يسمّي «لم يُلبَّ» ولا يسمّي رفضًا**، **والتصعيد يقوم على الصمت** — **وقيمةُ رفضٍ تجعله بابًا لإسكات الطلب**، وهي قرار مالك (§7-ب البند 61). **والطلب غير الملبَّى بندٌ سادس على تصعيد §16 الساعي لا آلية جديدة** — **وعتبته قرار مالك، والمقترح المعلَّق ٢٤ ساعة**.

> **وصفوف الهالك الأربعة أُضيفت بالقرار 209، وفُصل معها الصفّ المجمَّع القديم** («جرد دوري · تحويل · هالك») **فصار «تحويل» وحده**. **والعلّة أن الصفّ كان يناقض صفوف الجرد التي أضافها القرار 207**: للجرد الدوري حكمان في مصفوفة واحدة — **وهو عين ما حذّر منه القرار 200 ووقع بعده بدفعتين**. **والدرس: من يضيف صفًّا يقرأ ما يكتب ولا يقرأ ما يُبطله ما كتب.**
>
> **والقاعدة: المُخرِج يسجّل وصاحب المستوى الأعلى يصادق** — **وهي قاعدة الجرد في 207 بعينها لا شبيهةٌ بها**، فلا تُكتب مرتين بصيغتين. **والهالك يُخرج كميةً من الرصيد كما يُخرجها الصرف الخارجي، وكان الوحيد الذي يمرّ بتوقيع واحد** (`wastage` بلا `approved_by`).
>
> **و«تسجيل هالك — مخزن العنبر: ✅ للمربّي» توسيعٌ واعٍ لصلاحيته لا سهو** — كان `❌` له في الصفّ المجمَّع. **ومقابله أن المشرف يصادق**، فالتوسيع مقترنٌ بشاهده لا مطلقًا. **والمصادقة صفٌّ مستقل لا خانة في صفّ التسجيل** — **من يسجّل ومن يصادق فعلان يفصلهما المبدأ #155**.
>
> **ولا حدّ للكميات الصغيرة: كل تلف يحتاج مصادقة في النسخة الأولى** (209) — **والحدّ مسحوب عمدًا** لأن «كمية صغيرة» بلا وحدة تصلح لثلاثة أشياء لا يجمعها رقم واحد، **ولا أسعار في النظام نُوحّد بها** (#136). §7-ب البند 59.

> **وصفوف الحوكمة الأربعة أُضيفت بالقرار 207:** **الجرد الدوري بمستوييه** — أمين المخازن يجرد المركزي، والمشرف يجرد مخزن موقعه **عند نهاية الدفعة لا بتقويم دوري**، **والمالك وحده يصادق على الاثنين** (المبدأ #155: المُدخِل غير المصادِق). **ولا صفّ لجرد مخزن العنبر — لا جرد دوري له إطلاقًا** (207 حكم ٦): معادلة العهدة تغني عنه، **لأن المتبقّي فيه إمّا يُستهلك أو يُحوَّل بحركة مسجَّلة** (#159). **وصرف الأدوية بموافقة الطبيب** — **على شكل القرار 203 بعينه** (بادئ ومصادِق، اتجاهان متناظران، ومن بدأ لا يصادق) **بطرفين مختلفين: أمين المخزن والطبيب بدل أمين المخزن والمالك**. **والفرق الجوهري أن للأمر الطبّي عنبرًا وجرعة** — فالموافقة طبّية لا إدارية. **وبيع الدواء خارجيًّا لا يحتاج الطبيب** (207 حكم ٨): فعلٌ تجاري بلا عنبر ولا جرعة، فيكفيه توقيعا المالك وأمين المخزن.
>
> **وأمين المخزن أُضيف دورًا بالقرار 198، وله عمود في المصفوفة منذئذ** — **وما كان مكتوبًا هنا («دور جديد لم يُضَف بعد، فلا عمود له») صار قديمًا وصُحّح بالقرار 207.** **ونطاقه محورٌ آخر** (207 حكم ١): **واحدٌ للمستأجر كله للمخزن المركزي، لا يُسند بمخزن بعينه** — فليس في `ASSIGNMENT_SCOPED_ROLES` ولا في `FULL_VISIBILITY_ROLES`. **ولا يرى أرصدة العنابر ولا بيانات الدفعات** (#161 «سابعًا»، **نُظر فيه ولم يُنقض**: واجبُ مراجعةٍ يحتاج رؤية العنابر **نُقل إلى من يراها أصلًا بدل توسيع رؤيته**).
>
> **والنصّ الأصلي للسياق:** **وأمين المخزن دور جديد لم يُضَف بعد، فلا عمود له في المصفوفة.** **يُدخل رصيد المخزن المركزي والمالك يصادق** (#161 «ثامنًا») — **ويُضاف عموده هنا حين يُضاف الدور، ولا يُضاف الدور قبل قلب افتراض الحارس** (#161 «ثالث عشر» البند ١: **أي دور غير مُدرَج صراحة يُحجب عنه كل شيء**). **وهو أمين حفظ لا آمر صرف:** يستلم وينفّذ ويجرد ويطلب، **والأمر بالصرف من المركزي للمالك وحده**.
>
> **و«المالك: ❌» في صفّ إدخال الرصيد الافتتاحي منعٌ صريح لا سكوت — المالك مصادِق لا مُدخِل، والجمع بينهما نقض للمبدأ #155.** فالمستويات الثلاثة مكتملة: **أمين المخزن يُدخل افتتاحي المركزي · والمشرف يُدخل افتتاحي مخزن موقعه · والمربّي يُدخل افتتاحي عنبره** — **والمالك يصادق على المركزي ومخازن المواقع، والمشرف يصادق على عنابر مزارعه**. **ولا مُدخِل يصادق على ما أدخله في أيّ مستوى.**
>
> **وصفّ حمولة التسويق حُسم بالقرار 208 وتغيّر اسمه معه:** كان «**عدّ** حمولة التسويق» موسومًا `؟` — **وصار «مطابقة» بـ✅ للمربّي وحده**. **والاسم تغيّر لأن الفعل تغيّر**: **لا عدّ أعمى عند التحميل** (نقضٌ صريح لـ#160 «سادسًا»)، **بل مطابقةُ الكميات في التصريح بما خرج من عنبره وتأكيدُ هوية السائق**. **والعلّة: الاستلام الأعمى يحمي حين يكون العادّ مستلِمًا وينقلب حين يكون مُسلِّمًا** — فالبضاعة هنا تخرج والزائد يغادر المزرعة. **وحدّ التصريح يبقى ظاهرًا مفروضًا** — **مسألةُ سلطةٍ لا مسألةَ عدّ**، وإخفاؤه يحوّل مخالفةً كان يمكن منعها إلى اكتشافٍ بعد فوات الأوان. **ولا دور للسائق في التسجيل.**
>
> **و`؟` تعني «غير محسوم» لا «مباح»** (قاعدة #157 البند ٥). **والباقي منها اليوم صفوف الأمن الوقائي الثلاثة** (تسجيل دخول فعلي · رفع بلاغ أمني · قراءة البلاغ الأمني) — **وفاعلها هو السؤال المفتوح الأول في القرار #154**، لا في #160. **ولا يُبنى صفّ موسوم `؟` قبل أن يُحسم.**
>
> **و«تصفية دفعة: ✅ للمالك وحده» يبقى — والتسويق لا يُغلق الدفعة إطلاقًا** (#160 «عاشرًا» البند ١٠): **التسويق الجزئي هو الحالة الغالبة**، والإغلاق **فعل مستقل يقرره المالك حين يفرغ العنبر**.

---

# 13 · دفتر المخزون

## 13.1 المستويان

```
المورّد → warehouse → shipment → house → استهلاك
              ↑                              │
              └────────────── مرتجع ─────────┘
```

## 13.2 مصادر الحركة

| الحدث | الحركات |
|---|---|
| استلام من موّرد | استلام (+) مخزن |
| إرسال شحنة | شحن صادر (−) — يُرفض إن تجاوز الرصيد |
| تأكيد الاستلام | شحن وارد (+) بالكمية المعدودة |
| تصحيح شحنة | حركة بالفرق مرتبطة بالتصحيح |
| مرتجع | مرتجع صادر (−) + مرتجع وارد (+) |
| تحويل | تحويل صادر (−) + تحويل وارد (+) |
| السجل اليومي | استهلاك يومي (−) لكل صف علف |
| تنفيذ علاج | تنفيذ علاج (−) |
| خطوة تجهيز | استهلاك تجهيز (−) |
| الجرد | تسوية جرد (±) |
| الهالك | هالك/تلف (−) |
| **الصرف الخارجي** | **صرف خارجي (−) — بالمصادقة لا قبلها** (القرار 203) |
| **استهلاك كيس علف** | **استهلاك يومي (−) على صنف العلف · و«تفريغ كيس» (+) على صنف الكيس الفارغ** — حركتان في معاملة واحدة (القرار 212) |

**والصرف الخارجي هو الخروج الوحيد إلى خارج المنظومة** — والاثنا عشر قبله كلها داخلية. **ولا يُسجَّل إلا بأمرٍ مصادَق عليه** (`external_issue_orders`): **المعلَّق لا يمسّ الرصيد والمرفوض لا يُنتج حركة**، **وحارسٌ في القاعدة يرفض كل حركة لا يقابلها أمر مصادَق عليه بنفس المخزن والصنف والكمية ووحدتها**، **وفهرسٌ فريد يمنع حركتين لأمر واحد**. **والأمر المقرَّر مجمَّد — لا يُعدَّل ولا يُحذف** (`external_issue_order_freeze_guard`): **المعلَّق مسوّدة، وما خرج من «معلّق» لا يتغيّر فيه شيء**. **وثابت §13.3 يبقى مفروضًا: حركةٌ سالبة كغيرها.** **ولا سعر ولا قيمة** (#136 و#161 «عاشرًا»).

## 13.3 ثابت الدفتر — بعد كل عملية

لكل (مستأجر · منتج): **Σ كل الحركات == رصيد المخزن + Σ أرصدة العنابر**
ولكل موقع: الرصيد ≥ 0.

**وثابتان آخران بمحورين مختلفين — وخلط المحاور يُنتج فحصًا يقيس غير ما يظنّ:**

| الثابت | محوره | متى يُفحص |
|---|---|---|
| **هذا (§13.3)** | لكل (**مستأجر · منتج**) | **بعد كل عملية** |
| **الأكياس الفارغة** (القرار 212) | **لكل مخزن عنبر** | **فورًا عند الاستهلاك — بلا انتظار جرد** |
| **العهدة** (القرار 207) | **لكل مخزن موقع وسلسلته النازلة إلى عنابره** | **عند نهاية الدفعة** مع الجرد |

**وثابت الأكياس الفارغة — محسوبًا من الدفتر بلا عمود مخزَّن:**

```
لكل مخزن عنبر:
  Σ (الوارد من أصناف العلف) == رصيد الفارغ (صالح + تالف) + رصيد أصناف العلف
```

> **وهو يكشف ما لا يكشفه §13.3 إطلاقًا** (القرار 212): **كيسٌ يخرج بلا تسجيل تفريغه يُبقي الدفتر متسقًا تمامًا** — الحركة السالبة مسجَّلة ومجموعها يطابق الرصيد — **ويُظهر فرقًا في هذه المعادلة فورًا**. **فالأول يحرس الدفتر من التناقض مع نفسه، وهذا يحرس المخزن من الواقع.** **والكيس التالف يبقى في رصيد الفارغ ولا يخرج منه** — **وتسجيله هالكًا يُنقص الرصيد فتختلّ المعادلة**، ويمنعه `empty_bag_movement_guard`.

## 13.4 قواعد الرصيد

- يُمنع الإرسال والتحويل والهالك فوق الرصيد ← 400 (الفحص داخل المعاملة تحت القفل)
- لا يُمنع الاستهلاك اليومي ولا تنفيذ العلاج — تنبيه فقط
- رصيد سالب ← تنبيه فوري للمالك

---

# 14 · التدفقات

## 14.1 السجل اليومي

```
POST /daily-logs
  قفل العنبر → التحقق من الدفعة النشطة →
  تحقق التكرار داخل المعاملة (والفهرس كشبكة أمان) →
  [معاملة] → السجل + صفوف العلف + حركات المخزون →
  تنبيه معقولية عند الانحراف (لا يمنع) →
  مكرر ← يُعاد السجل الموجود بـ client_id 200
```

## 14.2 الملاحظة والمراجعة

```
POST /daily-logs/:id/notes
  [معاملة] → المالحظة + نقل لـ pending_review → إشعارات (supervisor)

POST /daily-logs/:id/review
  [معاملة] → تأكيد: سجل تصحيح + حركة معاكسة بالفرق
           → رفض: سبب إلزامي + إشعار
  قبل الاعتماد: مؤشر «يتضمن سجلات قيد المراجعة»
```

## 14.3 الشحنة — الاستلام الأعمى

```
POST /shipments                     (supervisor|vet بفئته)
  [معاملة] → التحقق من رصيد المخزن → شحن صادر → handover_code يظهر للمُرسِل وحده

GET /shipments/:id                  (farmer) → الاستجابة بلا sent_quantity

POST /shipments/:id/receive         (farmer)
  → counted_quantity + handover_code
  → 3 محاولات خاطئة ← bypass مع تسجيل وتنبيه
  [معاملة] → شحن وارد بالكمية المعدودة
  → variance = counted − sent
      مطابق · ≤ tolerance → فرق مسجّل (ملاحظة إلزامية) · > 10% أو تلف → نزاع
  → المادة تبقى مستلمة بالكمية المعدودة في كل الحالات
```

## 14.4 النزاع

```
PATCH /shipments/:id/dispute  (owner) → outcome + تعليل → يُقفل [معاملة+audit]
```

## 14.5 المهمة الصحية

```
POST /health-tasks/:id/execute (farmer) [معاملة] → حركة تنفيذ علاج
```

## 14.6 دورة العنبر

```
تصفية (owner): قفل → جرد إلزامي → تحذير فترة السحب →
  [معاملة] → إغلاق + status='تحت الإخلاء' + إنشاء دورة تجهيز

PATCH /prep-steps/:id/complete
  قفل (شرط completed_at IS NULL) → الخطوة → حركة استهلاك
  [معاملة] → عند اكتمال الإلزامية: انتقال تلقائي لـ'في فترة الراحة'

PATCH /houses/:id/status
  قفل → إعادة قراءة الحالة والحرّاس داخل المعاملة →
  [معاملة] → مسار الانتقال → houses+history+min_rest_days → إغلاق الدورة
  → انتقال غير صالح ← 422 بسبب واضح
  → بدء دفعة في عنبر غير جاهز: مسموح بسبب + housed_before_ready=true + audit + تنبيه
```

## 14.7 إعادة الفتح

```
POST /batches/:batchId/reopen (owner): قفل · سبب ≥5 أحرف · audit [معاملة]
  يُرفض إن: دفعة نشطة أخرى · أو تقدّمت دورة التجهيز

PATCH /batches/:id لأي دور: 'منتهية'→'نشطة' مباشرة ← 409 (يجب المسار المخصص أعلاه)
```

---

# 15 · المعادلات

```
avg_weight_g       = sampled_weight_kg / sampled_birds × 1000
feed_kg            = bags × bag_weight_kg   (وزن الكيس يُقرأ من products.package_size
                                            ويُجمَّد في الصفّ وقت الإدخال — القرار 201)
water_liters       = tanks × tank_capacity_l
current_birds      = initial_bird_count − Σ mortality
mortality_pct      = Σ mortality / initial_bird_count × 100

FCR = Σ feed_kg / ((current_birds × avg_weight_g/1000) − (initial_count × chick_weight_kg))
      chick_weight من breed_standards — لا ثابت في الكود

daily_consumption  = متوسط آخر 3 أيام
coverage_days      = balance / daily_consumption          (مقرَّب لأسفل)
water_feed_ratio   = water_liters / feed_kg
EPEF               = (الوزن كجم × % البقاء) / (FCR × العمر) × 100
```

**العرض:** الأكياس والخزانات منزلة واحدة · الأعداد صحيحة بفاصل آلاف · النسب والـ FCR منزلتان · أيام التغطية صحيحة · لا شرطة صامتة · كل مؤشر بجانبه المعياري ليوم الدفعة.

---

# 16 · المهام المجدولة والإشعارات

ثلاثة مستويات: **urgent** (جرس+push) · **action** (جرس) · **info** (ملخص يومي).

**العاجل — قائمة مغلقة:**
- المربي: مهمة عاجلة · شحنة بانتظاره · رد المشرف
- الطبيب: بلاغ شديد · تعذّر علاج · نفوق ضعف المعدل
- المشرف: نزاع · عنبر لم يُسجَّل أمس · تغطية أقل من يومين
- المالك: نزاع · بلاغ شديد بلا رد ساعتين · تصفية · رصيد سالب

**التصعيد (cron ساعي):** بلاغ شديد >ساعتين · ملاحظة >48 ساعة · شحنة >48 ساعة · نزاع >72 ساعة · عنبر بلا تسجيل يومين ← كلها للمالك.

**قواعد:** لا إشعار لمن نفّذ · لا تنبيه على عنبر بلا دفعة نشطة · ساعات هدوء 10م–5ص عدا العاجل · تجميع المتشابه · الدفع بعد الالتزام فقط.

---
---

# الجزء الرابع — الواجهة البرمجية

---

# 17 · نقاط الـ API

كلها تبدأ بـ `/api` وتمر بـ `requireAuth + requireTenant + enforceEntityAccess` ما لم يُذكر خلاف ذلك.

**المصادقة**
```
POST /auth/login · POST /auth/platform-login          (بلا مصادقة)
GET /auth/me · POST /auth/change-password · POST /auth/register-push-token
```

**المزارع والعنابر والدفعات**
```
GET/POST /sites · PATCH /sites/:siteId
GET/POST /sites/:siteId/farms · PATCH /farms/:farmId
GET/POST /farms/:farmId/houses · PATCH /houses/:houseId
PATCH /houses/:houseId/status · GET /houses/:houseId/history
GET /houses/:houseId/batches · POST /batches
GET /batches/:batchId · GET /batches/:batchId/summary
GET /batches/:batchId/close-preview · POST /batches/:batchId/close
POST /batches/:batchId/reopen
```

**السجلات**
```
GET /batches/:batchId/daily-logs · POST /daily-logs
GET /daily-logs/:logId · POST/GET /daily-logs/:logId/notes
POST /daily-logs/:logId/review · GET /reviews/pending
```

**الشحنات**
```
GET/POST /shipments · GET /shipments/:id
POST /shipments/:id/receive · POST /shipments/:id/unregistered
DELETE /shipments/:id · POST/PATCH /shipments/:id/dispute
GET /shipments/:id/audit-log · POST /shipments/:id/notes
```

**المخزون**
```
GET /inventory/balance · GET /inventory/movements · GET /inventory/low-stock
POST /inventory/warehouse-receipt · POST /inventory/transfer
POST /inventory/stocktake · POST /inventory/wastage
GET /inventory/coverage-alerts
```

**الكتالوج**
```
GET/POST /products · PATCH/DELETE /products/:id
```

**الصحة**
```
GET/POST /health-tasks · POST /health-tasks/bulk · PATCH /health-tasks/:id
POST /health-tasks/:id/execute · POST /health-tasks/:id/fail
GET/POST /health-observations · POST /health-observations/:id/respond
POST /batches/:batchId/diagnoses
```

**التجهيز**
```
GET /houses/:houseId/prep-cycle · PATCH /prep-steps/:stepId/complete
GET /prep-protocol
```

**التقارير** (owner)
```
GET /reports/batch-performance · /house-comparison · /loss · /health · /compliance
GET /export?format=pdf|xlsx
```

**المستخدمون والإعدادات** (owner — **وكتلةُ المستخدمين للمشرف كذلك بحدوده الثلاثة، القرار 251**)
```
GET/POST /users · PATCH /users/:id
GET/POST /users/:id/assignments · POST /users/:id/assignments/:assignmentId/end
POST /users/:id/deactivate · POST /users/:id/activate · POST /users/:id/reset-password
GET/PATCH /settings · GET/PUT /breed-standards
```

**المنصة** (platform_admin)
```
GET /platform/overview · /tenants · /usage · /audit-log
POST /platform/tenants · PATCH /platform/tenants/:id/subscription
```

---

# 18 · العقود

- OpenAPI 3.1 مصدر الحقيقة · منه تُولَّد hooks العميل
- فاحص تغطية يفشل البناء عند مسار غير موثّق
- خطأ موحّد: `{ code, message, details? }` — الرسالة عربية جاهزة للعرض
- ترقيم: `?limit&cursor` · الافتراضي 20
- التواريخ ISO 8601 بـ UTC · التحويل لتوقيت المستأجر في العرض

---

# 19 · رموز الأخطاء

| الرمز | الاستخدام |
|---|---|
| 400 | بيانات غير صالحة · تجاوز رصيد · سبب مفقود |
| 401 | غير مصادَق · رمز منتهٍ |
| 403 | مصادَق وغير مخوَّل (موجود وغير مُسند) |
| 404 | غير موجود أو خارج المستأجر |
| 409 | تكرار · حالة لا تسمح · سباق |
| 422 | انتقال حالة غير صالح · شرط عمل غير مستوفٍ |
| 429 | تجاوز المحاولات |

---
---

# الجزء الخامس — الجودة والتشغيل

---

# 20 · الاختبارات

**البنية:** `supertest` على قاعدة اختبار منفصلة · حارس `fail-closed` من جهة الخادم يتحقق عبر `current_database()` ووجود جدول علامة — لا يثق بالرابط · تشغيل متسلسل.

**التغطية الإلزامية:**

| المجال | المطلوب |
|---|---|
| الصلاحيات | كل دور × كل نقطة: allow + deny-403 + cross-tenant-404 |
| العزل | كل دور × كل كيان في مستأجر آخر |
| الدفتر | تأكيد الثابت بعد كل عملية |
| التزامن | سجلان · خطوتا تجهيز · تصحيح مع إغلاق · تحويلان على نفس الرصيد |
| الأخطاء | اختبار لكل ثغرة يفشل قبل الإصلاح وينجح بعده |

حالات النجاح تتحقق من محتوى الاستجابة — لا نجاح فارغ.
**البيانات التجريبية:** `seed:demo` عبر الـ API بحارس بيئة · كل شيء بصلاحيات الدور — ممنوع الإدراج المباشر.

---

# 21 · الفحوص الآلية

تفشل البناء — لا تحذيرات:

| الفاحص | يمنع |
|---|---|
| المسارات المكررة | تسجيل نفس (method, path) مرتين |
| تغطية OpenAPI | نقطة غير موثّقة |
| رموز التصميم | لون حرفي · رمادي أفتح من `#4A4A4A` · إيموجي · قيمة خارج المقياس |
| تغطية التنقل | شاشة خارج مكدّس تبويب وبلا زر رجوع |
| صحة enum | قيمة بلا مسار يكتبها |
| typecheck | `tsc --noEmit` نظيف |

---

# 22 · الأداء والحدود

| المؤشر | الهدف |
|---|---|
| حفظ سجل يومي | < 500 مللي ثانية |
| تحميل الشاشة الرئيسية | < 1 ثانية |
| تقرير أداء دفعة | < 3 ثواني |
| كشف حركة صنف (1000 حركة) | < 2 ثانية |
| مستخدمون متزامنون | 200+ بلا تدهور |

**قواعد:** كل استعلام قائمة مرقّم · كل استعلام على `inventory_movements` يستخدم الفهرس المركّب · التقارير الثقيلة تُحسب على الخادم لا العميل.

---

# 23 · الأمان

- كل مدخلات المستخدم عبر zod قبل أي معالجة
- استعلامات معلَّمة حصريًا — لا بناء SQL بسلاسل نصية
- تنقية أسماء الملفات المرفوعة · حد حجم · نوع MIME مقيَّد
- تعقيم CSV ضد حقن الصيغ عند التصدير
- لا معرّف داخلي في أي استجابة يراها المستخدم النهائي
- helmet · CORS مقيَّد · تحديد معدل
- مراجعة أمنية إلزامية قبل أول عميل حقيقي

---

# 24 · المراقبة

- pino بمعرّف طلب لكل عملية
- تسجيل كل 403 و409 — تكرارها مؤشر ثغرة أو خلل تصميم
- `GET /health` · `GET /ready`
- تنبيه عند: أخطاء 5xx > 1% · زمن استجابة p95 > الهدف · فشل مهمة cron
- لا تسجيل لكلمات المرور ولا الرموز ولا أرقام الجوال كاملة

---

# 25 · النشر

- الترحيلات خطوة صريحة قبل نشر الكود
- نسخة احتياطية قبل كل ترحيل على الإنتاج
- نشر تدريجي مع إمكانية التراجع
- لا سكربت يمسح أو يعيد بناء يعمل دون كتابة اسم البيئة يدويًا
- Expo OTA للتحديثات غير الجذرية · EAS Build للجذرية

---

# 26 · معايير القبول

**الأمان**
- [ ] لا كلمة مرور كنص عادي في القاعدة أو السجلات
- [ ] `tenant_id` من JWT حصريًا — طلب بقيمة مزيّفة يُتجاهل
- [ ] كل نقطة تستقبل معرّف كيان تمر بالفحص المركزي
- [ ] كل معرّف مشتق يُجلب بدالة مفحوصة
- [ ] الوجود قبل التعيين (404 قبل 403)
- [ ] مصفوفة الصلاحيات كاملة وخضراء

**سلامة البيانات**
- [ ] ثابت الدفتر يمر بعد كل عملية على المستويين
- [ ] لا رصيد سالب
- [ ] قيد `CHECK` على `inventory_movements` يعمل
- [ ] كل الفهارس الفريدة مطبَّقة والتزامن مختبَر
- [ ] لا حذف لأي حركة أو سجل تدقيق

**الاكتمال**
- [ ] كل قيمة enum لها مسار يكتبها
- [ ] كل عمود له مسار يملؤه
- [ ] `breed_standards` معبّأ للسلالات الثلاث من اليوم 1 إلى 45
- [ ] كل شاشة في الوثيقة الشاملة لها نقاط API تخدمها
- [ ] كل مؤشر بجانبه المعياري

**العمليات**
- [ ] Drizzle Kit — لا `push` — لا ترحيل عند الإقلاع
- [ ] **الفحوص الاثنا عشر** تعمل وتفشل البناء (كانت ستًّا، والثاني عشر «المفتاح المركَّب» بالقرار 206)
- [ ] `seed:demo` عبر الـ API
- [ ] نسخة احتياطية مُختبَرة الاستعادة
- [ ] `docs/decisions.md` محدَّث

---

# الملحق أ — سجل القرارات ومبرراتها

**انظر `docs/decisions.md`** — النسخة الحيّة والمرجعية لهذا الملحق. القاعدة الدائمة: أي قرار تشغيلي جديد يُضاف إلى ذلك الملف في نفس المهمة التي تنفّذه؛ مهمة تغيّر سلوكًا ولا تحدّثه تُعد ناقصة.

---

# الملحق ب — قائمة الحزم

**apps/mobile**
```
expo · expo-router · react-native · react
@tanstack/react-query · axios
expo-secure-store · @react-native-async-storage/async-storage
expo-notifications · expo-image-picker · expo-camera
expo-av · expo-image-manipulator · expo-font
lucide-react-native · react-native-svg
date-fns · react-hook-form · zod · @hookform/resolvers
typescript · eslint · prettier
```

**apps/api**
```
express · cors · helmet · express-rate-limit
drizzle-orm · pg
zod · jose · bcryptjs · pino · pino-http
node-cron · multer · @aws-sdk/client-s3
typescript · esbuild · tsx
supertest · vitest (أو node:test)
```

**packages/db**
```
drizzle-orm · drizzle-kit · pg
```

---

# الملحق ج — متغيرات البيئة

| المتغير | ملاحظات |
|---|---|
| `NODE_ENV` | `development \| test \| production` |
| `PORT` | |
| `DATABASE_URL` | تحقنه المنصة — لا يُكتب في ملف منسوخ |
| `JWT_SECRET` | |
| `JWT_EXPIRES_IN` | افتراضي 30d |
| `BCRYPT_ROUNDS` | افتراضي 10 |
| `S3_ENDPOINT` · `S3_BUCKET` · `S3_ACCESS_KEY` · `S3_SECRET_KEY` | |
| `EXPO_ACCESS_TOKEN` | لإرسال الإشعارات |
| `LOG_LEVEL` | `info \| debug` |
| `DEFAULT_COUNTRY_CODE` | افتراضي `+967` |
| `EXPO_PUBLIC_API_URL` | (التطبيق) — يجب أن يشير للخادم المنشور لا `localhost` |
| `EXPO_PUBLIC_ENV` | لمؤشر البيئة المرئي |

> **تنبيه:** أشهر خطأ في النشر هو بناء التطبيق وهو يشير إلى `localhost` — فينجح البناء ويفشل الدخول على الجهاز بلا سبب واضح.

---

**نهاية الوثيقة**
