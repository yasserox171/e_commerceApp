# دليل النشر على الـ VPS — واجهة 9ri3a البرمجية (API)

هذا الدليل يأخذك من سيرفر Ubuntu فارغ إلى واجهة برمجية تعمل على
`https://api.your-domain.ma`، ويقرأ من قاعدة بيانات PostgreSQL الحقيقية،
ويخدم التطبيقين معاً.

نفّذ الخطوات بالترتيب. كل خطوة تنتهي بأمر تحقّق — لا تنتقل إلى التالية قبل أن
ترى نتيجته الصحيحة.

**المدّة المتوقّعة:** ‏30 إلى 45 دقيقة في المرة الأولى، ثم أقل من دقيقة لكل
تحديث لاحق (`deploy.sh`).

---

## ما تحتاجه قبل أن تبدأ

| # | المطلوب | ملاحظة |
|---|---------|--------|
| 1 | سيرفر Ubuntu 22.04 أو 24.04 مع صلاحية `sudo` | نواتان و 2 GB ذاكرة تكفي بسهولة |
| 2 | PostgreSQL يعمل على نفس السيرفر، وبه جدول `products` المملوء | هذا هو مصدر المنتجات |
| 3 | **اسم مضيف**، لا عنوان IP فقط | لا توجد شهادة HTTPS لعنوان IP — [تفاصيل والبديل المجاني](#9-الوكيل-العكسي-و-https) |
| 4 | إمكانية استنساخ المستودع على السيرفر | مفتاح نشر (deploy key) أو مستودع عام |

> **بيانات CMI ليست مطلوبة الآن.** الواجهة تعمل بدونها: الكتالوج والحسابات
> والسلة وسجلّ الطلبات كلها تشتغل، والدفع وحده يردّ `503` مع رسالة واضحة حتى
> تملأ المفاتيح. راجع [الخطوة 11](#11-تفعيل-الدفع-لاحقاً) عندما يجهز العقد.

---

## 1. مستخدم النظام والمجلدات

الواجهة لا تعمل بصلاحية `root`. أنشئ مستخدماً بلا صدفة (shell) ولا كلمة مرور:

```bash
sudo adduser --system --group --home /srv/qri3a --shell /usr/sbin/nologin qri3a
sudo install -d -m 0755 -o qri3a -g qri3a /srv/qri3a
```

`--system` يمنع تسجيل الدخول به، و `--group` ينشئ مجموعة `qri3a` التي سنعطيها
لاحقاً حقّ قراءة ملف الأسرار.

**تحقّق:**

```bash
id qri3a
```

---

## 2. تثبيت Node.js 22

مستودعات Ubuntu تحمل نسخة قديمة جداً. استعمل مستودع NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
```

**تحقّق:** يجب أن يظهر الإصدار 22 أو أحدث (الحدّ الأدنى 20).

```bash
node -v && npm -v
```

---

## 3. تجهيز قاعدة البيانات

الواجهة تنشئ مخطّطاً (schema) خاصاً اسمه `commerce` ولا تلمس جداولك الحالية في
`public` إلا بالقراءة. أنشئ دوراً (role) مخصّصاً لها بدل استعمال `postgres`:

```bash
# ولّد كلمة مرور قوية واحتفظ بها — ستحتاجها في الخطوة 4
openssl rand -base64 32
```

```bash
sudo -u postgres psql
```

داخل `psql` (بدّل `اسم_قاعدتك` و `كلمة_المرور_المولّدة`):

```sql
CREATE ROLE qri3a_api LOGIN PASSWORD 'كلمة_المرور_المولّدة';

-- الاتصال بالقاعدة التي تحوي جدول products
\c اسم_قاعدتك

-- إنشاء المخطّط وتمليكه للدور، حتى يستطيع تنفيذ الترحيلات (migrations)
CREATE SCHEMA IF NOT EXISTS commerce AUTHORIZATION qri3a_api;
GRANT CONNECT ON DATABASE اسم_قاعدتك TO qri3a_api;

-- قراءة فقط على الكتالوج الموجود: الواجهة لا تعدّل منتجاتك أبداً
GRANT USAGE ON SCHEMA public TO qri3a_api;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qri3a_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO qri3a_api;

\q
```

> **لماذا `SELECT` فقط على `public`؟** لأن أسوأ خطأ ممكن في هذه الواجهة يجب ألّا
> يكون قادراً على حذف كتالوجك. كل ما تكتبه الواجهة (المستخدمون، السلال، الطلبات،
> المدفوعات) يعيش داخل `commerce` وحده.

**تحقّق:** الاتصال بالدور الجديد مباشرة.

```bash
PGPASSWORD='كلمة_المرور_المولّدة' psql -h 127.0.0.1 -U qri3a_api -d اسم_قاعدتك \
  -c 'SELECT count(*) FROM public.products;'
```

إن ظهر عدد المنتجات فالصلاحيات صحيحة.

### 3.1 فهارس البحث (اختياري، لكن مستحسن)

بناء فهرس على جدول يتطلّب ملكيته، والدور `qri3a_api` لا يملك `public.products`
عمداً. لذلك تتخطّى الترحيلة `0002` إنشاء الفهارس بهدوء وتكتفي بإشعار. كل شيء
يعمل بدونها، لكن الاستعلامات تصبح مسحاً تسلسلياً — وهذا يبدأ في الإزعاج مع بضعة
آلاف من المنتجات.

نفّذ هذا الملف مرة واحدة كمالك الجدول (عادةً `postgres`) بعد الخطوة 4:

```bash
sudo -u postgres psql -d اسم_قاعدتك -f /srv/qri3a/deploy/sql/products-search-indexes.sql
```

يستعمل الملف `CONCURRENTLY`، فالمتجر يبقى يقرأ ويكتب أثناء البناء، والأمر
قابل لإعادة التنفيذ بلا ضرر.

**تحقّق:** يجب أن تظهر ستة فهارس.

```bash
sudo -u postgres psql -d اسم_قاعدتك \
  -c "SELECT indexname FROM pg_indexes WHERE tablename='products';"
```

---

## 4. استنساخ المشروع

```bash
sudo -H -u qri3a git clone https://github.com/yasserox171/e_commerceApp.git /srv/qri3a
cd /srv/qri3a
sudo -H -u qri3a git checkout claude/ecommerce-wholesale-dropshipping-je8lgh
```

**تحقّق:**

```bash
ls /srv/qri3a/backend/api/package.json
```

---

## 5. ملف الأسرار

الأسرار توضع **خارج** مجلّد المشروع، في `/etc/qri3a/api.env`. هكذا لا يستطيع
`git pull` أن يمسحها، ولا يسرّبها المستودع لو تسرّب:

```bash
sudo install -d -m 0750 -o root -g qri3a /etc/qri3a
sudo cp /srv/qri3a/backend/api/.env.production.example /etc/qri3a/api.env
sudo chown root:qri3a /etc/qri3a/api.env
sudo chmod 0640 /etc/qri3a/api.env
```

ولّد مفتاح التوقيع:

```bash
openssl rand -base64 48
```

ثم حرّر الملف:

```bash
sudo nano /etc/qri3a/api.env
```

القيم التي **يجب** تغييرها:

| المفتاح | القيمة |
|---------|--------|
| `DATABASE_URL` | `postgresql://qri3a_api:كلمة_المرور@127.0.0.1:5432/اسم_قاعدتك` |
| `JWT_SECRET` | ناتج `openssl rand -base64 48` أعلاه |
| `PUBLIC_API_URL` | `https://api.your-domain.ma` — نطاقك الحقيقي، وبـ `https` |

> إن احتوت كلمة مرور القاعدة على أحد الرموز `: / ? # [ ] @` فرمّزها
> (percent-encode) داخل الرابط، وإلا قرأها المحلّل كجزء من اسم المضيف.

الواجهة **ترفض الإقلاع** في وضع الإنتاج إذا بقي `JWT_SECRET` على قيمته
النموذجية أو كان `PUBLIC_API_URL` بـ `http` — وهذا مقصود: الأول يسمح بتزوير
الجلسات، والثاني يمنع بوّابة الدفع من إرسال النتيجة.

**تحقّق:** يجب أن يظهر `-rw-r-----` و `root qri3a`.

```bash
ls -l /etc/qri3a/api.env
```

---

## 6. أول بناء وترحيل

نفس السكربت الذي ستستعمله لكل تحديث لاحق، مع تعطيل خطوة إعادة التشغيل لأن
الخدمة لم تُركّب بعد:

```bash
sudo -H -u qri3a env SKIP_SERVICE=1 /srv/qri3a/deploy/deploy.sh
```

> السكربت يثبّت حزم الواجهة وحدها، ثم يبني، ثم يطبّق الترحيلات التي تنشئ جداول
> `commerce`. التطبيقان يُبنيان على GitHub Actions ولا داعي لجرّ أدوات Android
> إلى السيرفر.
>
> ‏`-H` مهمّ: بدونه يبقى `HOME` على مجلّد `root` ويفشل npm في الكتابة إلى
> ذاكرته المؤقّتة.

**تحقّق:** يجب أن تظهر الترحيلتان بعلامة `✔ applied`.

```bash
set -a; . <(sudo cat /etc/qri3a/api.env); set +a
sudo -H -u qri3a env DATABASE_URL="$DATABASE_URL" JWT_SECRET="$JWT_SECRET" \
  node /srv/qri3a/backend/api/dist/db/migrate.js status
```

---

## 7. تشغيل الخدمة عبر systemd

```bash
sudo cp /srv/qri3a/deploy/systemd/qri3a-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now qri3a-api
```

ثم اسمح لمستخدم النشر بإعادة تشغيل خدمته وحدها — بدون هذا يصل `deploy.sh` إلى
خطوة إعادة التشغيل ويفشل، لأن `qri3a` حساب نظام بلا صلاحيات `sudo`:

```bash
sudo cp /srv/qri3a/deploy/sudoers.d/qri3a-deploy /etc/sudoers.d/qri3a-deploy
sudo chown root:root /etc/sudoers.d/qri3a-deploy
sudo chmod 0440 /etc/sudoers.d/qri3a-deploy
sudo visudo -c -f /etc/sudoers.d/qri3a-deploy      # يجب أن يقول "parsed OK"
```

> القاعدة تطابق الأمر بحرفه: `systemctl restart qri3a-api` فقط. لا تسمح بإعادة
> تشغيل خدمة أخرى ولا بفتح صدفة. **لا تتخطَّ فحص `visudo`** — خطأ إملائي في ملف
> sudoers قد يمنعك من استعمال `sudo` نهائياً.

**تحقّق:**

```bash
systemctl status qri3a-api --no-pager
curl -s http://127.0.0.1:4000/health | node -e 'process.stdin.on("data",d=>console.log(JSON.stringify(JSON.parse(d),null,2)))'
```

المتوقّع: `"status": "ok"` و `"database": { "ok": true }`. أما
`"payments": { "configured": false }` فهي الحالة الطبيعية قبل وصول مفاتيح CMI.

إن لم تُقلع الخدمة، السبب مكتوب حرفياً في السجلّ:

```bash
journalctl -u qri3a-api -n 50 --no-pager
```

---

## 8. الجدار الناري

الواجهة مربوطة على `127.0.0.1` فقط (المفتاح `HOST` في ملف الأسرار)، فالمنفذ
`4000` غير مرئي من الإنترنت أصلاً. ومع ذلك:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

**تحقّق:** لا يجب أن يظهر المنفذ 4000 في القائمة.

```bash
sudo ufw status
```

---

## 9. الوكيل العكسي و HTTPS

> ### ⚠️ عنوان IP وحده لا يكفي
>
> **لا يمكن استخراج شهادة HTTPS لعنوان IP.** لا Let's Encrypt ولا غيرها تصدر
> شهادة لـ `84.8.223.62`. والواجهة ترفض الإقلاع في وضع الإنتاج بـ
> `PUBLIC_API_URL` غير https — وحتى لو أجبرتها، فبوّابة CMI لا ترسل نتيجة الدفع
> إلى عنوان غير مؤمَّن، وأندرويد 9 فما فوق يحجب الاتصالات غير المشفّرة
> افتراضياً. أي أن الطريق مسدود بلا اسم مضيف.
>
> أمامك خياران:
>
> **1. نطاق حقيقي (الموصى به).** أي نطاق تملكه، مع سجلّ `A` باسم فرعي مثل
> `api` يشير إلى `84.8.223.62`. هذا ما ستسلّمه لـ CMI عند تسجيل المتجر،
> وتغييره لاحقاً يعني إعادة التسجيل عندهم.
>
> **2. اسم مؤقّت عبر sslip.io (مجاني، فوري).** خدمة DNS عمومية تحوّل أي عنوان
> IP في الاسم إلى العنوان نفسه، وLet's Encrypt تصدر شهادات لها عادةً. لخادمك:
>
> ```
> api.84-8-223-62.sslip.io
> ```
>
> تأكّد أولاً أنه يشير فعلاً إلى خادمك:
>
> ```bash
> dig +short api.84-8-223-62.sslip.io      # يجب أن يطبع 84.8.223.62
> ```
>
> يصلح تماماً لتشغيل التطبيقين واختبارهما اليوم. لكنه **ليس** لإنتاج دائم:
> اسم لا تملكه، والخدمة قد تتوقف، وستضطر لإعادة تسجيل عنوان الاستدعاء عند CMI
> حين تنتقل إلى نطاقك.
>
> ضع الاسم الذي اخترته في ثلاثة مواضع، ولا بدّ أن تتطابق: `Caddyfile`،
> و `PUBLIC_API_URL` في `/etc/qri3a/api.env`، و `api_url` عند بناء الـ APK
> (الخطوة 12).

الخيار المقترح هو Caddy لأنه يستخرج شهادة Let's Encrypt ويجدّدها وحده:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

```bash
sudo cp /srv/qri3a/deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # بدّل api.your-domain.ma بنطاقك
sudo systemctl reload caddy
```

> **إن كان nginx يعمل على السيرفر أصلاً**، استعمل
> `deploy/nginx/qri3a-api.conf` بدل ذلك — تعليمات certbot مكتوبة في رأس الملف.

**تحقّق:** من جهازك، لا من السيرفر.

```bash
curl -s https://api.your-domain.ma/health
```

إن فشل، تأكّد أولاً أن سجلّ `A` يشير فعلاً إلى السيرفر: Caddy لا يستطيع
استخراج شهادة قبل ذلك.

```bash
dig +short api.your-domain.ma
sudo journalctl -u caddy -n 50 --no-pager
```

---

## 10. التحديثات اللاحقة

بعد الإعداد الأول، كل تحديث أمر واحد:

```bash
sudo -H -u qri3a /srv/qri3a/deploy/deploy.sh
```

السكربت ينفّذ بالترتيب: جلب الفرع ← تثبيت الحزم ← بناء ← ترحيلات ← إعادة تشغيل
← فحص `/health`. وأي خطوة تفشل توقفه قبل إعادة التشغيل، فتبقى النسخة القديمة
تعمل، ويطبع لك أمر العودة إلى الإصدار السابق.

متغيّرات تفيد عند الحاجة:

```bash
SKIP_SERVICE=1 ./deploy/deploy.sh      # ابنِ فقط بدون إعادة تشغيل
SKIP_MIGRATIONS=1 ./deploy/deploy.sh   # تخطَّ الترحيلات
BRANCH=main ./deploy/deploy.sh         # انشر فرعاً آخر
```

---

## 11. تفعيل الدفع لاحقاً

عندما تصلك مفاتيح CMI:

```bash
sudo nano /etc/qri3a/api.env
```

املأ `CMI_CLIENT_ID` و `CMI_STORE_KEY` و `CMI_STORE_NAME`، وأبقِ
`CMI_GATEWAY_URL` على بوّابة **الاختبار**، ثم:

```bash
sudo systemctl restart qri3a-api
curl -s http://127.0.0.1:4000/health
```

يجب أن تصبح `"payments": { "configured": true }`.

نفّذ عملية شراء كاملة من تطبيق `9ri3a espress` ببطاقة اختبار من CMI. **بعد**
نجاحها فقط، بدّل الرابط إلى البوّابة الحقيقية وأعد التشغيل:

```
CMI_GATEWAY_URL=https://payment.cmi.co.ma/fim/est3Dgate
```

> عنوان `PUBLIC_API_URL` هو ما تُرسل إليه CMI نتيجة الدفع. سلّم هذا العنوان
> بالضبط لـ CMI عند تسجيل المتجر، وإلا رُفضت العملية بعد الدفع.

---

## 12. إعادة بناء التطبيقين على العنوان الحقيقي

النسخة الحالية من الـ APK تشير إلى عنوان تجريبي. لتوجيهها إلى سيرفرك:

1. افتح المستودع على GitHub ← تبويب **Actions** ← سير العمل **Build APK**.
2. اضغط **Run workflow** واملأ:
   - `app`: ‏`both`
   - `api_url`: ‏`https://api.your-domain.ma`
   - `build_type`: ‏`release`
3. بعد نحو 15 دقيقة، حمّل الـ APK من قسم **Artifacts** في صفحة التشغيل.

---

## المراقبة والصيانة

```bash
# السجلّ مباشرةً
journalctl -u qri3a-api -f

# أخطاء اليوم فقط
journalctl -u qri3a-api --since today -p err --no-pager

# استهلاك الذاكرة والمعالج
systemctl status qri3a-api --no-pager
```

السجلّات تذهب إلى journald، وهو يدوّرها وحده — لا حاجة إلى إعداد `logrotate`.
لتحديد حجم أقصى:

```bash
sudo journalctl --vacuum-size=500M
```

نسخة احتياطية للبيانات التي تكتبها الواجهة (مخطّط `commerce` وحده):

```bash
sudo -u postgres pg_dump -n commerce اسم_قاعدتك | gzip > commerce-$(date +%F).sql.gz
```

---

## حلّ المشاكل

| العَرَض | السبب الغالب | الحل |
|---------|--------------|------|
| `systemctl start` يفشل فوراً | خطأ في `/etc/qri3a/api.env` | السبب مكتوب في `journalctl -u qri3a-api -n 30` |
| `Refusing to start … JWT_SECRET` | المفتاح ما زال على القيمة النموذجية | `openssl rand -base64 48` وضعه في ملف الأسرار |
| `Refusing to start … PUBLIC_API_URL` | العنوان بـ `http` | غيّره إلى `https://` |
| `/health` يردّ `degraded` | القاعدة غير متاحة أو الصلاحيات ناقصة | راجع الخطوة 3، وجرّب الاتصال بـ `psql` بنفس الدور |
| التطبيق يعرض كتالوجاً فارغاً | كل المنتجات ضمن `PRODUCT_HIDDEN_STATUSES` | `SELECT status, count(*) FROM public.products GROUP BY status;` ثم عدّل القائمة |
| الدفع يردّ `503` | مفاتيح CMI فارغة | الخطوة 11 |
| Caddy لا يستخرج شهادة | الاسم لا يشير إلى السيرفر، أو المنفذ 80 محجوب | `dig +short <اسمك>` و `sudo ufw status` |
| المنفذ 80 يبدو مفتوحاً محلياً لكن الشهادة تفشل | مزوّد الإنترنت أو جدار ناري خارجي يحجب الوارد على 80 | اختبره من خارج الشبكة، لا من السيرفر: `curl -sI http://<اسمك>/` من هاتفك على بيانات الجوّال. Let's Encrypt تتصل من الخارج |
| `deploy.sh` يقول `uncommitted changes` | ملف عُدّل يدوياً على السيرفر | `git diff` لرؤيته، ثم `git checkout -- <الملف>` |
| `migrations … contents changed` | ترحيلة مطبَّقة تغيّر محتواها | انظر أسفله |

### «contents changed» عند الترحيل

مدير الترحيلات يحفظ بصمة SHA-256 لكل ملف طبّقه، ويرفض المتابعة إذا تغيّر
محتواه — لأن التغيير يعني أن قاعدتك لم تعد تطابق ما يفترضه الكود.

القاعدة العامة: **اكتب ترحيلة جديدة، ولا تعدّل مطبَّقة.** الاستثناء الوحيد هو
تعديل لا يغيّر النتيجة على قاعدة طُبّق عليها الملف أصلاً. حدث هذا مرة واحدة في
`0001_commerce_schema.sql`: استُبدل `CREATE SCHEMA IF NOT EXISTS commerce` بفحص
مسبق في `pg_namespace`، حتى يعمل الترحيل بدور لا يملك صلاحية `CREATE` على
القاعدة. النتيجة على قاعدة موجودة متطابقة تماماً.

إن كنت قد طبّقت النسخة القديمة قبل هذا التعديل، حدّث البصمة المسجّلة مرة واحدة:

```bash
cd /srv/qri3a
sudo -u postgres psql -d اسم_قاعدتك -c "UPDATE commerce.schema_migrations
  SET checksum = '$(sha256sum db/migrations/0001_commerce_schema.sql | cut -d" " -f1)'
  WHERE name = '0001_commerce_schema.sql';"
```

لا تستعمل هذا الأمر لأي ترحيلة أخرى دون قراءة `git diff` والتأكّد من أن التغيير
فعلاً بلا أثر.
