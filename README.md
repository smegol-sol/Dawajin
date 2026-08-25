# دواجن

نظام إدارة مزارع دواجن التسمين — تطبيق موبايل (Expo/React Native) + خادم API (Express) + PostgreSQL.

## ⚠️ قبل أي استخدام إنتاجي — اقرأ هذا أولًا

**بيانات معايير السلالات (`breed_standards`) في هذا المستودع تقريبية، وليست رسمية.**
كل مؤشر "مقارنة بالمعيار" في التطبيق (FCR، الوزن، النفوق التراكمي) يعتمد عليها — استخدام القيم الحالية في الإنتاج ينتج مقارنات خاطئة بأرقام تبدو صحيحة.

**ممنوع تسليم هذا النظام لأي عميل حقيقي قبل استبدال `packages/db/src/seed/breed-standards-data.ts` بجداول الأداء الرسمية:**

| السلالة | المصدر الرسمي |
|---|---|
| Ross 308 · Arbor Acres | Aviagen (Performance Objectives) |
| Cobb 500 | Cobb-Vantress (Performance & Nutrition Supplement) |

التفصيل الكامل: [`docs/decisions.md`](docs/decisions.md) القرار #56، وبوابة القطع في [`docs/work-plan.md`](docs/work-plan.md) المرحلة 7.

## الوثائق المرجعية

| الملف | المحتوى |
|---|---|
| [`docs/app-complete-spec.md`](docs/app-complete-spec.md) | ماذا يرى المستخدم — الشاشات ونظام التصميم (مرجع ملزم) |
| [`docs/backend-technical-spec.md`](docs/backend-technical-spec.md) | ماذا يحدث خلف الشاشة — البنية وقاعدة البيانات والمنطق (مرجع ملزم) |
| [`docs/decisions.md`](docs/decisions.md) | سجل القرارات الملزمة ومبرراتها — وثيقة حيّة تُحدَّث مع كل قرار جديد |
| [`docs/work-plan.md`](docs/work-plan.md) | خطة العمل المرحلية الكاملة |
| [`CLAUDE.md`](CLAUDE.md) | ملخص سريع للمبادئ والممنوعات — نقطة انطلاق لأي عمل في المستودع |
| [`docs/run-on-phone.md`](docs/run-on-phone.md) | **كيف تُشغّل التطبيق على جوالك** — دليل خطوة بخطوة لغير التقنيين |

## البدء السريع

```bash
pnpm install
cp .env.example .env          # عدّل القيم حسب بيئتك المحلية

pnpm migrate                  # تطبيق ترحيلات قاعدة البيانات
pnpm dev                      # تشغيل خادم الـ API محليًا
```

انظر [`CLAUDE.md`](CLAUDE.md) لبقية الأوامر الأساسية (`test:integration`، `check:all`، إلخ) وقائمة الممنوعات الصريحة.

## بنية المشروع

مونوريبو `pnpm workspaces`:

```
apps/
  api/       ← خادم Express (TypeScript)
  mobile/    ← تطبيق Expo Router
packages/
  db/        ← مخطط Drizzle ORM والترحيلات
  shared/    ← أنواع ومخططات zod مشتركة بين الخادم والتطبيق
docs/        ← الوثائق المرجعية أعلاه
scripts/     ← الفحوص الآلية (check:all)
```

## الحالة الحالية

المرحلة 0 (الأساس) و§7 من `work-plan.md` (توحيد سجلات التدقيق وحسم الغموض الهيكلي) منجَزتان ومُختبرتان. أول مسار أعمال حقيقي (`GET/PATCH /api/settings`) قيد الإنشاء ضمن المرحلة 1. التفصيل الكامل والمراحل القادمة في [`docs/work-plan.md`](docs/work-plan.md).
