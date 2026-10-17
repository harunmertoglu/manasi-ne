# Manası Nedir

Bir web sayfasındaki kelimeyi seç; **o metinde ne anlama geldiğini** öğren.

- Türkçe → Türkçe bağlamsal açıklama.
- İngilizce → İngilizce bağlamsal açıklama ve Türkçe karşılık.
- Kelime öbekleri, terimler ve mecaz kullanımları.
- Kendi Groq API anahtarın. Ortak sunucu, hesap veya eklenti aboneliği yok.

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

## Groq API anahtarı alma ve bağlama

1. [Groq Console](https://console.groq.com/) üzerinden hesap oluştur veya giriş yap.
2. [API Keys](https://console.groq.com/keys) sayfasında **Create API Key** ile kendi anahtarını oluştur. Anahtarı kopyala; kimseyle paylaşma, GitHub'a veya issue'lara ekleme.
3. Eklentide **Ayarlar** bağlantısını açıp anahtarı gir.
4. **Modelleri getir** düğmesine bas. Hesabının döndürdüğü model listesi gösterilir.
5. Metin sohbeti ve JSON yanıtı destekleyen bir model seç. Listede ses veya koruma modelleri de bulunabilir; her model bu iş için uygun değildir. [Groq model belgeleri](https://console.groq.com/docs/models) kullanılabilir modelleri açıklar.
6. **Doğrula ve kaydet** düğmesine bas. Eklenti seçilen modelle küçük bir API isteği yaparak bağlantıyı doğrular; bu istek de kotana dahildir.

Kayıtlı anahtar tekrar gösterilmez. Model değiştirmek için anahtar alanını boş bırakıp **Modelleri getir** kullanabilirsin. Anahtarı değiştirmek için yenisini girip doğrula. **Kayıtlı anahtarı sil**, anahtarı ve eklentinin tüm sayfa bağlamlarını siler. Bu işlem Groq'taki anahtarı iptal etmez; tamamen iptal için Groq Console'dan da sil.

### Ücretsiz kullanım ve maliyet

Groq'un ücretsiz katmanı model ve hesap bazında istek/token sınırlarına tabidir. Ücretli kullanım seçersen Groq kendi hesabını kullanımına göre ücretlendirir. ChatGPT, Claude veya Gemini sohbet aboneliği burada kullanılmaz. Güncel koşulları [Groq limitleri](https://console.groq.com/docs/rate-limits), [ücretlendirme açıklamaları](https://console.groq.com/docs/billing-faqs) ve kendi Console hesabından kontrol et.

Sayfayı başlatmak özetleme isteği yapar; uzun sayfalarda birden fazla istek gerekir. Her yeni kelime bağlamı ayrıca bir istek oluşturur. Aynı sayfa sürümü, model ve konumdaki tekrarlar oturum önbelleğinden yanıtlanır. Kota aşımında eklenti otomatik/sınırsız yeniden deneme yapmaz.

## Kullanım

1. Normal bir web sayfasını aç, eklentiye tıkla ve **Bu sayfada başlat** de.
2. “Bağlam hazır” durumunu bekle. Uzun sayfalarda bölüm ilerlemesi gösterilir; popup'ı kapatabilirsin.
3. Ana metindeki bir kelimeyi veya en fazla 200 karakterlik ifadeyi fareyle seç. Açıklama yanında açılır. Klavyeyle Shift + ok tuşlarıyla seçim de desteklenir.
4. **×** veya Escape ile kutuyu kapat. **Bu sayfada durdur** ile okumayı durdurup sekme bağlamını temizle.

Eklenti açık sayfanın ana metnini okur; bütün sitenin bağlantılarını taramaz. Konu özeti, kelimenin geçtiği orijinal paragraf ve komşu paragraflar birlikte anlamlandırılır. Sayfa metni veya adresi değişirse yeniden başlatman gerekir.

## Gizlilik ve güvenlik

- Sayfa metni doğrudan **Groq'a** gönderilir. Kendi anahtarını kullanman, sayfa metninin bilgisayarından çıkmadığı anlamına gelmez. Groq'un [veri açıklamalarını](https://console.groq.com/docs/your-data) incele.
- Başlatma sırasında çıkarılan ana metin ve sonraki seçim bağlamları aktarılır. Özel içeriklerde eklentiyi başlatmadan önce buna dikkat et. Form alanları ve düzenlenebilir alanlar metin çıkarımından hariçtir; sayfanın normal metni yine özel bilgi içerebilir.
- API anahtarı yalnızca `chrome.storage.local` içinde, güvenilir eklenti bağlamlarına açık tutulur. Senkronizasyona veya proje sahibinin sunucusuna gönderilmez. Bu alan şifreli bir kasa değildir; tarayıcı profiline/cihazına erişen biri anahtara da erişebilir.
- Sayfa metinleri, özetler ve en fazla 100 yanıt sekme oturumu için `chrome.storage.session` içinde tutulur. Durdurma, sekme kapanması veya tarayıcı oturumunun bitmesi bunları temizler. Anahtarı/modeli değiştirmek de mevcut sayfa oturumlarını kapatır.
- Telemetri veya analitik yoktur. Sayfa koduna API anahtarı aktarılmaz; model çıktısı HTML olarak çalıştırılmaz.

## Sınırlar ve sorun giderme

- İlk sürüm Chrome, Groq ve Türkçe/İngilizce metin içindir.
- Chrome iç sayfaları, Web Store, PDF görüntüleyici, görsel içindeki yazılar, farklı kökenden iframe'ler ve henüz yüklenmemiş içerik desteklenmez.
- Ana metin ve satır sonları toplamı en fazla 120.000 karakterdir; özetleme en fazla 10 × 12.000 karakterlik parça kullanır. Modelin token sınırı ayrıdır ve daha erken devreye girebilir.
- “Anahtar geçersiz”: anahtarı kontrol et, gerekirse yenisini oluştur. “Kota aşıldı”: bekle ve Console'daki limitlere bak. “Model/bağlam desteklenmiyor”: başka bir metin modeli veya daha kısa sayfa dene.
- “Sayfa değişti”: tekrar başlat. Hazırlık kesilirse veya bağlantı zaman aşımına uğrarsa yeniden dene; otomatik olarak yeni ücretli istek başlatılmaz.
- LLM açıklamaları hatalı olabilir; bağlam yetersiz olduğunda açıklamada belirsizlik belirtmesi istenir.

## Geliştirme ve doğrulama

```bash
npm run typecheck
npm test
npm run build
```

`npm test` önce paketi derler, sonra bağlam/istemci/oturum/arayüz davranışlarını ve paketi doğrular. Testler sahte API yanıtları kullanır; gerçek API anahtarı istemez ve canlı model kalitesini ölçmez.

Chromium üzerinde uçtan uca test:

```bash
npx playwright install chromium
npm run test:e2e
```

[Elle kontrol adımları](docs/manual-checks.md) gerçek hesap ve tarayıcıyla doğrulamayı anlatır. Kaynak kod `src/`, yüklenebilir çıktı `dist/` içindedir. `dist/` ve API anahtarları Git'e eklenmez.
