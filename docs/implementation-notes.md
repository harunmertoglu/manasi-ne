# İlk sürümün uygulama ve doğrulama kaydı

17 Ekim 2026. İlk sürüm kullanıcıya ait Groq anahtarıyla doğrudan çalışır. Tamamlanan işler [uygulama planında](superpowers/plans/2026-10-17-manasi-nedir.md) işaretlidir.

## Doğrulama

- `npm test`: 48 test geçti. Gerçek metin çıkarma, konum, çıktı doğrulama, durum/önbellek ve Chrome mesaj yönlendirme davranışları test edildi.
- `npm run typecheck`: kaynak, test ve Playwright dosyaları başarılı.
- `npm run test:e2e`: Chromium'da 1 akış geçti; ayarlar, başlatma, TR/EN açıklama, aynı kullanımın önbelleği, sayfa değişimi, durdurma ve anahtar silme kontrol edildi.
- Üretim paketi `dist/` klasörüne derlendi. Çalışma zamanı için npm bağımlılığı veya backend gerekmiyor.
- Bağımsız kod incelemesindeki iki önemli bulgu düzeltildi. Gizli/düzenlenebilir üst öğeler içindeki semantic root'lar artık hariç tutuluyor. Durdurulmuş başlatmalar veya sorgular, ayar okuma/DOM çıkarma gibi beklemelerden sonra yeniden API isteği başlatamıyor. Hataları önce gösteren regresyon testleri eklendi ve tüm testler tekrar geçti.

## Uygulama sırasında verilen kararlar

1. Ayrı çalışma alanı için yerel Git worktree kullanıldı; erişilebilir yerel araçlarda yalnızca bekleyen worktree işlemini sorgulama aracı vardı. Kod `feat/groq-extension` dalında tutuldu. Sonuç: ana checkout'a birleştirme ayrıca yapılmalı; uzak depoya etkisi yok.
2. Başlatma, hazırlık durumunu hemen döndürüyor; çok parçalı özetleme worker'da sırayla sürüyor. Böylece popup kapansa da ilerleme saklanıyor. İşlem worker kapanmasıyla kesilirse kullanıcı yeniden başlatmalı; bu durum sessizce hazır gösterilmiyor.
3. Chromium testinde eklenti worker ağı context route ile yakalanamadığı için dış ağ sınırı worker `fetch` işlevinde taklit edildi. UI, içerik betiği, API istemcisinin veri oluşturması, gerçek Chrome depolaması/mesajlaşması çalışıyor. Sınır: canlı Groq bağlantısı ve model kalitesi bu testten çıkarılamaz.
4. Headless araç çubuğu popup'ı Playwright Page olarak sunulmadığından, CDP ile gerçek action ve activeTab izni tetiklenip aynı popup belgesi normal sekmede açıldı; yalnızca aktif sekmeyi bulma çağrısı hedef sayfaya yönlendirildi. Sınır: yerel popup'ın odak/kapanma davranışı elle kontrol edilmeli.

## Ertelenen küçük bulgu

Tek bir paragraf 120.001 karakteri de aştığında sayfa güvenli biçimde reddedilir; ancak toplam bütçe mesajı yerine genel istek hatası gösterilebilir. Bu, aşırı büyük sayfalardaki hata metnini etkiler; içerik API'ye gönderilmez.

Canlı hesapla kalite ve native popup kontrolleri için [elle kontrol listesi](manual-checks.md) kullanılabilir. Testlerde hiçbir gerçek anahtar kullanılmadı. GitHub'a yayınlama veya remote bağlantısı yapılmadı.
