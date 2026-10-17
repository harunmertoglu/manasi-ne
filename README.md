# Manası Nedir

Bir web sayfasındaki kelimeyi seç; **o metinde ne anlama geldiğini** öğren.

- Türkçe → Türkçe bağlamsal açıklama.
- İngilizce → İngilizce bağlamsal açıklama ve Türkçe karşılık.
- Kelime öbekleri, terimler ve mecaz kullanımları.
- Dört sağlayıcı seçeneği: **Groq API**, **Google Gemini API**, **OpenRouter Ücretsiz Modeller (`:free` ve `openrouter/free`)** veya **ChatGPT Hesabınla Giriş (`Sign in with ChatGPT` — yerel yardımcı ile)**. Ortak sunucu veya eklenti aboneliği yok.

Örneğin, “The company faces significant **headwinds**” cümlesindeki kelime için:

> **Meaning:** Conditions that make the company's progress more difficult; here, business or economic obstacles.
>
> **Türkçe karşılığı:** Şirketin ilerlemesini zorlaştıran olumsuz koşullar.

Bu örnek beklenen davranışı gösterir; modelin gerçek cevabı değişebilir.

## Kurulum

Node.js 22 veya üzeri ve Chrome 120 veya üzeri gerekir.

```bash
npm ci
npm run build
```

1. Chrome'da `chrome://extensions` adresini aç.
2. Sağ üstte **Geliştirici modu**nu etkinleştir.
3. **Paketlenmemiş öğe yükle** düğmesiyle bu projenin **`dist/` klasörünü** seç.
4. Araç çubuğundaki yapboz simgesinden **Manası Nedir** eklentisini sabitle.

Kod değiştiğinde yeniden `npm run build` çalıştır, eklentiler sayfasında eklentiyi yeniden yükle ve açık web sayfasını yenile.

## Sağlayıcı bağlama

### Seçenek 1: Groq API anahtarı (yerel yardımcı gerekmez)

1. [Groq Console](https://console.groq.com/) üzerinden hesap oluştur veya giriş yap.
2. [API Keys](https://console.groq.com/keys) sayfasında **Create API Key** ile kendi anahtarını oluştur. Anahtarı kopyala; kimseyle paylaşma, GitHub'a veya issue'lara ekleme.
3. Eklentide **Ayarlar** bağlantısını açıp sağlayıcı olarak **Groq**'u seç ve anahtarı gir.
4. **Modelleri getir** düğmesine bas. Hesabının döndürdüğü model listesi gösterilir.
5. Metin sohbeti ve JSON yanıtı destekleyen bir model seç ve **Doğrula ve kaydet** düğmesine bas.

### Seçenek 2: Google Gemini API anahtarı (yerel yardımcı gerekmez)

1. [Google AI Studio](https://aistudio.google.com/app/apikey) üzerinden ücretsiz bir Gemini API anahtarı oluştur (`AIza…`).
2. Eklentide **Ayarlar** sayfasını açıp sağlayıcı olarak **Google Gemini**'yi seç ve anahtarı gir.
3. **Modelleri getir** düğmesine bas, örneğin `gemini-2.5-flash` veya `gemini-2.5-flash-lite` modelini seç ve **Doğrula ve kaydet** düğmesine bas.
4. İstekler doğrudan Google'ın resmi OpenAI uyumlu uç noktasına (`https://generativelanguage.googleapis.com/v1beta/openai`) gider.

### Seçenek 3: OpenRouter ücretsiz modeller (yerel yardımcı gerekmez)

1. [OpenRouter Keys](https://openrouter.ai/settings/keys) sayfasından bir API anahtarı oluştur (`sk-or-v1-…`).
2. Eklentide **Ayarlar** sayfasını açıp sağlayıcı olarak **OpenRouter — Ücretsiz Modeller**'i seç ve anahtarı gir.
3. **Modelleri getir** düğmesine bas. Eklenti yalnızca ücretsiz modelleri (`openrouter/free` ve `:free` uzantılı sıfır maliyetli modeller) listeler; ücretli modeller hem listede hem çalışma zamanında engellenir.
4. Bir ücretsiz model seçip **Doğrula ve kaydet** düğmesine bas.

### Seçenek 4: ChatGPT hesabınla giriş (`Sign in with ChatGPT` — isteğe bağlı yerel yardımcı ile)

OpenAI'ın resmi açık kaynak `Sign in with ChatGPT` (SIWC) akışı, `http://127.0.0.1:<port>/auth/callback` geri dönüş sunucusu, PKCE (`S256`) doğrulaması ve tarayıcı depolaması dışında `0600` izinli yerel anahtar saklama gerektirdiği için Chrome Native Messaging üzerinden çalışan hafif bir yerel yardımcı kullanır:

1. `chrome://extensions` sayfasından yüklediğin **Manası Nedir** eklentisinin 32 karakterli kimliğini (`ID`) kopyala (veya eklentinin **Ayarlar** sayfasında **ChatGPT** seçeneğini açıp hazır kurulum komutunu kopyala).
2. Proje kök dizininde yerel yardımcıyı kaydet:
   ```bash
   npm run chatgpt:install -- --extension-id <32-karakterli-eklenti-id>
   ```
3. Eklentinin **Ayarlar** sayfasında sağlayıcı olarak **ChatGPT — Hesabınla Giriş (Yerel Yardımcı)** seçeneğini seç.
4. **ChatGPT ile giriş yap** düğmesine bas. Tarayıcıda açılan OpenAI yetkilendirme ekranında giriş yapıp doğrudan model kullanım iznini (`chatgpt.tokens.use.direct`) onayla.
5. **ChatGPT modellerini getir** düğmesine bas, hesabında listelenen bir modeli seç ve **ChatGPT bağlantısını doğrula ve kaydet** düğmesine bas.

### Ücretsiz kullanım ve maliyet

- **Groq, Google Gemini API ve OpenRouter (`:free`):** Sağlayıcıların sunduğu ücretsiz katmanlar model ve hesap bazında dakika/günlük istek ve token sınırlarına tabidir. Gemini API ücretsiz katmanında verilerin Google tarafından ürün iyileştirmede kullanılabileceğini ([Gemini API Terms](https://ai.google.dev/gemini-api/terms)), OpenRouter ücretsiz modellerinde ise uç sağlayıcı veri politikalarını göz önünde bulundur.
- **ChatGPT ile Giriş:** OpenAI'ın resmi `Sign in with ChatGPT` (SIWC) akışı, uygun ChatGPT aboneliklerinde (`chatgpt.tokens.use.direct` izniyle) hesabın kendi kullanım kotasını kullanır. Claude veya Gemini tüketici sohbet abonelikleri üçüncü taraf eklentilerde doğrudan desteklenmez.
- Sayfayı başlatmak özetleme isteği yapar; uzun sayfalarda birden fazla istek gerekir. Her yeni kelime bağlamı ayrıca bir istek oluşturur. Aynı sayfa sürümü, sağlayıcı, hesap, model ve konumdaki tekrarlar oturum önbelleğinden yanıtlanır. Kota aşımında eklenti otomatik/sınırsız yeniden deneme yapmaz ve sessizce başka sağlayıcıya geçmez.

## Kullanım

1. Normal bir web sayfasını aç, eklentiye tıkla ve **Bu sayfada başlat** de.
2. “Bağlam hazır” durumunu bekle. Uzun sayfalarda bölüm ilerlemesi gösterilir; popup'ı kapatabilirsin.
3. Ana metindeki bir kelimeyi veya en fazla 200 karakterlik ifadeyi fareyle seç. Açıklama yanında açılır. Klavyeyle Shift + ok tuşlarıyla seçim de desteklenir.
4. **×** veya Escape ile kutuyu kapat. **Bu sayfada durdur** ile okumayı durdurup sekme bağlamını temizle.

Eklenti açık sayfanın ana metnini okur; bütün sitenin bağlantılarını taramaz. Konu özeti, kelimenin geçtiği orijinal paragraf ve komşu paragraflar birlikte anlamlandırılır. Sayfa metni veya adresi değişirse yeniden başlatman gerekir.

## Gizlilik ve güvenlik

- Sayfa metni yalnızca aktif olarak seçtiğin sağlayıcıya (**Groq**, **Google Gemini API**, **OpenRouter** veya yerel yardımcı üzerinden **OpenAI `/v1/responses` (`store: false`)**) gönderilir.
- Başlatma sırasında çıkarılan ana metin ve sonraki seçim bağlamları aktarılır. Özel içeriklerde eklentiyi başlatmadan önce buna dikkat et. Form alanları ve düzenlenebilir alanlar metin çıkarımından hariçtir; sayfanın normal metni yine özel bilgi içerebilir.
- Groq, Gemini ve OpenRouter API anahtarları yalnızca `chrome.storage.local` içinde, güvenilir eklenti bağlamlarına açık tutulur.
- ChatGPT OAuth erişim ve yenileme anahtarları (`access_token`, `refresh_token`) **tarayıcı depolamasına hiç girmez**; yalnızca yerel yardımcı tarafından kullanıcıya özel dizinde (`~/.config/manasi-nedir/chatgpt/` veya macOS `~/Library/Application Support/ManasiNedir/chatgpt/`) `0700` klasör ve `0600` dosya izinleriyle saklanır. Oturum kapatıldığında (`ChatGPT oturumunu kapat`) hem OpenAI iptal uç noktası (`revoke`) çağrılır hem yerel anahtar dosyası silinir.
- Sayfa metinleri, özetler ve en fazla 100 yanıt sekme oturumu için `chrome.storage.session` içinde tutulur. Durdurma, sekme kapanması, tarayıcı oturumunun bitmesi veya aktif sağlayıcı/model/hesap değişikliği bunları temizler.
- Telemetri veya analitik yoktur. Sayfa koduna API anahtarı aktarılmaz; model çıktısı HTML olarak çalıştırılmaz.

## Sınırlar ve sorun giderme

- Chrome, Türkçe/İngilizce metin ve dört sağlayıcı (Groq, Google Gemini API, OpenRouter ücretsiz modeller, ChatGPT yerel yardımcı) desteklenir.
- Chrome iç sayfaları, Web Store, PDF görüntüleyici, görsel içindeki yazılar, farklı kökenden iframe'ler ve henüz yüklenmemiş içerik desteklenmez.
- Ana metin ve satır sonları toplamı en fazla 120.000 karakterdir; özetleme en fazla 10 × 12.000 karakterlik parça kullanır. Modelin token sınırı ayrıdır ve daha erken devreye girebilir.
- “Anahtar geçersiz” veya “ChatGPT oturumu geçersiz”: anahtarı kontrol et veya ChatGPT ile yeniden giriş yap. “Kota aşıldı”: bekle ve sağlayıcı limitlerine bak. “Model/bağlam desteklenmiyor”: başka bir metin modeli veya daha kısa sayfa dene.
- “Sayfa değişti”: tekrar başlat. Hazırlık kesilirse veya bağlantı zaman aşımına uğrarsa yeniden dene; otomatik olarak yeni istek başlatılmaz.
- LLM açıklamaları hatalı olabilir; bağlam yetersiz olduğunda açıklamada belirsizlik belirtmesi istenir.

## Geliştirme ve doğrulama

```bash
npm run typecheck
npm run build
npm test
```

Chromium üzerinde uçtan uca test:

```bash
npx playwright install chromium
npm run test:e2e
```

[Elle kontrol adımları](docs/manual-checks.md) gerçek hesap ve tarayıcıyla doğrulamayı anlatır. Kaynak kod `src/` ve `helper/`, yüklenebilir eklenti çıktısı `dist/`, yerel yardımcı çıktısı `dist-helper/` içindedir.
