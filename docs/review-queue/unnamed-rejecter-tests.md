# اختبارات لا يسمّي عنوانُها رادَّها — قائمةٌ محفوظة

**تُقرأ مع القرار 266.** **وهذا الملفُّ نفسه هو الدرس:** رقمٌ في قرارٍ بلا
قائمته لا يُتقاطع مع شيء، **ولا يُعاد إنتاجه إن لم يُحفظ معيارُه كذلك**.

## المعيار — مُعلَن، وهو جزءٌ من القياس لا شرحٌ له

**«يؤكّد 403/422»:** جسمُ الاختبار يحمل `toBe(403|422)` أو `HttpError(403|422`
أو `status: 403|422`.

**«يسمّي الرادّ»:** عنوانُ الاختبار يحمل **رمزَ خطأ** بصيغة `snake_case`، **أو
اسمًا برمجيًّا بين علامتين مائلتين**، **أو عبارةً تسمّي الحارس** («الفرض
المركزي» · «حارس الدور» · «من حارس» · «يردّه» · «الرادّ» · «قبل الخدمة» ·
`requireRole` · `enforceEntityAccess` · `assertWarehouseAccess` · «المحلِّل»).

**وما لا ينطبق عليه ذلك فهو في هذه القائمة** — **وسببُ وجوده هنا أن العنوان لا
يقول أيُّ حارسٍ ردّ، لا أنه خاطئ.**

## الحدّ

**٦١ ملف اختبار** في `apps/api/src` و`packages` · **ولم تُمسح شاشاتُ الموبايل.**

## العدد

| | |
|---|---|
| يؤكّد 403 أو 422 | **142** |
| **يسمّي الرادّ** | **52** |
| **لا يسمّيه** | **90** |
| منها **داخل الأحد عشر المستثناة** (القرار 266) | **17** |
| **الواجب في دفعة المراجعة** | **73** |

> **ولا يُقارَن هذا بـ«٤٨» في القرار 260:** **معيارُ ذلك المسح لم يُحفظ**، فلا
> الرقمان قابلان للمقارنة ولا الأول قابلٌ لإعادة الإنتاج. **والمعتمد ما هنا.**

## القائمة

| الملف | السطر | العنوان | مستثنًى؟ |
|---|---|---|---|
| `apps/api/src/middleware/entityAccess.test.ts` | 129 | 403 لمعرّف مخزن غير معلوم يصل من الرابط — بلا استعلام قاعدة | لا |
| `apps/api/src/middleware/liveSession.integration.test.ts` | 84 | تمنع مسار قراءة (GET /api/settings) بـ403 | لا |
| `apps/api/src/middleware/liveSession.integration.test.ts` | 93 | تمنع مسار كتابة آخر (POST /api/auth/register-push-token) بـ403 | لا |
| `apps/api/src/middleware/platformAuth.test.ts` | 69 | 403 لكلمة مؤقتة لم تُبدَّل على مسار غير مسموح | لا |
| `apps/api/src/middleware/requireRole.test.ts` | 21 | 403 لدور غير مسموح | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 210 | مخزن عنبر غير مُسند للمربّي ← 403 | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 226 | إسناد انتهت مدته أمس ← 403 (شرط «سارٍ اليوم» يسري على المخزن كما على العنبر) | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 242 | مخزن مركزي لمشرف بلا إسناد مخزن ← 403 | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 257 | معرّف ليس رقمًا ← 403 لا تمرير صامت | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 262 | معرّف صفر ← 403 (لا يشير إلى مخزن) | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 269 | من مخزن مُسند إلى مخزن غير مُسند ← 403 (الوجهة تُفحص لا المصدر وحده) | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 277 | من مخزن غير مُسند إلى مخزنه المُسند ← 403 (المصدر يُفحص كذلك) | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 285 | من المركزي إلى مخزن عنبر غير مُسند ← 403 وإن كان المركزي مسموحًا للمالك | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 314 | مشرفٌ مُسنَدٌ لمزرعةٍ في الموقع، بلا إسناد المخزن ← 403 | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 319 | **وإسنادٌ منتهي المدة لا يفتحه** — «سارٍ اليوم» يسري هنا كغيره | لا |
| `apps/api/src/middleware/warehouseScope.integration.test.ts` | 343 | **ومشرفُ المزرعة الأخرى في نفس الموقع يبقى 403** — فالاشتقاق لم يقع | لا |
| `apps/api/src/routes/_probe.integration.test.ts` | 363 | عنبر موجود في نفس المستأجر لكن غير مُسند للمربي ← 403 (بعد التأكد من الوجود) | **نعم** |
| `apps/api/src/routes/_probe.integration.test.ts` | 442 | **houseId في body لعنبرٍ لا يبلغه إسنادُ صاحب الطلب ← 403** | **نعم** |
| `apps/api/src/routes/assignmentPeriods.integration.test.ts` | 221 | إسناد يبدأ غدًا لا يمرّ اليوم ← 403 | لا |
| `apps/api/src/routes/farms.integration.test.ts` | 132 | المالك ينشئ مزرعة ← 201، والصف موجود فعلًا في القاعدة | لا |
| `apps/api/src/routes/farms.integration.test.ts` | 226 | المربي بلا إسناد في الموقع ← 403 لا قائمة فارغة | لا |
| `apps/api/src/routes/farms.integration.test.ts` | 265 | تعديل الاسم ومصادر الطاقة ← 200، والقاعدة تحمل الجديد فعلًا | لا |
| `apps/api/src/routes/houseInitialStatus.integration.test.ts` | 124 | قيمة ليست من الحالات السبع ← 400 من التحقّق | **نعم** |
| `apps/api/src/routes/houseInitialStatus.integration.test.ts` | 187 | القائمة الموجبة ثلاثٌ لا أكثر — والسبع في الآلة | **نعم** |
| `apps/api/src/routes/houseStatus.integration.test.ts` | 248 | الانتقال إلى نفس الحالة ليس انتقالًا ← 422 | **نعم** |
| `apps/api/src/routes/houseStatus.integration.test.ts` | 299 | **المدة تُقرأ من الدورة لا من سياسة المستأجر**: سياسة 3 ودورة 10 ← يُرفض | **نعم** |
| `apps/api/src/routes/houseWarehouseCategories.integration.test.ts` | 147 | **فئةٌ ممنوعة إلى مخزن عنبر ← 422، ولا صفَّ أمرٍ يُكتب** | لا |
| `apps/api/src/routes/houseWarehouseCategories.integration.test.ts` | 186 | **والمشرف يبلغ الطرفين ويملك الإصدار ← يُردّ بحدّ الفئة وحده** | لا |
| `apps/api/src/routes/houseWarehouseCategories.integration.test.ts` | 208 | **فئةٌ ممنوعة تُستلم في مخزن عنبر ← 422، ولا رصيد** | لا |
| `apps/api/src/routes/houses.integration.test.ts` | 132 | بلا نوع ولا سعة ← 201، والحقلان NULL (الماء مخفي في الواجهة) | **نعم** |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 145 | المربّي يقرأ عنبرًا **غير مُسند** له ← 403 (المبدأ السادس · القرار #126) | لا |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 179 | المشرف المُسند بمزرعة ← 403 لعنبر في مزرعة أخرى بنفس المستأجر | لا |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 188 | الطبيب بلا إسناد ← 403 (القيد لا يخصّ المربّي وحده) | لا |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 208 | المربّي مُسند بالعنبر لا بالمزرعة — إسناد مزرعته لا يفتح له عنبرًا آخر | لا |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 277 | المشرف المُسند بالمزرعة يرى الخمسة، والطبيب غير المُسند ← 403 | لا |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 308 | مربّي بلا أي إسناد في المزرعة ← 403 لا قائمة فارغة | لا |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 345 | مربٍّ انتهت مدته أمس ← 403 | لا |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 368 | مشرف انتهت مدته أمس ← 403 | لا |
| `apps/api/src/routes/housesAssignment.integration.test.ts` | 389 | مربّي بلا أي إسناد يبلغ المزرعة ← 403 (موجودة غير مُسندة) | لا |
| `apps/api/src/routes/inventoryReceipt.integration.test.ts` | 305 | المربّي لا يستلم ← 403 (قائمة موجبة لا سكوت) | لا |
| `apps/api/src/routes/inventoryReceipt.integration.test.ts` | 315 | **والمشرف لا يستلم دواءً** ← 403 يسمّي الفئة | لا |
| `apps/api/src/routes/inventoryReceipt.integration.test.ts` | 326 | الطبيب يستلم دواءً ← 201، **ولا يستلم علفًا** ← 403 | لا |
| `apps/api/src/routes/inventoryReceipt.integration.test.ts` | 338 | **«فيتامين» لا يبلغها إلا المالك** — قراءةٌ للمصفوفة لا حكمٌ عليها | لا |
| `apps/api/src/routes/inventoryTransferConfirm.integration.test.ts` | 275 | **ومشرفٌ مُسنَدٌ للمركزيّ ← 403** — الإسنادُ قائم، والدورُ لا يملك المستوى | لا |
| `apps/api/src/routes/inventoryTransferConfirm.integration.test.ts` | 294 | **ومربٍّ مُسنَدٌ للمزرعة لا للعنبر ← 403** — يبلغ المخزن ولا يملكه | لا |
| `apps/api/src/routes/inventoryTransferConfirm.integration.test.ts` | 410 | **وتأكيدٌ مرتين ← 422، والرصيد لم يتضاعف** | لا |
| `apps/api/src/routes/inventoryTransferConfirm.integration.test.ts` | 419 | **وتأكيدٌ قبل الخروج ← 422** — «صادر» لا تُؤكَّد | لا |
| `apps/api/src/routes/inventoryTransferConfirm.integration.test.ts` | 433 | **ومخزنُ وجهةٍ معطَّل ← 422، ولا حركة** | لا |
| `apps/api/src/routes/inventoryTransferIssue.integration.test.ts` | 170 | مخالفة: مشرفٌ مُسنَدٌ لواحدة فقط ← 403 | لا |
| `apps/api/src/routes/inventoryTransferIssue.integration.test.ts` | 183 | أمين المخزن لا يُصدر أمرًا ← 403 | لا |
| `apps/api/src/routes/inventoryTransferIssue.integration.test.ts` | 188 | والمربّي لا يُصدر ← 403 — المشرف وحده يبدأ | لا |
| `apps/api/src/routes/inventoryTransferIssue.integration.test.ts` | 375 | **خروجان متزامنان على رصيدٍ يكفي واحدًا ← أحدهما يُرفض ولا يصير سالبًا** | لا |
| `apps/api/src/routes/inventoryTransferIssue.integration.test.ts` | 427 | **مربٍّ ينفّذ خروجًا من مخزن مزرعةٍ لا يبلغها إسناده ← 403، والرصيد لم يتحرّك** | لا |
| `apps/api/src/routes/listingScope.integration.test.ts` | 236 | المشرف وموقع لا مزرعة مُسندة له فيه ← 403 | **نعم** |
| `apps/api/src/routes/listingScope.integration.test.ts` | 244 | المربّي وموقع بلا عنبر مُسند له ← 403 | **نعم** |
| `apps/api/src/routes/listingScope.integration.test.ts` | 251 | قراءة الموقع نفسه (لا مزارعه) مقيَّدة كذلك ← 403 | **نعم** |
| `apps/api/src/routes/platformAdminRemoval.integration.test.ts` | 74 | سرد المواقع ← 403 — لا أسماء مواقع ولا قائمة فارغة مهذّبة | لا |
| `apps/api/src/routes/platformAdminRemoval.integration.test.ts` | 83 | سرد مزارع موقع قائم ← 403 لا محتوى | لا |
| `apps/api/src/routes/platformAuth.integration.test.ts` | 264 | مدير يحاول إعادة تعيين نفسه ← 403 | لا |
| `apps/api/src/routes/prepCycle.integration.test.ts` | 158 | الطبيب لا يُكمل خطوة ← 403 (قائمة موجبة لا سكوت) | **نعم** |
| `apps/api/src/routes/prepCycle.integration.test.ts` | 166 | المربّي يُكمل خطوتَه المُسنَدة وحدها — وغير المُسنَدة 403 | **نعم** |
| `apps/api/src/routes/prepCycle.integration.test.ts` | 261 | **المشرف يُسنِد فيُكمل المربّي** — وهو المسار الذي لم يكن موجودًا | **نعم** |
| `apps/api/src/routes/prepCycle.integration.test.ts` | 395 | مخالفة: المربّي لا يعتمد ← 403 (§12.2: مشرف ✅ ومالك ✅ لا غير) | **نعم** |
| `apps/api/src/routes/prepCycle.integration.test.ts` | 403 | والطبيب لا يعتمد ← 403 | **نعم** |
| `apps/api/src/routes/prepCycleTransition.integration.test.ts` | 215 | نفس الخطوة من طلبين: واحد 200 والآخر 422 برسالته | **نعم** |
| `apps/api/src/routes/prepStepOrder.integration.test.ts` | 93 | المربّي المُسنَد يُردّ بالترتيب كذلك — الحارس على الدورة لا على الدور | **نعم** |
| `apps/api/src/routes/settings.integration.test.ts` | 176 | GET /api/settings — بلا توكن ← 401 | لا |
| `apps/api/src/routes/sites.integration.test.ts` | 106 | المالك ينشئ موقعًا ← 201 ومعرّف حقيقي | لا |
| `apps/api/src/routes/sites.integration.test.ts` | 249 | المربي ← 403 | لا |
| `apps/api/src/routes/storekeeperScope.integration.test.ts` | 144 | **وسردُ مزارع الموقع ← 403** — لا قائمةً فارغة (#129) | لا |
| `apps/api/src/routes/storekeeperScope.integration.test.ts` | 167 | **ومخزنُ العنبر ← 403** — الكيانُ مخزنٌ والحكمُ حكمُ عنبره | لا |
| `apps/api/src/routes/storekeeperScope.integration.test.ts` | 178 | **ومركزيٌّ لم يُسنَد له ← 403** — الإسنادُ مخزنٌ بعينه لا الشركةُ كلها | لا |
| `apps/api/src/routes/userAssignmentEnd.integration.test.ts` | 128 | **وإنهاءٌ ثانٍ ← 422** — لا يُنهى ما انتهى | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 215 | **مشرفٌ يُسنِد طبيبًا يراه ← 403 من حدّ «المرّبين فقط»** | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 228 | **مشرفٌ يُسنِد مخزنَ موقعه لمربٍّ ← 403 — الإسناد للمالك وحده** | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 272 | **مربٍّ ← مزرعة: 422** — المستوى لا يقبله الدور | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 284 | **مالكٌ ← أي مستوى: 422** — لا مستوى له، ورؤيته بدوره لا بصفّ | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 298 | **مشرف ← المخزن المركزي: 422** — المركزيّ لأمين المخزن لا له (254) | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 304 | **مربٍّ ← مخزن موقع: 422** — الدور لا يقبل مستوى المخزن أصلًا | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 338 | **وأمين المخزن ← مخزن الموقع: 422** — نوعُ المخزن لا يوافق دوره | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 344 | **وأمين المخزن ← مزرعة: 422** — الدور لا يقبل مستوى المزرعة أصلًا | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 350 | **وأمين المخزن ← عنبر: 422** — ولا يرى العنابر أصلًا (#161 «سابعًا») | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 395 | **بدايةٌ غدًا ← 422** — والنموذج يحتملها، والمنع في المسار وحده | لا |
| `apps/api/src/routes/userAssignments.integration.test.ts` | 401 | **وبدايةٌ بالأمس ← 422** — إسنادٌ بأثر رجعي يدّعي مسؤوليةً عن يومٍ مضى | لا |
| `apps/api/src/routes/users.integration.test.ts` | 248 | **ومشرفٌ يُنشئ مشرفًا ← 403 من حدّ «المرّبين فقط»** | لا |
| `apps/api/src/routes/users.integration.test.ts` | 308 | **والإلزام أثرٌ لا حقل**: يدخل بكلمته ثم يُحجب عن كل مسار سوى التغيير | لا |
| `apps/api/src/routes/users.integration.test.ts` | 384 | **تعطيل الذات ← 422** — والمالك يبقى فعّالًا في القاعدة | لا |
| `apps/api/src/routes/usersCreateWithAssignment.integration.test.ts` | 156 | **مستوًى لا يقبله الدور ← 422 ولا مستخدم يُنشأ** | لا |
| `apps/api/src/routes/usersCreateWithAssignment.integration.test.ts` | 181 | **بدايةٌ ليست اليوم ← 422 ولا مستخدم يُنشأ** | لا |
| `apps/api/src/scripts/platformEmergencyReset.integration.test.ts` | 138 | المدير يدخل بالمؤقتة ويُحجب عن كل مسار عدا التغيير | لا |
