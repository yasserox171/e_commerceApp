<div dir="rtl">

# 9ri3a · منصة تجارة إلكترونية بتطبيقين

مشروع monorepo فيه **تطبيقين موبايل** كيخدمو على **نفس قاعدة بيانات PostgreSQL**:

| التطبيق | الجمهور | اللون الأساسي | الحزمة |
|---|---|---|---|
| **9ri3a** | تجار الجملة — بيع بالكميات | أزرق مجدولي `#1D4ED8` | `ma.qri3a.wholesale` |
| **9ri3a espress** | المستهلك النهائي — بيع بالتجزئة | تيراكوتا `#C2410C` | `ma.qri3a.express` |

بينهم **API واحد** (Express + PostgreSQL) و **حزمة UI مشتركة** فيها الهوية البصرية والمكونات.

</div>

```
ecommerce-project/
├── apps/
│   ├── wholesale/          # 9ri3a        — Expo SDK 57 + expo-router
│   └── dropshipping/       # 9ri3a espress — Expo SDK 57 + expo-router
├── packages/
│   └── shared-ui/          # design system + RTL + API client + hooks
├── backend/
│   └── api/                # Express 5 + PostgreSQL + CMI/Stripe
├── db/
│   ├── migrations/         # SQL يُشغَّل بترتيب أبجدي
│   └── reference/          # مخطط products المرجعي (لا يُشغَّل تلقائياً)
└── README.md
```

---

<div dir="rtl">

## ⚡ التشغيل السريع

</div>

```bash
git clone https://github.com/yasserox171/e_commerceApp.git
cd e_commerceApp
npm install

# 1. إعداد الـ API
cp backend/api/.env.example backend/api/.env
$EDITOR backend/api/.env          # عمّر DATABASE_URL و JWT_SECRET

# 2. إنشاء جداول الطلبات على قاعدة البيانات
npm run db:migrate

# 3. تشغيل الـ API
npm run api:dev                   # http://localhost:4000

# 4. تشغيل التطبيقات (في نافذتين أخريين)
npm run wholesale
npm run dropshipping
```

<div dir="rtl">

> هاد التطبيقات كتستعمل وحدات أصلية (`react-native-webview`، و plugin ديال RTL)
> اللي **Expo Go ما يقدرش يشغلهم**. `npm run wholesale` كيقلع Metro فقط — باش
> تشغلهم على جهاز خاصك **development build**:
> `npm run android --workspace @ecommerce/wholesale` (كيتطلب Android SDK محلياً)،
> ولا حمّل APK من GitHub Actions (شوف الأسفل).

</div>

<div dir="rtl">

> **تحقق سريع:** افتح `http://localhost:4000/health` — خاصك تشوف `"database": { "ok": true }`.

### معاينة التصميم فالمتصفح

بغيتي تشوف الشاشات بسرعة بلا جهاز ولا APK؟ التطبيقان كيخدمو على الويب عبر
React Native Web:

</div>

```bash
cd apps/wholesale     && npx expo start --web --port 8081
cd apps/dropshipping  && npx expo start --web --port 8082
```

<div dir="rtl">

صغّر نافذة المتصفح لحجم هاتف (390×844) باش تشوف التخطيط الحقيقي. الويب هنا
**للمعاينة فقط** — التوصيل النهائي هو APK. فرقان مهمان:

- الجلسة كتتخزن ف `localStorage` بدل `expo-secure-store` (شوف
  [`sessionStore.ts`](packages/shared-ui/src/api/sessionStore.ts))
- `react-native-webview` ما كيخدمش على الويب، يعني صفحة الدفع ديال CMI
  كتظهر غير على الجهاز

</div>

---

<div dir="rtl">

## 🗄️ قاعدة البيانات

جدول `public.products` **موجود مسبقاً** على الـ VPS وكيتعمّر من pipeline خارجي.
هاد المشروع **ما كيبدلوش أبداً** — غير كيقرا منه.

كل ما هو جديد (مستخدمين، سلة، طلبات، أداءات) كيتزاد ف schema مستقلة سميتها `commerce`،
باش ما يوقعش أي تصادم مع الجداول الموجودة ف `public`.

</div>

```
public.products          ← للقراءة فقط
commerce.users           commerce.carts / cart_items
commerce.addresses       commerce.orders / order_items
commerce.payments        commerce.order_events
commerce.schema_migrations
```

```bash
npm run db:migrate           # يطبّق كل ما لم يُطبّق (idempotent)
npm run db:migrate:status    # يعرض المطبّق والمعلّق
```

<div dir="rtl">

الـ runner كيسجل SHA-256 ديال كل ملف، وإلا تبدل ملف مطبّق من قبل كيوقف بخطأ واضح
بدل ما يتجاهلو بصمت. التفاصيل الكاملة و اتفاقيات `extra_info` ف [`db/README.md`](db/README.md).

### `extra_info` — مرن بالتصميم

`extra_info` هو `jsonb` حر. الـ API كيقراه بمرونة (كيجرب عدة أسماء مفاتيح شائعة)
وإلا ما لقا والو كيرجع لقيم افتراضية آمنة — **منتج بـ `extra_info` خاوي كيتعرض عادي**.

</div>

```jsonc
{
  "min_order_quantity": 12,                    // moq | minOrderQuantity | min_qty
  "price_tiers": [                             // tiers | bulk_pricing | quantity_breaks
    { "min_quantity": 12,  "unit_price": 45.00 },
    { "min_quantity": 60,  "unit_price": 41.50 },
    { "min_quantity": 240, "unit_price": 38.00 }
  ],
  "supplier": "Atlas Textile",                 // vendor | brand | manufacturer
  "subcategory": "ملابس",                       // product_type | type | collection
  "unit": "قطعة", "stock": 5000,
  "retail_price": 179.00,                      // السعر قبل التخفيض
  "shipping_days": 3, "sku": "WTC-001",
  "colors": ["أبيض", "أزرق"], "sizes": ["M", "L", "XL"]
}
```

<div dir="rtl">

أي مفتاح آخر ما كيتضيعش — كيبان تلقائياً ف شاشة تفاصيل المنتج كسطر مواصفات،
يعني تقدر تزيد حقول جديدة فالـ pipeline بلا ما تلمس كود التطبيق.

</div>

---

<div dir="rtl">

## 💳 الدفع — بطاقة مسبقة الدفع فقط

**الدفع عند الاستلام (COD) ممنوع تماماً**، ومطبّق على ثلاث مستويات:

1. **قاعدة البيانات** — `commerce.payment_method` هو enum فيه غير `card` و `bank_transfer`.
   ما كايناش قيمة `cod` أصلاً، يعني ما يمكنش يتسجل حتى لو حاول أحد.
2. **قيد CHECK** — `channel <> 'dropshipping' OR payment_method = 'card'`.
3. **الـ API** — كيرفض أي طريقة دفع غير البطاقة فتطبيق التجزئة.

### بوابة الدفع: CMI (مع طبقة تجريد)

</div>

```
apps/dropshipping                backend/api                     CMI
      │                               │                            │
      │ POST /orders                  │                            │
      │──────────────────────────────>│  ينشئ الطلب (pending_payment)
      │ POST /payments/checkout       │                            │
      │──────────────────────────────>│  يوقّع الحقول (SHA-512 ver3)
      │<──────────────────────────────│  { url, fields, hash }
      │                                                            │
      │  WebView ← form POST ────────────────────────────────────> │  صفحة البطاقة + 3D Secure
      │                                                            │
      │                               │<───── callback (موقّع) ─────│  ← المصدر الموثوق
      │                               │  يتحقق من التوقيع + المبلغ
      │                               │  الطلب → processing
      │<─── deep link qri3aespress:// ─────────────────────────────│
```

<div dir="rtl">

**رقم البطاقة ما كيمرش أبداً عبر التطبيق ولا عبر الـ API** — كيتكتب مباشرة ف صفحة CMI
داخل الـ WebView. هادشي كيخرّج المشروع من نطاق PCI-DSS.

الحماية المطبّقة:

- كل رد من البوابة كيتحقق منه بـ **SHA-512 ver3 hash** قبل ما يتوثق فيه — callback مزوّر كيرجع `403`
- callback بمبلغ مختلف على مجموع الطلب كيترفض بـ `422`
- إعادة إرسال نفس الـ callback **idempotent** — ما كيزيدش حدث ثاني فالتتبع
- الـ **server-to-server callback** هو المصدر الموثوق، ماشي رجوع المتصفح

### تبديل البوابة

`PaymentProvider` interface ف [`backend/api/src/domain/payments/provider.ts`](backend/api/src/domain/payments/provider.ts).
باش تزيد بوابة جديدة: طبّق الـ interface، سجّلها ف `registry.ts`، زيد اسمها ف enum ديال
`PAYMENT_PROVIDER`. **ما كيتبدلش والو** ف التطبيقات ولا فمخطط قاعدة البيانات.

جاهز حالياً: `cmi` (افتراضي) و `stripe` (adapter اختياري).

</div>

---

<div dir="rtl">

## 📱 بناء ملفات APK

عندك **طريقتين**. الأولى ما كتطلب لا حساب Expo لا خلاص.

### الطريقة 1 — GitHub Actions (موصى بها، مجانية)

</div>

[`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) كيولّد المشروع
الأصلي بـ `expo prebuild` وكيبنيه بـ Gradle على runner ديال GitHub (فيه Android SDK مثبت).

<div dir="rtl">

من واجهة GitHub: **Actions → Build Android APK → Run workflow**، وعمّر:

| الحقل | الوصف |
|---|---|
| `app` | `both` ولا تطبيق واحد |
| `api_url` | عنوان الـ API — **كيتدمج فالـ APK**، خاصو يكون متاح من الهاتف |
| `build_type` | `release` (للتثبيت) ولا `debug` |

ولا من الطرفية:

</div>

```bash
gh workflow run build-apk.yml \
  -f app=both \
  -f api_url=https://api.your-domain.ma \
  -f build_type=release
```

<div dir="rtl">

منين يكمل، حمّل الـ APK من **Artifacts** ديال الـ run. البناء موقّع بمفتاح debug —
**كيتثبت عادي للاختبار**، لكن ماشي صالح للنشر على Google Play (شوف الأسفل).

> ⚠️ `api_url` كيتدمج فالحزمة وقت البناء. `http://localhost` ولا `10.0.2.2`
> ما غاديش يخدمو على هاتف حقيقي — استعمل عنوان LAN (`http://192.168.x.x:4000`)
> ولا دومين حقيقي.

### الطريقة 2 — EAS Build (كتطلب حساب Expo)

</div>

```bash
npm install -g eas-cli
eas login

# أول مرة فقط — لكل تطبيق على حدة
cd apps/wholesale     && eas init
cd ../dropshipping    && eas init
```

<div dir="rtl">

قبل البناء، ضبط عنوان الـ API فـ `eas.json` (المفتاح `EXPO_PUBLIC_API_URL` تحت `build.base.env`)
باش الـ APK يشير للخادم الحقيقي ماشي لـ localhost.

</div>

```bash
# APK للتثبيت المباشر (اختبار / توزيع داخلي)
cd apps/wholesale     && eas build --platform android --profile preview
cd apps/dropshipping  && eas build --platform android --profile preview

# AAB للنشر على Google Play
eas build --platform android --profile production
```

<div dir="rtl">

أو من جذر المشروع:

</div>

```bash
npm run build:apk --workspace @ecommerce/wholesale
npm run build:apk --workspace @ecommerce/dropshipping
```

<div dir="rtl">

| Profile | المخرج | الاستعمال |
|---|---|---|
| `development` | APK + dev client | التطوير على جهاز حقيقي |
| `preview` | **APK** | اختبار / توزيع مباشر |
| `production` | AAB | Google Play |

بناء محلي بلا سيرفرات EAS (كيتطلب Android SDK):

</div>

```bash
eas build --platform android --profile preview --local
```

<div dir="rtl">

### التوقيع للنشر على Google Play

البناءات ديال GitHub Actions موقّعة بمفتاح debug ديال قالب Expo — كافي للاختبار،
لكن Google Play كيرفضو. باش تنشر:

</div>

```bash
# 1. ولّد مفتاح رفع (احتفظ به — ضياعه يعني ما تقدرش تحدّث التطبيق أبداً)
keytool -genkeypair -v -keystore upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000

# 2. حوّله لـ base64 وحطه ف GitHub → Settings → Secrets → Actions
base64 -w0 upload.jks
```

<div dir="rtl">

ثم زيد الأسرار `ANDROID_KEYSTORE_BASE64` و `ANDROID_KEYSTORE_PASSWORD` و
`ANDROID_KEY_ALIAS` و `ANDROID_KEY_PASSWORD`، وعدّل خطوة البناء فالـ workflow
باش تفك ترميز الـ keystore وتمرّرو لـ Gradle. أو ببساطة استعمل
`eas build --profile production` اللي كيدبّر التوقيع بوحدو.

</div>

---

<div dir="rtl">

## 🎨 التصميم

البحث على اتجاهات 2026 اللي طُبّقت:

- **Bottom navigation** بخمس وجهات كلها ف نطاق الإبهام (thumb zone)
- **Bottom sheets** بدل شاشات كاملة للمحتوى الثانوي (فلاتر، دفع، كمية)
- **Micro-interactions** — انكماش خفيف عند الضغط + haptics عند الإضافة للسلة
- **Minimalism** — بطاقات بحدود رفيعة بدل ظلال ثقيلة، تايبوغرافي عريضة، مساحات بيضاء
- **Skeleton loaders** بنفس أبعاد المحتوى النهائي باش الصفحة ما تقفزش عند التحميل

### الهوية البصرية

مستوحاة من الزليج المغربي: **تيراكوتا** + **أزرق مجدولي** على خلفية **رملية**.
الأيقونة هي **خاتم** (نجمة ثمانية) — نفس الشكل بلونين مختلفين لكل تطبيق.

كل شي معرّف ف [`packages/shared-ui/src/theme/`](packages/shared-ui/src/theme/) كـ tokens،
مع دعم كامل للوضع الداكن.

### دعم العربية (RTL)

RTL مفعّل **على المستوى الأصلي** عبر plugin ديال `expo-localization`:

</div>

```ts
['expo-localization', { supportsRTL: true, forcesRTL: true, supportedLocales: ['ar', 'fr'] }]
```

<div dir="rtl">

يعني التطبيق RTL من أول تشغيل بلا ما يتطلب إعادة تشغيل. زيادة على هادشي:

- `enableRTL()` وقت التشغيل كشبكة أمان (معاينة الويب، وأول إقلاع بعد التثبيت)
- الأسعار كتبقى LTR داخل واجهة RTL — `45,00 د.م.` معكوسة كتقرا كرقم آخر
- تنسيق التواريخ والجمع بالعربية مكتوب يدوياً (مثنى، جمع 3-10، جمع 11+) بلا `Intl`
  حيت Hermes عندو ICU ناقص وكيختلف من جهاز لآخر
- أسماء الشهور مغربية (يناير، فبراير، مارس، أبريل، ماي، يونيو، يوليوز، غشت، شتنبر، أكتوبر، نونبر، دجنبر)

</div>

---

<div dir="rtl">

## 🔌 الـ API

</div>

| Method | Endpoint | الوصف |
|---|---|---|
| `GET` | `/health` | حالة الخدمة + اتصال قاعدة البيانات |
| `GET` | `/products?channel=…` | كتالوج مع بحث، فلترة، ترتيب، ترقيم |
| `GET` | `/products/facets?channel=…` | الموردون والفئات ونطاق السعر المتاح |
| `GET` | `/products/:id?quantity=…` | تفاصيل المنتج + تسعيرة عند كمية معيّنة |
| `POST` | `/auth/register` · `/auth/login` | إنشاء حساب / دخول (JWT) |
| `GET` `PATCH` | `/auth/me` | الملف الشخصي |
| `GET` `POST` `PATCH` `DELETE` | `/cart` · `/cart/items/:id` | السلة (تُسعَّر من جديد في كل قراءة) |
| `POST` `GET` | `/orders` · `/orders/:id` | إنشاء وعرض الطلبات |
| `POST` | `/orders/:id/cancel` | إلغاء (قبل الدفع فقط) |
| `GET` | `/payments/methods` | البوابة النشطة + تأكيد منع COD |
| `POST` | `/payments/checkout` | بدء جلسة دفع |
| `POST` | `/payments/cmi/callback` | إشعار CMI (موقّع) |

<div dir="rtl">

### مبادئ

- **الأسعار ما كتجيش أبداً من العميل** — التطبيق كيرسل غير `productId` و `quantity`،
  والخادم كيحسب من الكتالوج الحي داخل نفس الـ transaction
- الحساب مربوط بقناة واحدة — token ديال الجملة ما يقدرش يدير طلب تجزئة
- كل الأخطاء بنفس الشكل: `{ error: { code, message, details? } }`
- rate limiting على endpoints ديال كلمة السر فقط

تفاصيل كاملة ف [`backend/api/README.md`](backend/api/README.md).

</div>

---

<div dir="rtl">

## ⚙️ متغيرات البيئة

**ولا واحد من الملفات المعمّرة (`.env`) كيتسجل ف git** — غير `.env.example`.

### `backend/api/.env`

</div>

| المتغير | مطلوب | الوصف |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | ✅ | 32 حرف على الأقل — `openssl rand -base64 48` |
| `DATABASE_SSL` | — | `disable` \| `require` \| `verify-full` |
| `PORT` · `CORS_ORIGINS` | — | إعدادات الخادم |
| `PAYMENT_PROVIDER` | — | `cmi` (افتراضي) \| `stripe` |
| `PUBLIC_API_URL` | ✅ للدفع | https في الإنتاج — البوابة كتتصل بيه |
| `CMI_CLIENT_ID` · `CMI_STORE_KEY` | ✅ للدفع | من CMI بعد توقيع العقد |
| `CMI_GATEWAY_URL` | — | test أو live |
| `PRODUCT_HIDDEN_STATUSES` | — | حالات المنتجات المخفية |

<div dir="rtl">

### `apps/*/.env`

</div>

| المتغير | الوصف |
|---|---|
| `EXPO_PUBLIC_API_URL` | عنوان الـ API. **يُدمج في الـ APK** — ما تحطش فيه أسرار |

<div dir="rtl">

> `EXPO_PUBLIC_*` كيتدمجو فالحزمة وقت البناء وأي واحد عندو الـ APK يقدر يقراهم.
> كل الأسرار (مفتاح CMI، اتصال قاعدة البيانات) كيبقاو على الخادم فقط.
>
> إلا ما عمّرتيش `.env` فالتطبيق، كيدير fallback ذكي: كياخذ عنوان الجهاز اللي مشغّل
> Metro، يعني clone جديد كيخدم مع API محلي بلا أي إعداد.

</div>

---

<div dir="rtl">

## 🔍 الاختبار والتحقق

</div>

```bash
npm run typecheck                                   # كل الحزم
npm test --workspace @ecommerce/api                 # 22 اختبار وحدة
```

<div dir="rtl">

الاختبارات كتغطي الجزء اللي أصعب تشوفو بالعين:

- **hash ديال CMI** — متقارن مع تطبيق مستقل للخوارزمية الموثقة (NestPay v3)،
  مع تحقق من الـ escaping (`|` و `\`) واستقلالية ترتيب المفاتيح
- **محلل `extra_info`** — كل الأشكال اللي ممكن يرسلها الـ pipeline، بما فيها المشوّهة

تم التحقق كذلك يدوياً من التدفق الكامل على PostgreSQL حقيقية (45 فحص): تسجيل،
سلة، إنشاء طلب، جلسة دفع موقّعة، رفض callback مزوّر (403)، رفض مبلغ مخالف (422)،
تأكيد الطلب عبر callback صحيح، و idempotency عند إعادة الإرسال.

</div>

---

<div dir="rtl">

## 🧱 التقنيات

</div>

| الطبقة | التقنية |
|---|---|
| الموبايل | Expo SDK 57 · React Native 0.87 · expo-router 57 · React 19.2 |
| البيانات | TanStack Query 5 · expo-secure-store |
| الخادم | Node 22 · Express 5 · TypeScript 5.9 · zod 4 · pg 8 |
| قاعدة البيانات | PostgreSQL (16+ موصى به) |
| الدفع | CMI (NestPay 3D_PAY_HOSTING) · Stripe (اختياري) |
| البناء | EAS Build · npm workspaces |

---

<div dir="rtl">

## 🚀 التوسّع

المشروع مبني باش يتزاد فيه:

- **بوابة دفع جديدة** → طبّق `PaymentProvider`، سجّلها، خلاص
- **حقول منتجات جديدة** → زيدهم فـ `extra_info`، كيبانو تلقائياً فشاشة التفاصيل
- **مكوّن جديد** → زيدو ف `packages/shared-ui`، كيوصل للتطبيقين فوراً بلا build step
- **endpoint جديد** → كل نطاق (`domain/`) مستقل بـ routes + service + repo ديالو
- **لغة جديدة** → النصوص مجمّعة، و RTL/LTR مدبّر عبر `rtl` helpers

</div>

---

<div dir="rtl">

## 📄 الرخصة

مشروع خاص. كل الحقوق محفوظة.

</div>
