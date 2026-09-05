# قاعدة البيانات · Database

<div dir="rtl">

## نظرة عامة

قاعدة البيانات موجودة مسبقاً على الـ VPS وفيها جدول `public.products` كيتعمّر من pipeline خارجي.
هاد المشروع **ما كيبدلش** `public.products` — غير كيقرا منه.

كلشي اللي كيحتاجوه التطبيقين (مستخدمين، سلة، طلبات، أداءات) كيتزاد ف schema مستقلة سميتها
`commerce`، باش ما يكون حتى تصادم مع أي جدول موجود ف `public`.

</div>

```
public.products      ← موجود، للقراءة فقط (owned by the ingestion pipeline)
commerce.users
commerce.addresses
commerce.carts / commerce.cart_items
commerce.orders / commerce.order_items
commerce.payments
commerce.order_events
commerce.schema_migrations   ← سجل الـ migrations
```

## تشغيل الـ migrations

```bash
cp backend/api/.env.example backend/api/.env   # عمّر DATABASE_URL
npm run db:migrate                             # يطبّق كل ما لم يُطبّق
npm run db:migrate:status                      # يعرض المطبّق والمعلّق
```

الـ runner:

- كيمشي بالترتيب الأبجدي ديال أسماء الملفات (`0001_`, `0002_`, …)
- كل ملف كيتشغل داخل transaction واحدة — إلا طاح، كيرجع كلشي لور
- كيسجل checksum (SHA‑256) ديال كل ملف، وإلا تبدل ملف مطبّق من قبل كيوقف بخطأ واضح
- **idempotent**: تقدر تعاود تشغلو بلا خوف

## `extra_info` — الاتفاقيات المتوقعة

<div dir="rtl">

`extra_info` هو `jsonb` حر. الـ API كيقراه بمرونة: كيجرب عدة أسماء مفاتيح شائعة
وإلا ما لقا والو كيرجع لقيم افتراضية آمنة. **ما كيفشلش** إلا كان الحقل خاوي أو ناقص.

</div>

المفاتيح المستعملة (كلها اختيارية):

| المفتاح | البدائل المقبولة | الاستعمال |
|---|---|---|
| `min_order_quantity` | `moq`, `minOrderQuantity`, `min_qty`, `minimum_order` | الحد الأدنى للطلب (جملة) |
| `price_tiers` | `tiers`, `wholesale_tiers`, `bulk_pricing`, `quantity_breaks` | تسعير حسب الكمية |
| `supplier` | `vendor`, `supplier_name`, `brand` | المورّد (فلترة الجملة) |
| `subcategory` | `sub_category`, `product_type`, `type` | الفئة الفرعية |
| `tags` | `keywords`, `labels` | وسوم للبحث |
| `stock` | `quantity_available`, `inventory`, `stock_quantity` | المخزون |
| `unit` | `unit_label`, `packaging` | الوحدة (قطعة، كرطونة…) |
| `retail_price` | `compare_at_price`, `msrp`, `original_price` | السعر قبل التخفيض |
| `shipping_days` | `delivery_days`, `lead_time_days` | مدة التوصيل التقديرية |

### شكل `price_tiers`

<div dir="rtl">

الـ parser كيقبل جوج أشكال. الأول (الموصى به) لائحة ديال objects:

</div>

```json
{
  "min_order_quantity": 12,
  "price_tiers": [
    { "min_quantity": 12,  "unit_price": 45.00 },
    { "min_quantity": 60,  "unit_price": 41.50 },
    { "min_quantity": 240, "unit_price": 38.00 }
  ]
}
```

<div dir="rtl">

والثاني object بسيط (المفتاح = الكمية الدنيا، القيمة = ثمن الوحدة):

</div>

```json
{ "price_tiers": { "12": 45.00, "60": 41.50, "240": 38.00 } }
```

<div dir="rtl">

أسماء الحقول داخل كل tier فيها مرونة حتى هي: `min_quantity` / `min_qty` / `from` / `qty`،
و `unit_price` / `price` / `unit` / `amount`.

إلا ما كانش `price_tiers`، الـ API كيبني tier وحيد من `products.price` مع
`min_quantity = min_order_quantity` (أو 1). يعني التطبيق كيخدم حتى إلا كان
`extra_info` خاوي بالكامل.

</div>

## ممنوع الدفع عند الاستلام (No COD)

<div dir="rtl">

`commerce.payment_method` هو enum فيه غير `'card'` و `'bank_transfer'` — ما كايناش قيمة
`'cod'` أصلاً، يعني الدفع عند الاستلام **ما يمكنش يتسجل** ف قاعدة البيانات.

وزيادة على هادشي، كاين constraint:

</div>

```sql
CONSTRAINT orders_dropshipping_is_prepaid_card
  CHECK (channel <> 'dropshipping' OR payment_method = 'card')
```

<div dir="rtl">

يعني كل طلب ديال تطبيق الإسقاط خاصو يكون مدفوع بالبطاقة مسبقاً. الحماية ف
قاعدة البيانات، ماشي غير ف الواجهة.

</div>
