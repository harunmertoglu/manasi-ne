# Manası Nedir

Bir web sayfasını okurken takıldığın kelimeyi veya ifadeyi seç; sözlükteki genel tanımını değil, **tam olarak o cümlede ve o metinde ne anlama geldiğini** öğren.

**Manası Nedir**, açık sekmedeki yazının konusunu ve kelimenin geçtiği paragraf bağlamını birlikte değerlendirerek seçtiğin ifadenin hemen yanında kısa bir açıklama kartı açan, açık kaynaklı bir Chromium tarayıcı eklentisidir.

- **Türkçe metinlerde:** Seçilen kelime veya ifadenin bağlama uygun Türkçe açıklaması.
- **İngilizce metinlerde:** Seçilen kelime veya ifadenin bağlama uygun İngilizce açıklaması **ve** o cümledeki Türkçe karşılığı.
- **Çok anlamlı kelimeler, terimler, deyimler ve mecazlar:** Aynı kelimenin sayfanın farklı yerlerindeki farklı kullanımlarını birbirinden ayırır (en fazla 200 karakterlik seçimler).
- **Kendi anahtarın veya hesabınla çalışır:** Ortak bir arka uç sunucusu, aracı servis veya eklenti aboneliği yoktur. Dört bağlantı seçeneği sunar:
  1. **Groq API** (tarayıcıdan doğrudan, yerel yardımcı gerekmez)
  2. **Google Gemini API** (tarayıcıdan doğrudan, yerel yardımcı gerekmez)
  3. **OpenRouter — Ücretsiz Modeller (`:free` ve `openrouter/free`)** (tarayıcıdan doğrudan, yerel yardımcı gerekmez)
  4. **ChatGPT — Hesabınla Giriş (`Sign in with ChatGPT`)** (isteğe bağlı yerel Native Messaging yardımcısı ile)

---

## Örnek çıktı

İngilizce bir ekonomi haberinde geçen şu cümlede **`headwinds`** kelimesini seçtiğinde:

> *“The company faces significant **headwinds** in the fourth quarter.”*

Açıklama kartı kelimeyi düz anlamıyla (“karşıdan esen rüzgâr”) değil, metindeki mecaz anlamıyla açıklar:

> **Meaning:** Conditions that make the company's progress more difficult; here, business or economic obstacles.
>
> **Türkçe karşılığı:** Şirketin ilerlemesini zorlaştıran olumsuz koşullar / güçlükler.

Türkçe bir metinde **`yüz`** kelimesini *“Toplantıya yüz kişi katıldı”* cümlesinde seçtiğinde sayı anlamını, *“Yüz ifadesi birden değişti”* cümlesinde seçtiğinde ise çehre/surat anlamını açıklar. *(Örnekler beklenen davranışı gösterir; gerçek yanıt seçtiğin modele göre değişebilir.)*

---

## Mevcut durum ve doğrulama kapsamı

Bu depo, eklentinin ilk genel sürümünü içerir. Kullanmadan önce neyin hazır olduğunu ve neyin nasıl doğrulandığını bilmek önemlidir:

- **Doğrudan çalışan API sağlayıcıları (Groq, Google Gemini API, OpenRouter Ücretsiz Modeller):** Eklenti içinden doğrudan ilgili sağlayıcının resmi HTTPS uç noktasına bağlanır. Ek bir yerel program kurulumu gerektirmez.
- **Yerel yardımcı ile ChatGPT girişi (`Sign in with ChatGPT`):** OpenAI OAuth PKCE geri dönüşü (`http://127.0.0.1:<port>/auth/callback`), JWKS `id_token` doğrulaması, `0600` izinli yerel anahtar saklama ve `/v1/responses` (`store: false`, `stream: true`) akışı yerel Node.js yardımcısında (`helper/`) uygulanmıştır.
- **Doğrulananlar ve dürüst sınırlar:**
  - Metin çıkarma, paragraf/konum eşleme, önbellek izolasyonu, sağlayıcı doğrulaması, OpenRouter ücretli model engellemesi, OAuth/PKCE/SSE birim testleri (`vitest`) ve Chromium üzerinde sahte (mock) sağlayıcı yanıtlarıyla uçtan uca eklenti akışları (`playwright`) otomatik testlerle doğrulanmıştır.
  - Yerel ChatGPT yardımcısının derlenmesi (`dist-helper/chatgpt-host.mjs`), **Brave Origin** dahil tarayıcı Native Messaging manifest kaydı ve yardımcı süreçle yerel durum iletişimi (`HELPER_STATUS` / çerçeveleme) Linux üzerinde doğrulanmıştır.
  - **Gerçek bir ChatGPT/OpenAI hesabıyla canlı OAuth oturum açma ve abonelik kotasından canlı model çağrısı bu depodaki otomatik testlerle kanıtlanmamıştır.** Yalnızca yerel yardımcı bağlantısı (native helper connectivity) doğrulanmıştır; gerçek giriş ve model kullanımı OpenAI'ın hesabına/planına `chatgpt.tokens.use.direct` iznini vermesine bağlıdır.

---

## Kurulum ve tarayıcıya yükleme

### Gereksinimler

- **Node.js 22** veya üzeri (`node --version` ile kontrol edebilirsin)
- **Chromium tabanlı bir tarayıcı:** Google Chrome (120+), Chromium, Brave, Brave Origin veya Microsoft Edge

### 1. Depoyu indir ve derle

```bash
git clone https://github.com/harunmertoglu/manasi-ne.git
cd manasi-ne
npm ci
npm run build
```

`npm run build` komutu:
- Tarayıcıya yüklenecek paketlenmemiş eklenti dosyalarını **`dist/`** klasörüne,
- İsteğe bağlı yerel ChatGPT yardımcısını ise **`dist-helper/chatgpt-host.mjs`** dosyasına üretir.

### 2. Paketlenmemiş eklentiyi (`dist/`) tarayıcıya yükle

1. Tarayıcında eklentiler sayfasını aç:
   - Chrome / Chromium: `chrome://extensions`
   - Brave / Brave Origin: `brave://extensions`
   - Edge: `edge://extensions`
2. Sağ üst köşedeki **Geliştirici modu** (*Developer mode*) anahtarını aç.
3. Sol üstte beliren **Paketlenmemiş öğe yükle** (*Load unpacked*) düğmesine tıkla.
4. Proje kök dizinini değil, derleme sonucunda oluşan **`dist/` klasörünü** seç.
5. Tarayıcı araç çubuğundaki yapboz (eklentiler) simgesine tıklayıp **Manası Nedir** eklentisini sabitle.

> **İpucu:** Depoyu güncellediğinde veya kaynak kodda değişiklik yaptığında yeniden `npm run build` çalıştır, eklentiler sayfasında **Manası Nedir** kartındaki yenile (`↻`) simgesine bas ve okuduğun web sayfasını yenile.

---

## Sağlayıcı ve API anahtarı kurulumu

Eklenti simgesine tıklayıp **Ayarlar ↗** düğmesine basarak (veya eklenti seçeneklerinden) dört sağlayıcıdan birini yapılandırabilirsin. Her sağlayıcının ayarı ayrı tutulur; yeni bir sağlayıcı/model doğrulanana kadar mevcut çalışan ayarın bozulmaz.

### Seçenek 1: Groq API anahtarı (yerel yardımcı gerekmez)

1. [Groq Console](https://console.groq.com/keys) sayfasından hesabına giriş yap ve **Create API Key** ile yeni bir anahtar oluştur (`gsk_…`).
2. Eklenti **Ayarlar** sayfasında sağlayıcı olarak **Groq — Kendi API Anahtarın** seçeneğini seç ve anahtarı yapıştır.
3. **Modelleri getir** düğmesine bas.
4. Listeden metin sohbeti ve JSON yanıtını destekleyen bir model (ör. `llama-3.3-70b-versatile`) seçip **Doğrula ve kaydet** düğmesine bas.

### Seçenek 2: Google Gemini API anahtarı (yerel yardımcı gerekmez)

1. [Google AI Studio](https://aistudio.google.com/app/apikey) sayfasından bir Gemini API anahtarı oluştur (`AIza…`).
2. Eklenti **Ayarlar** sayfasında sağlayıcı olarak **Google Gemini — Kendi API Anahtarın** seçeneğini seç ve anahtarı gir.
3. **Modelleri getir** düğmesine bas, listeden bir metin modeli (ör. `gemini-2.5-flash` veya `gemini-2.5-flash-lite`) seç ve **Doğrula ve kaydet** düğmesine bas.
4. İstekler doğrudan Google'ın resmi OpenAI uyumlu uç noktasına (`https://generativelanguage.googleapis.com/v1beta/openai`) gönderilir.

### Seçenek 3: OpenRouter ücretsiz modeller (yerel yardımcı gerekmez)

1. [OpenRouter Keys](https://openrouter.ai/settings/keys) sayfasından bir API anahtarı oluştur (`sk-or-v1-…`).
2. Eklenti **Ayarlar** sayfasında sağlayıcı olarak **OpenRouter — Ücretsiz Modeller (API Anahtarı)** seçeneğini seç ve anahtarı gir.
3. **Modelleri getir** düğmesine bas. Eklenti yalnızca sıfır maliyetli ücretsiz modelleri (`openrouter/free` ve `:free` sonekli modeller) listeler; ücretli modeller hem arayüzde hem çalışma zamanında istemci tarafından engellenir.
4. Bir ücretsiz model seçip **Doğrula ve kaydet** düğmesine bas.

### Seçenek 4: ChatGPT hesabınla giriş (`Sign in with ChatGPT` — yerel yardımcı ile)

OpenAI'ın açık kaynak `Sign in with ChatGPT` (`dynamic_agent_client`) akışı; yerel geri dönüş sunucusu (`http://127.0.0.1:<port>/auth/callback`), PKCE (`S256`) doğrulaması ve OAuth jetonlarının tarayıcı dışında `0600` izinli yerel dosyada tutulması için Chrome Native Messaging üzerinden çalışan yerel yardımcıyı kullanır.

#### Adım 1 — Yerel yardımcıyı kaydet (Brave Origin dahil)

1. `chrome://extensions` veya `brave://extensions` sayfasından yüklediğin **Manası Nedir** eklentisinin 32 karakterli kimliğini (`ID`, yalnızca `a-p` harflerinden oluşur) kopyala. *(Alternatif olarak eklentinin **Ayarlar** sayfasında **ChatGPT** seçeneğini seçtiğinde senin eklenti kimliğinle hazır kurulum komutu ekranda gösterilir.)*
2. Proje kök dizininde şu komutu çalıştır:
   ```bash
   npm run chatgpt:install -- --extension-id <32-karakterli-eklenti-id>
   ```
   Bu komut yerel yardımcıyı (`dist-helper/chatgpt-host.mjs`) derler ve varsayılan olarak **Chrome, Chromium, Brave, Brave Origin ve Microsoft Edge** kullanıcı dizinlerine Native Messaging host manifest dosyasını (`com.manasi_nedir.chatgpt.json`) kaydeder.
3. Yalnızca belirli bir tarayıcıya (örneğin **Brave Origin** veya **Brave**) kaydetmek istersen `--browser` parametresini kullanabilirsin:
   ```bash
   # Yalnızca Brave Origin için:
   npm run chatgpt:install -- --extension-id <32-karakterli-eklenti-id> --browser brave-origin

   # Desteklenen --browser hedefleri: chrome, chromium, brave, brave-origin, edge
   ```
   Dosya yazmadan üretilecek manifest içeriğini görmek için `--print` bayrağını ekleyebilirsin.
   > **Not:** Manifest dosyası proje içindeki `dist-helper/chatgpt-host.mjs` tam yolunu gösterir. Proje klasörünü başka bir dizine taşırsan kurulum komutunu yeni konumda tekrar çalıştır.

#### Adım 2 — Ayarlar'dan giriş yap ve modeli doğrula

1. Eklenti **Ayarlar** sayfasında **ChatGPT — Hesabınla Giriş (Yerel Yardımcı)** seçeneğini seç.
2. **ChatGPT ile giriş yap** düğmesine bas. Tarayıcıda açılan OpenAI yetkilendirme sayfasında giriş yap ve doğrudan model kullanım iznini (`chatgpt.tokens.use.direct`) onayla.
3. **ChatGPT modellerini getir** düğmesine bas, hesabın için listelenen bir modeli seç ve **ChatGPT bağlantısını doğrula ve kaydet** düğmesine bas.

#### ChatGPT plan uygunluğu ve önemli uyarı

- **Her ChatGPT hesabı veya aboneliği uygun olmayabilir:** Bir OpenAI hesabıyla giriş yapabilmek, tek başına doğrudan model kullanım izni (`chatgpt.tokens.use.direct`) verildiği anlamına gelmez. Hesabın, çalışma alanının (workspace) ve abonelik planının `Sign in with ChatGPT` akışına uygunluğu tamamen OpenAI tarafından belirlenir.
- **Doğrulama durumu:** Bu projede yerel yardımcı kurulumu ve tarayıcı–yardımcı Native Messaging bağlantısı doğrulanmıştır; ancak gerçek bir ChatGPT hesabıyla canlı OAuth yetkilendirmesi kullanıma ve OpenAI'ın hesap uygunluğuna bağlıdır.
- **Diğer tüketici abonelikleri:** Claude veya Gemini tüketici web sohbet abonelikleri üçüncü taraf eklentilere doğrudan OAuth token paylaşımı sunmadığından desteklenmez (Gemini için Seçenek 2'deki Google AI Studio API anahtarı kullanılır).

---

## Ücretsiz katman sınırları ve gizlilik dengesi

### Ücretsiz kullanım kotaları sınırlıdır

- **Dakika ve gün bazlı limitler:** Groq, Google Gemini API ve OpenRouter (`:free`) ücretsiz katmanları; model ve hesap bazında sıkı dakika başı istek (RPM), dakika başı token (TPM) ve günlük istek (RPD) sınırlarına tabidir.
- **Eklentinin istek tüketimi:** Bir sayfada **Bu sayfada başlat** dediğinde eklenti sayfanın ana metnini özetlemek için 1 istek (uzun sayfalarda her 12.000 karakterlik parça için ayrı istek + birleştirme isteği) gönderir. Ardından seçtiğin her yeni kelime bağlamı 1 ek istek yapar. Aynı sayfa sürümü, sağlayıcı, hesap, model ve paragraf konumundaki tekrar seçimler ise yerel oturum önbelleğinden (`chrome.storage.session`) anında yanıtlanır.
- **Kota aşımında davranış:** Sağlayıcı `429` (kota aşıldı) döndürdüğünde eklenti gizlice başka bir sağlayıcıya geçmez, ücretli modele yükseltmez ve arka planda sınırsız otomatik yeniden deneme yapmaz; kullanıcıya açık hata gösterir.

### Gizlilik, veri paylaşımı ve ücretsiz katman ödünleşimleri

- **Sayfa metni seçtiğin sağlayıcıya gönderilir:** Eklentiyi bir sayfada başlattığında çıkarılan ana metin (ve kelime seçtiğinde ilgili paragraf ile komşu paragraflar) doğrudan aktif sağlayıcıya (**Groq**, **Google Gemini API**, **OpenRouter** veya yerel yardımcı üzerinden **OpenAI `/v1/responses`**) iletilir. Özel, kurumsal veya gizli belgelerde eklentiyi başlatmadan önce bunu göz önünde bulundur.
- **Ücretsiz API katmanlarının veri politikaları:**
  - **Google Gemini API ücretsiz katmanı:** Google'ın [Gemini API Ek Hizmet Şartları](https://ai.google.dev/gemini-api/terms) uyarınca, ücretsiz (unpaid) katmanda gönderilen içerikler Google ürünlerini ve modellerini geliştirmek için kullanılabilir.
  - **OpenRouter `:free` modelleri:** Ücretsiz modellerde uç sağlayıcılar (upstream providers) gönderilen metinleri kendi politikalarına göre kaydedebilir veya model eğitiminde kullanabilir. OpenRouter üzerindeki gizlilik ayarlarını ([OpenRouter Privacy](https://openrouter.ai/settings/privacy)) kontrol etmen önerilir.
  - **ChatGPT yerel yardımcısı:** OpenAI `/v1/responses` uç noktasına `store: false` parametresiyle istek gönderir.
- **Anahtar ve token güvenliği:**
  - Groq, Gemini ve OpenRouter API anahtarları yalnızca `chrome.storage.local` içinde (`TRUSTED_CONTEXTS` erişim düzeyiyle) saklanır; web sayfası betikleri (content script) anahtarlara erişemez.
  - ChatGPT OAuth jetonları (`access_token`, `refresh_token`) **tarayıcı depolamasına hiç girmez**; yalnızca yerel yardımcı tarafından kullanıcıya özel dizinde (Linux'ta `~/.config/manasi-nedir/chatgpt/`, macOS'ta `~/Library/Application Support/ManasiNedir/chatgpt/`) `0700` klasör ve `0600` dosya izinleriyle saklanır. **ChatGPT oturumunu kapat** düğmesine basıldığında hem OpenAI iptal (`revoke`) uç noktası çağrılır hem yerel anahtar dosyası silinir.
- **Telemetri yoktur:** Eklentinin kendi analitik, izleme veya veri toplama sunucusu yoktur. Form alanları (`input`, `textarea`, `select`, `contenteditable`) metin çıkarımından hariç tutulur ve model yanıtları asla HTML olarak çalıştırılmaz (`textContent` ile çizilir).

---

## Günlük kullanım

1. Okumak istediğin Türkçe veya İngilizce bir web sayfasını aç.
2. Araç çubuğundan **Manası Nedir** simgesine tıkla ve **Bu sayfada başlat** düğmesine bas.
3. Popup'ta **“Bağlam hazır. Şimdi metinden bir kelime seç.”** mesajını bekle (uzun sayfalarda parça ilerlemesi `1/3`, `2/3` şeklinde görünür; hazırlık sürerken popup'ı kapatabilirsin).
4. Sayfanın ana metninde anlamını öğrenmek istediğin kelimeyi veya kısa ifadeyi (en fazla 200 karakter) fareyle ya da `Shift + Ok` tuşlarıyla seç.
5. Seçimin yanında açılan kartta bağlamsal açıklamayı oku. Kartı **×** düğmesiyle veya `Escape` tuşuyla kapatabilirsin.
6. İşin bittiğinde popup'tan **Bu sayfada durdur** düğmesine basarak okumayı durdurabilir ve sekme önbelleğini temizleyebilirsin.

---

## Desteklenen platformlar ve bilinen sınırlar

| Alan | Destek durumu ve test edilen sınırlar |
| :--- | :--- |
| **Tarayıcı eklentisi (`dist/`)** | Manifest V3 destekleyen Chromium tarayıcılar (Chrome 120+, Chromium, Brave, Brave Origin, Edge). Firefox desteklenmez. |
| **Yerel ChatGPT yardımcısı** | **Linux** üzerinde (Chrome, Chromium, Brave, **Brave Origin**, Edge dizinleri ve yerel yardımcı süreç iletişimi) test edilmiştir. Kodda macOS dizin yolları (`~/Library/Application Support/...`) tanımlı olsa da macOS üzerinde test edilmemiştir; Windows kayıt defteri (Registry) kurucusu ise mevcut değildir. |
| **Desteklenen diller** | Yalnızca **Türkçe (`tr`)** ve **İngilizce (`en`)** ifadeler açıklanır. Başka dillerdeki seçimler için desteklenmeyen dil uyarısı verilir. |
| **Sayfa ve seçim boyutu** | Tek seferde en fazla **200 karakterlik** kelime/ifade seçilebilir. Sayfa ana metni toplamda en fazla **120.000 karakter** ve en fazla **10 × 12.000 karakterlik** parça olabilir; bu sınırı aşan çok uzun sayfalar kısmi özetlenmek yerine açıkça reddedilir. Seçilen modelin kendi token limiti daha erken devreye girebilir. |
| **Desteklenmeyen sayfa türleri** | Tarayıcı iç sayfaları (`chrome://`, `brave://`, `edge://`), Chrome Web Store, PDF görüntüleyici, görsellerin içindeki yazılar (OCR yok), farklı kökenden (cross-origin) `iframe` içerikleri ve sayfada henüz yüklenmemiş (lazy-loaded) bölümler okunamaz. |
| **Sayfa değişimi** | Tek sayfa uygulamalarında (SPA) adres değiştiğinde veya sayfanın ana metni anlamlı ölçüde güncellendiğinde eski bağlam geçersiz kılınır; eklentiyi o sayfada yeniden başlatman istenir. |

---

## Sorun giderme

- **“API anahtarının biçimi geçersiz” / “anahtarı geçersiz veya erişim izni yok”:**
  Anahtarı kopyalarken başında/sonunda boşluk, satır sonu veya görünmeyen karakter kalmadığından ve doğru sağlayıcıyı seçtiğinden emin ol (`gsk_…` → Groq, `AIza…` → Gemini, `sk-or-v1-…` → OpenRouter).
- **“Kullanım kotası aşıldı. Bir süre bekleyin ve limitlerinizi kontrol edin.” (HTTP 429):**
  Kullandığın ücretsiz katmanın dakika veya günlük istek/token sınırına ulaştın. Bir süre bekle, daha hafif bir model seç veya Ayarlar'dan başka bir sağlayıcıya geç.
- **“Model veya bağlam sınırı bu isteği desteklemiyor”:**
  Seçilen model sohbet/JSON yanıtını desteklemiyor (ör. ses/embedding modelleri) veya sayfa parçası modelin token sınırını aşıyor. Standart bir metin modeli (`gemini-2.5-flash`, `llama-3.3-70b-versatile` vb.) seç veya daha kısa bir sayfada dene.
- **“Yerel ChatGPT yardımcısı kurulu değil veya başlatılamadı”:**
  1. `chrome://extensions` veya `brave://extensions` sayfasındaki 32 karakterli eklenti kimliğinin değişmediğini kontrol et.
  2. Proje kök dizininde `npm run chatgpt:install -- --extension-id <id>` (Brave Origin için `--browser brave-origin` ekleyerek de çalıştırabilirsin) komutunu çalıştır.
  3. Proje klasörünü taşıdıysan komutu yeni konumda tekrar çalıştır ve eklentiyi yeniden yükle.
- **“Hesap için doğrudan kullanım izni eksik” / “ChatGPT oturumu geçersiz”:**
  Ayarlar'da yeniden **ChatGPT ile giriş yap** düğmesine basarak `chatgpt.tokens.use.direct` iznini onayla. İzin onaylandığı halde hata sürüyorsa OpenAI hesabın veya abonelik planın `Sign in with ChatGPT` doğrudan kullanımına uygun olmayabilir; diğer üç API sağlayıcısından birini kullanabilirsin.
- **“Sayfa değişti. Yeniden başlat.” / “Hazırlık kesildi”:**
  Sayfa içeriği güncellenmiş veya hazırlık sırasında tarayıcı arka plan işçisi (service worker) uyku moduna geçmiş olabilir. Eklenti popup'ını açıp **Bu sayfada yeniden başlat** düğmesine bas.

---

## Geliştirme ve doğrulama komutları

```bash
# Bağımlılıkları kur
npm ci

# TypeScript tip kontrolü (src/, helper/, tests/, e2e/)
npm run typecheck

# Eklentiyi (dist/) ve yerel ChatGPT yardımcısını (dist-helper/) derle
npm run build

# Yalnızca yerel ChatGPT yardımcısını (dist-helper/chatgpt-host.mjs) derle
npm run chatgpt:build

# Yerel ChatGPT yardımcısını derle ve Native Messaging manifestini kaydet
npm run chatgpt:install -- --extension-id <32-karakterli-eklenti-id> [--browser chrome|chromium|brave|brave-origin|edge] [--print]

# Eklentiyi derleyip Vitest birim ve entegrasyon testlerini çalıştır
npm test

# Vitest'i izleme modunda çalıştır
npm run test:watch

# Kaynak dosyaları Prettier ile biçimlendir
npm run format

# Chromium üzerinde Playwright uçtan uca eklenti testlerini çalıştır
npx playwright install chromium
npm run test:e2e
```

Gerçek tarayıcıda adım adım elle doğrulama listesi için [`docs/manual-checks.md`](docs/manual-checks.md) ve mimari uygulama notları için [`docs/implementation-notes.md`](docs/implementation-notes.md) belgelerine bakabilirsin.
