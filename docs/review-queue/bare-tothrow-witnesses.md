# البند السادس — شواهدُ تؤكّد `toThrow()` بلا حجّة

**المعيار — يُحفظ كي يُعاد إنتاج الرقم** (درس 266، وحكم 272):

1. كلُّ سطرٍ يحوي `toThrow()` **بلا حجّة إطلاقًا** في ملفات `*.test.ts` تحت
   `apps/api/src` و`packages/*/src`.
2. **و«يسمّي رادًّا»** = عنوانُ الاختبار الحاوي يحوي إحدى الكلمات:
   «المفتاح المركَّب» · «القيد» · «الفهرس» · «يرفضه» · «يرفض» · `CHECK` ·
   «الحارس» · «الرادّ» · «الرادُّ» · `_ck` · `_uq` · `_fk` · `_ex`.
3. **والعنوان يُنسب بأقرب `it(`/`test(` أعلاه** — والملفُّ الوحيد الذي يستعمل
   `it.each` في هذه المجموعة `lib/tempPassword.test.ts`، **ولا يدّعي أيٌّ من
   مواضعه الثلاثة تسميةً**، فعطبُ الاستخراج في 271 لا يمسّ هذا الرقم.

## الحصيلة

| | العدد | الوسم |
|---|---|---|
| `toThrow()` بلا حجّة | **٩٤** | **مقيس** — سكربتٌ · وقراءةُ ملفٍ كامل بالعين · وتحقُّقُ `it.each` |
| منها عنوانُه يسمّي رادًّا | **٥٧** | **غير مصدَّق** — معيارُه قائمةُ كلماتٍ نصّية، **طريقٌ واحدة على سطحٍ واسع** (272) |

## العلّة

**الشكل الثاني من صنف 242 على حرفه — «شاهدٌ لا يفرّق»:** العنوانُ يقول «يرفضه
المفتاح المركَّب» **والتأكيد لا يسمّي شيئًا**، **فيبقى أخضر لو ردّ قيدٌ آخر**
— أو `NOT NULL`، أو خطأُ صياغةٍ في الاستعلام نفسه.

**وخارج مسح 271** لأن معياره كان **رموز HTTP** (403/422) لا **رفضَ القاعدة**.

## الحدّ — ولماذا لا تُراجَع الآن

**حكم المالك (القرار 276): بندٌ سادس في الطابور بحدّه، ولا يُراجَع الآن.**
**والعلّة أن معيار الـ٥٧ نفسه طريقٌ واحدة على سطحٍ واسع** — وهو ما يمنعه
حكمُ 272: **لا يُوثق بمخرَج آلةٍ واحدة على سطحٍ واسع؛ طريقان أو وسمُ «غير
مصدَّق»**.

**فمن يراجعها يبدأ بتصديق المعيار لا بإصلاح المواضع.**

## الأداةُ التي أنتجت الرقم

```
toThrow() بلا حجّة، مع عنوانِ أقرب it(/test( أعلاه،
ثم مطابقةُ العنوان بقائمة الكلمات أعلاه.
```

## التوزيع بالملفات (يسمّي رادًّا / المجموع)

  0/  3  apps/api/src/lib/tempPassword.test.ts
  0/  2  apps/api/src/routes/platformAdminRemoval.integration.test.ts
  1/  1  apps/api/src/schema/bagWeight.integration.test.ts
  9/ 10  apps/api/src/schema/emptyBags.integration.test.ts
 14/ 22  apps/api/src/schema/externalIssue.integration.test.ts
 13/ 13  apps/api/src/schema/farmerRequests.integration.test.ts
  0/ 10  apps/api/src/schema/housePrep.integration.test.ts
  2/  3  apps/api/src/schema/ledgerAddressing.integration.test.ts
  4/  4  apps/api/src/schema/supplierCarrier.integration.test.ts
  5/  5  apps/api/src/schema/systemProducts.integration.test.ts
  9/  9  apps/api/src/schema/tenantIdChildTables.integration.test.ts
  0/ 11  apps/api/src/schema/warehouseModel.integration.test.ts
  0/  1  apps/api/src/scripts/platformEmergencyReset.integration.test.ts
