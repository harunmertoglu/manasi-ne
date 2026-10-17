# Manası Nedir — İlk sürüm tasarımı

## Amaç ve kabul edilen kapsam

Chrome üzerinde çalışan eklenti, kullanıcının açık web sayfasında seçtiği kelimenin o metindeki anlamını açıklar. Türkçe kelimeler Türkçe açıklanır. İngilizce kelimeler İngilizce açıklanır ve ayrıca bağlama uygun Türkçe karşılık gösterilir. Kullanıcı ilk sürümün Groq ile başlamasını kabul etti.

Her kullanıcı kendi Groq API anahtarını girer. Uygulamanın backend'i, ortak API anahtarı, kullanıcı hesabı veya ödeme sistemi yoktur. Sayfa içeriği kullanıcının anahtarıyla doğrudan Groq'a gönderilir. README bu kurulumu ve kota/ücret ayrımını anlatır.

## Kullanıcı akışı

1. Kullanıcı eklenti ayarlarında Groq anahtarını girip bağlantıyı doğrular. Model seçimi doğrulanan hesap için kullanılabilir modellerden yapılır; desteklenmeyen model açık bir hata verir.
2. Eklenti açılır penceresindeki “Bu sayfada başlat” düğmesi, açık sekmenin o anda yüklenmiş ana metnini okur. Başlatma ekranı, metnin Groq'a gönderileceğini açıkça belirtir.
3. Eklenti sayfanın konu özetini hazırlar. Hazırlanıyor, hazır ve hata durumları gösterilir. Hazır olmadan kelime sorgusu başlatılmaz.
4. Kullanıcı kelimeyi seçtiğinde seçim yanında açıklama kutusu açılır. Kutuda kelime, bağlamsal açıklama ve İngilizce için ayrıca Türkçe karşılık bulunur. Kullanıcı kelime öbeği de seçebilir; aşırı uzun seçimler kısa bir mesajla reddedilir.
5. Kutu kapatılabilir. Eklenti o sayfada durdurulabilir. Yeni sayfa yüklendiğinde önceki sayfanın bağlamı kullanılmaz.

## Tarayıcı ve izinler

İlk hedef Chrome Manifest V3'tür. Eklenti `activeTab`, `scripting` ve `storage` izinlerini kullanır. Ağ izni yalnızca Groq API alan adını kapsar. Bütün sitelere kalıcı erişim istenmez.

Tarayıcı iç sayfaları, Chrome Web Store gibi kısıtlı sayfalar ve PDF görüntüleyici ilk sürüm kapsamı dışındadır. Ana belge metni desteklenir; başka kökenden iframe içerikleri, görsel içindeki metinler ve henüz yüklenmemiş yazılar okunmaz.

## Bileşenler

- **Ayarlar sayfası:** Anahtarı kaydetme, değiştirme, silme ve bağlantı/model doğrulama.
- **Eklenti açılır penceresi:** Başlat/durdur, hazırlık durumu ve ayarlara erişim.
- **Content script:** Ana metin çıkarma, seçimin belge içindeki yerini bulma ve açıklama kutusunu gösterme. Kutunun stilini sayfadan ayırmak için Shadow DOM kullanılır.
- **Service worker:** Groq istekleri, kimlik bilgileri, hata dönüşümü ve içerik betiğiyle mesajlaşma. Sorgu kabulünü belirli mesaj türleri ve gönderen eklenti sekmesiyle sınırlar.
- **Bağlam modülü:** Metni paragraflara ayırma, özetleme girdisini sınırlama, seçim çevresini oluşturma ve önbellek anahtarı üretme.

Uygulama TypeScript ile yazılır ve yüklenebilir `dist/` klasörüne derlenir. Arayüzler küçük olduğundan bir UI framework'ü gerekmez.

## Sayfa bağlamı ve Groq akışı

“Site” açık sekmenin mevcut sayfasıdır; bağlantılar takip edilmez. Ana içerik `article`/`main` gibi semantik bölgelerden, bunlar yoksa temizlenmiş belge gövdesinden çıkarılır. Navigasyon, reklam, script, form alanı ve eklentinin kendi arayüzü hariç tutulur. Okunabilir metin bulunamazsa kullanıcıya bildirilir.

Başlatmada metin paragrafları korunarak sekmeye ait oturum kaydında tutulur ve LLM ile kısa konu özeti üretilir. Modelin kalıcı hafızası olduğu varsayılmaz.

Kısa sayfalarda tam ana metin özet isteğine girer. Uzun sayfalarda boyutları sınırlı parçalar sırayla özetlenir, ardından bu özetlerden genel özet üretilir. Aşırı büyük sayfalarda toplam işleme bütçesi aşılınca işlem sonlandırılır ve sayfanın tamamının işlenemediği açıkça bildirilir; eksik metinle hazır durumu gösterilmez. Başlangıç bütçeleri: yaklaşık 120.000 metin karakteri, parça başına 12.000 karakter, en fazla 10 parça. API token sınırı bu karakter limitlerinden bağımsızdır; sağlayıcı sınır hataları ayrıca ele alınır.

Her anlam sorgusunda seçilen ifade, seçimin tam cümlesi/paragrafı, komşu paragraflar, sayfa başlığı ve konu özeti gönderilir. Tek başına genel özet anlam belirlemek için yeterli kabul edilmez. Anahtar başlık veya URL parametresiyle sayfa koduna aktarılmaz.

Sayfa metni ve seçim kullanıcı verisi olarak ayrılır; içlerindeki komutlar LLM talimatı olarak uygulanmaz. LLM yalnızca verilen kullanımı açıklamalı; bağlam yetersizse bunu belirtmeli ve anlam uydurmamalıdır. Sonuç HTML olarak çalıştırılmaz, metin olarak çizilir.

## Durum, güncelleme ve önbellek

Anahtar yalnızca `chrome.storage.local` içinde tutulur, senkronizasyona gönderilmez. Depolama erişimi güvenilir eklenti bağlamlarıyla sınırlandırılır; içerik betiği anahtarı alamaz. Bu depolama şifreli kasa olarak tanıtılmaz. Anahtar loglara yazılmaz.

Sekme bağlamı, işleme durumu ve sınırlı cevap önbelleği `chrome.storage.session` içinde tutulur; worker'ın uyuması veriyi kaybettirmez. Devam eden ağ isteği kesilirse işlem yeniden denenebilir hata durumuna alınır; arayüz süresiz beklemez.

Önbellek anahtarı sayfa metni sürümü, seçimin konumu/çevre metni, model ve açıklama biçimini içerir. Aynı kelimenin farklı bağlamlardaki kullanımları karışmaz. En fazla son 100 cevap saklanır. Durdurma, sekmenin kapanması veya tarayıcı oturumunun bitmesi bağlamı temizler.

Tam sayfa gezinmesi ve SPA adres değişikliği eski bağlamı geçersiz kılar. Ana içerikte anlamlı değişiklik algılanırsa yeni sorgular durdurulur ve yeniden başlatma istenir. Kullanıcı yeni seçim yaptığında önceki sorgunun geç gelen cevabı yeni kutuyu değiştiremez.

## Hatalar ve sınırlar

Eksik/geçersiz anahtar, desteklenmeyen model, 429 kota sınırı, zaman aşımı, bağlantı sorunu, hatalı model çıktısı ve okunamayan sayfa ayrı anlaşılır mesajlar üretir. Sessiz veya sınırsız yeniden deneme yapılmaz. Kullanıcı yeniden deneyebilir; çift istekler engellenir.

Yanıtın kelime, açıklama, dil ve gerektiğinde Türkçe karşılık alanları doğrulanır. Açıklama kısa tutulur. İlk sürüm Türkçe ve İngilizceye odaklanır; başka diller için desteklenmiyor mesajı verir.

## README

Türkçe README; proje amacı, örnek çıktı, kurulum/derleme, Chrome'da paketlenmemiş eklenti yükleme, Groq hesabı ve API anahtarı oluşturma, anahtarı bağlama/silme, model seçimi, ücretsiz kota ve kullanım ücretleri, sayfa verisinin Groq'a gönderilmesi ve bilinen sınırlamaları kapsar. Gerçek anahtar içeren dosya veya örnek eklenmez. Depoyu yayımlamak bu aşamanın parçası değildir.

## Doğrulama ve kabul ölçütleri

- Türkçe çok anlamlı kelime ve İngilizce mecaz/terim örneklerinde doğru bağlamın isteğe taşındığı kontrol edilir.
- Aynı kelimenin farklı iki konumdaki kullanımı farklı önbellek kaydı üretir.
- Uzun metin işleme, bütçe aşımı, içerik değişimi ve geç gelen cevap davranışları doğrulanır.
- Geçersiz anahtar, 429 ve bozuk yanıt durumları sahte API yanıtlarıyla test edilir.
- Manifest, TypeScript kontrolü ve üretim derlemesi doğrulanır; gerçek Groq anahtarı olmadan canlı model kalitesi ölçüldü iddiasında bulunulmaz.
- Chrome'da kullanıcıyla yapılabilecek yükleme/etkileşim kontrolü README'de açıkça tarif edilir. Tarayıcı otomasyonu mevcutsa aynı akış onunla da doğrulanır.

## Sonraki sürümlere bırakılanlar

Gemini/OpenAI/Claude bağlantıları, ChatGPT abonelik girişi, Firefox paketi, PDF/OCR, bütün siteyi tarama, kalıcı kelime defteri ve cihazlar arası senkronizasyon ilk sürüm kapsamı dışındadır. Sağlayıcı çağrıları ayrı bir modülde tutularak gelecekteki eklemeler kolaylaştırılır.
