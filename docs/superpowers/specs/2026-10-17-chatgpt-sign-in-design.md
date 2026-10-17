# Manası Nedir — ChatGPT hesabıyla kullanım tasarımı

## Amaç ve kabul edilen yaklaşım

Mevcut Groq seçeneğinin yanına, kullanıcının uygun ChatGPT planıyla kelime açıklaması alabilmesini sağlayan resmi Sign in with ChatGPT bağlantısı eklenir. Kullanıcı bir defalık yerel yardımcı kurulumunu kabul etti. Proje sahibine ait API anahtarı, sunucu, ödeme sistemi veya ortak kullanıcı hesabı kullanılmaz.

İlk hedef mevcut Linux ortamında Brave/Brave Origin, Chrome ve Chromium'dur. Groq seçeneği yardımcı kurmadan çalışmaya devam eder. ChatGPT yardımcısının macOS/Windows kurucuları bu sürümün kapsamı dışındadır; README platform sınırını açıklar.

Bu belge ChatGPT bağlantısını kapsar. Kullanıcının ayrıca bildirdiği Groq TPM sınırı ve tüketim iyileştirmeleri ayrı bir değişikliktir; ChatGPT desteği bunları çözmüş veya sınırsız kullanım sağlamış gibi sunulmaz.

## Resmi akışın getirdiği koşullar

- Açık kaynaklı, yerelde çalışan uygulamalar dinamik istemci kaydıyla izin isteyebilir. Her hesabın/kayıtlı çalışma alanının uygunluğu OpenAI tarafından belirlenir; giriş yapmak tek başına model kullanma izni değildir.
- OAuth dönüşü, girişten önce başlatılan `127.0.0.1` HTTP dinleyicisine gelir. PKCE S256, state ve OIDC nonce doğrulanır.
- Access, refresh ve ID token'ları tarayıcı depolamasında tutulmaz. Yardımcı bunları kullanıcıya özel yerel dosyada korur.
- İstekler resmi `https://api.openai.com/v1/responses` adresine, `store: false` ve `stream: true` ile yapılır. ChatGPT'nin özel web uçları veya başka bir uygulamanın istemci kimliği kullanılmaz.

Kaynaklar: [giriş](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [oturumlar](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [çıkarım](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [önizleme sınırları](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Kullanıcı deneyimi

1. Ayarlarda **Groq** ve **ChatGPT** seçenekleri sunulur. Mevcut kaydedilmiş Groq anahtarı ve modeli korunur; kullanıcı tekrar anahtar girmek zorunda kalmaz.
2. ChatGPT seçilince yardımcının kurulu olup olmadığı kontrol edilir. Eksikse, tek seferlik kurulum komutu ve tarayıcıdaki eklenti kimliğinin nereden alınacağı gösterilir. Node.js 22+ gereksinimi belirtilir.
3. İlk bağlantı sırasında `nativeMessaging` için isteğe bağlı tarayıcı izni istenir. Bu izin yalnızca kullanıcının ChatGPT bağlantısını başlatmasıyla talep edilir.
4. **Continue with ChatGPT** düğmesi resmi OpenAI giriş sayfasını mevcut tarayıcıda açar. Kullanıcı hesabını ve plan kullanım iznini OpenAI ekranında seçer. Bekleyen giriş iptal edilebilir; 5 dakika sonra zaman aşımına uğrar.
5. Giriş doğrulanınca hesap etiketi ve hesabın gerçekten kullanabildiği modeller gösterilir. Kullanıcı model seçip ChatGPT'yi etkinleştirir. Önceki sağlayıcı, yeni bağlantı/model doğrulanana kadar etkin kalır.
6. Sayfayı başlatma ve kelime seçme akışı aynıdır. Arayüz etkin sağlayıcıyı ve ChatGPT için etkin hesabı gösterir. Metnin seçilen sağlayıcıya gönderildiği açıkça belirtilir.
7. Kaydedilmiş ChatGPT hesapları arasında seçim, başka hesap/çalışma alanı ekleme ve seçili hesaptan çıkış bulunur. Aynı e-postalı kayıtlar istemci kimliğinin kısa bir son ekiyle ayırt edilir.
8. Yardımcı yoksa, giriş iptal edilirse, izin verilmezse, oturum süresi dolarsa veya kota aşılırsa anlaşılır hata verilir. Groq'a gizlice geçilmez; kullanıcı sağlayıcıyı kendisi değiştirir.

## Bileşenler ve veri akışı

- **Tarayıcı eklentisi:** Ayar ekranı, sağlayıcı/hesap seçimi, sayfa bağlamı, açıklama kutusu ve mevcut önbellek. ChatGPT token'larını almaz veya saklamaz.
- **Native messaging köprüsü:** Service worker ile yerel yardımcı arasında `chrome.runtime.connectNative` bağlantısı. Her mesajın istek kimliği vardır; yalnızca tanımlı komutlar ve boyutları doğrulanmış veriler iletilir.
- **Yerel yardımcı:** OAuth dinleyicisi, kimlik doğrulama, korumalı hesap kayıtları, token yenileme, OpenAI model listesi ve Responses API çağrıları. Groq isteklerine aracılık etmez.
- **Kurucu:** Yardımcının çalıştırılabilir dosyasını ve tarayıcı native host manifestini yalnızca kullanıcının dizinine kurar; sudo gerektirmez. Yardımcı, repo taşınsa da çalışması için derlenmiş paketten kullanıcı uygulama dizinine kopyalanır.

Native host adı `com.manasi_nedir.chatgpt` olur. `allowed_origins` yalnızca kurulum komutuna verilen eklenti kimliğini içerir; joker kullanılamaz. Yardımcı ayrıca kendisine geçirilen çağıran eklenti origin'ini doğrular. İçerik betikleri yardımcıya doğrudan erişemez.

Kurulum komutu biçimi: `npm run chatgpt:install -- --browser brave-origin --extension-id <id>`. Chrome, Chromium ve Brave için ayrı kullanıcı dizinleri desteklenir. Kurucu mevcut ilgisiz dosyaları değiştirmez. Kaldırma komutu host manifestini ve kurulan yardımcıyı kaldırır; hesap kayıtlarını silmek ayrı, açık bir seçenektir.

Yerel yardımcı giriş denemesi sırasında `127.0.0.1` üzerinde geçici bir port dinler. Dış ağ arayüzlerine bağlanmaz. Genel bir HTTP vekili veya sürekli çalışan yerel API sunucusu açılmaz. Eklenti-uygulama haberleşmesi stdio üzerinden native messaging ile yapılır.

Kaynak: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

## OAuth ve kimlik doğrulaması

- İlk çalışmada kararlı `ext_agent_host_id` üretilir ve sonraki çalıştırmalarda yeniden kullanılır. Hesap değişikliği veya çıkış host kimliğini yenilemez.
- İlk kayıt `client_id=dynamic_agent_client`, uygulamanın gerçek adı `agent_name_hint=Manası Nedir` ve resmi scope'larla başlar. Scope'lar: `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`; resource: `https://api.openai.com/v1`.
- Dinleyici açıldıktan sonra rastgele state, nonce ve PKCE verifier oluşturulur. Dönüş yolu `/auth/callback` olarak sabittir; dinamik port aynı giriş denemesi içinde değiştirilmez. `localhost`, `127.0.0.1` yerine kullanılmaz.
- Başarılı ilk dönüşteki verilmiş `client_id` saklanır ve token değişiminde kullanılır. `dynamic_agent_client` kimliği token değişiminde veya kayıtlı istemci olarak kullanılmaz.
- State uyuşmazlığı, eksik kod/istemci kimliği, OAuth hatası, farklı istemci kimliğiyle geri dönüş, zaman aşımı ve yinelenen callback reddedilir. Kod, yalnızca bir kez ve PKCE doğrulayıcısıyla değiştirilir.
- ID token imzası OpenAI discovery/JWKS verisiyle, issuer, audience, expiry ve nonce dahil doğrulanır. Sadece JWT içeriğini çözümlemek yeterli sayılmaz. Doğrulanmış subject ve verilen istemci kimliği hesabı/kaydı tanımlar.
- `chatgpt.tokens.use.direct` scope'u gerçekten verilmediyse plan kullanımı kapalı gösterilir. Uygun olmayan hesap için çıkartım denenmez.
- Tekrar girişte kayıtlı istemci kimliği ve aynı host kullanılır. Hesap seçme ekranı kullanılabilir; ID token'ı içeren bir URL'nin eklentiye taşınmasını önlemek için `id_token_hint` gönderilmez. Yeni giriş kimliği doğrulanmadan mevcut hesap/token'lar değiştirilmez.
- Yardımcı, eklentiye yalnızca OpenAI'nin sabit authorize origin/yolundaki giriş URL'sini bildirir; eklenti bunu yeni sekmede açar. Callback veya authorize URL'leri loglanmaz. Callback cevabı kod/token içermez ve harici kaynak yüklemez.

## Oturumların korunması

Hesap ve token kayıtları `~/.config/manasi-nedir/chatgpt/` altında kullanıcıya özel tutulur. Dizin izni `0700`, dosya izni `0600` olur; yazma geçici dosya + atomik değiştirmeyle yapılır. Sembolik bağlantı, uygunsuz sahiplik ve aşırı geniş dosya izinleriyle çalışılmaz. Bu dosyalar şifreli kasa olarak tanıtılmaz.

Her verilmiş istemci kimliği/doğrulanmış kimlik için ayrı kayıt tutulur. Eklentiye yalnızca opak kayıt kimliği, görünür hesap etiketi ve oturum durumu aktarılır. Access/refresh/ID token hiçbir native messaging cevabında, tarayıcı storage'ında, hata mesajında veya logda bulunmaz.

Süresi dolmaya yaklaşan access token resmi token endpoint'iyle yenilenir. Dönen access token, dönen refresh token, expiry ve scope'lar birlikte atomik saklanır. Aynı oturum için yenilemeler süreçler arasında dosya kilidiyle sıralanır; farklı tarayıcılardan aynı hesabı kullanan iki yardımcı dönen refresh token'ını yarıştırmaz.

Çıkışta yeni istekler engellenir; discovery belgesindeki `revocation_endpoint` kullanılarak yenilenebilir oturumu sonlandırma denenir. Ardından access/refresh/ID token yerelden silinir; hesap/istemci eşlemesi ve host kimliği ileride giriş için korunur. Ağ nedeniyle iptal başarısızsa yerel çıkış yine tamamlanır ve ChatGPT ayarlarındaki erişim yönetimi bağlantısı gösterilir.

## Model listesi ve açıklamalar

Model listesi seçilen hesabın access token'ıyla resmi `/v1/models` adresinden alınır. Görünür `models` kayıtlarının `display_name` değeri arayüzde gösterilir ve `slug` değeri istekte kullanılır; API'nin sıralaması korunur. Sabit veya başka hesaptan kalmış model listesi gösterilmez.

Responses istekleri `instructions` ve veri olarak ayrılmış `input` dizisi kullanır. `stream: true`, `store: false` zorunludur. `max_output_tokens`, `temperature`, `conversation`, `previous_response_id` ve önizlemede desteklenmeyen alanlar gönderilmez. Çıkarım için araç, web araması veya connector kullanılmaz.

SSE olayları parça sınırları, UTF-8 ve birden fazla olay açısından doğru ayrıştırılır. Metin delta'ları birleştirilir; yalnızca `response.completed` sonrasında geçerli JSON/alan doğrulamasından geçen yanıt başarılı kabul edilir. `response.failed`, `response.incomplete`, kopan akış, bozuk çıktı ve kota hatası başarılı/önbelleklenmiş cevap sayılmaz. Yerel byte ve süre sınırlarıyla bellek/süresiz bekleme engellenir; bu sınırlar otomatik yeni API isteği başlatmaz.

Mevcut Türkçe→Türkçe ve İngilizce→İngilizce + Türkçe anlam sözleşmesi korunur. Orijinal paragraf, komşu bağlam ve sayfa özeti her sorgunun girdisinde kalır; sağlayıcının kalıcı hafızası olduğu varsayılmaz.

## Mevcut durum ve önbellekle uyum

Eski sağlayıcı alanı olmayan Groq ayarları Groq olarak taşınır. Her sağlayıcının ayarı ayrı saklanır. Etkin ayar, sağlayıcı, model ve ChatGPT için hesap kimliğini belirtir; ChatGPT token içermez.

Sağlayıcı/hesap/model değişiminde veya çıkışta mevcut sekme bağlamları geçersiz kılınır; geç gelen eski cevaplar gösterilmez. Önbellek kimliği sağlayıcı, hesap/kayıt ve modeli içerir. Bir hesaptaki açıklama başka hesabın veya sağlayıcının cevabı gibi sunulmaz.

Groq yapılandırılmış kullanıcıda yardımcı kurulu olmaması başlangıcı engellemez. Oturum durumu kontrolü gizlice giriş veya plan kullanımı başlatmaz. Hesaba ilişkin sınırlı metadata ve aktif model dışında bilgiler içerik betiklerine verilmez.

## Doğrulama ve teslim

- OAuth state/nonce/PKCE, eksik izin, imza/issuer/audience/expiry, yinelenen dönüş, iptal ve tekrar giriş kimlik kontrolleri test edilir.
- Token dosyalarının izinleri, atomik yenileme, süreçler arası kilitleme, dönen refresh token'ının saklanması ve çıkış temizliği geçici dizinlerle test edilir.
- Native framing, boyut sınırları, yanlış origin/komut/istek kimliği, kopan port ve kurucunun yalnızca hedef kullanıcı dizinlerini değiştirmesi doğrulanır.
- SSE parça sınırları, terminal başarı/hata olayları, kısmi yanıt, bozuk JSON ve kota hatası test edilir. Hassas alanların köprü yanıtlarına veya loglara geçmediği doğrulanır.
- Mevcut Groq testleri ve gerçek tarayıcı davranışları korunur. Kurucu Linux üzerinde geçici tarayıcı profiliyle gerçek native host başlatılarak kontrol edilir; sahte endpoint/kimlikler yalnızca test bağımlılıklarında kullanılabilir.
- Canlı giriş, OpenAI onayı ve plan uygunluğu gerçek kullanıcıyla ayrıca doğrulanır; yalnızca sahte testlerin geçmesi canlı abonelik kullanımının doğrulandığı anlamına gelmez.
- README kurulum/kaldırma, giriş/çıkış, model seçimi, Linux kapsamı, ChatGPT planına ait kullanım sınırları ve hata çözümünü anlatır. Groq'un ücretsiz kotasıyla ChatGPT planı birbirine karıştırılmaz.

## Kapsam dışı

Uzak backend, ortak API anahtarı, web oturumu/cookie kopyalama, Codex/başka uygulama kimliğini taklit etme, otomatik ücretli API'ye geçiş, kotayı aşma, macOS/Windows kurucuları ve Chrome Web Store'a yayınlama bu değişikliğin kapsamı dışındadır.
