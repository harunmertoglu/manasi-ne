# Chrome üzerinde elle kontrol

1. README üzerinden derle ve `dist/` yükle. Ayarlar'da kendi Groq anahtarınla model doğrula. Listede görünse bile ses modellerinin kaydetme kontrolünü geçmemesini bekle.
2. Google Gemini API (`AIza…`) ve OpenRouter (`sk-or-v1-…`) sağlayıcılarını seçip model listesini getir. Gemini'de `models/` önekinin temizlendiğini (`gemini-2.5-flash`), OpenRouter'da yalnızca ücretsiz (`:free` ve `openrouter/free`) modellerin listelendiğini doğrula.
3. Geçersiz anahtar girip kaydetmeyi dene: açık hata gösterilmeli, önceki geçerli ayar bozulmamalı. Anahtar veya sayfa metni konsola yazılmamalı.
4. Türkçe bir sayfayı başlat. “Yüz kişi” ve “yüz ifadesi” gibi farklı kullanımları seç; aynı kelimenin bağlama uygun ayrı açıklamalarını kontrol et.
5. İngilizce finans metninde “headwinds” seç. İngilizce tanım ve bağlama uygun Türkçe karşılık bekle. Mecazı rüzgâr olarak açıklamamalı. Bu kontrol model kalitesini ölçer; otomatik testin yerine geçmez.
6. Aynı konumdaki kelimeyi yeniden seç; yeni sağlayıcı isteği oluşmamalı. Farklı bağlamda seç; yeni istek oluşmalı.
7. Çok hızlı iki farklı ifade seç; ilk cevabın yeni açıklamayı değiştirmediğini kontrol et. Kutu beklerken ×/Escape ile kapat; geç gelen cevap kutuyu açmamalı.
8. Popup'ı hazırlık sırasında kapat/aç; ilerleme korunmalı. Worker hazırlıkta sonlanırsa tekrar açıldığında işlem kesildi mesajı görünmeli.
9. Normal gezinme, SPA adres değişimi ve ana metne yeni bölüm eklenmesi önceki bağlamı kullanmamalı. Yeniden başlatma istenmeli. Kendi açıklama kutusu ve CSS animasyonları gereksiz geçersizleştirme üretmemeli.
10. Durdur, yeniden kelime seç: ağ isteği/kutu oluşmamalı. Sekmeyi kapat: ilgili session storage kaydı silinmeli.
11. Anahtarı sil: ilgili sağlayıcı anahtarı ve tüm session bağlamları temizlenmeli, açık sayfalar durmalı.
12. Chrome iç sayfası/PDF/metinsiz sayfa ve 120.000 karakteri aşan sayfa açık hata vermeli. 429/zaman aşımında otomatik sınırsız tekrar yapılmamalı.
13. Ayarlar'da **ChatGPT** sağlayıcısını seç: yerel yardımcı kurulu değilken kurulum komutunun (`npm run chatgpt:install -- --extension-id ...`) göründüğünü doğrula.
14. `npm run chatgpt:install -- --extension-id <id>` çalıştırdıktan sonra **ChatGPT ile giriş yap** düğmesiyle tarayıcıda OAuth girişini tamamla, `chatgpt.tokens.use.direct` izniyle modelleri getir, bir model seçip kaydet ve bir sayfada kelime açıklaması al. Ardından **ChatGPT oturumunu kapat** düğmesiyle yerel anahtar dosyasının (`~/.config/manasi-nedir/chatgpt/*.secret.json`) silindiğini doğrula.

Otomatik uçtan uca testler gerçek sağlayıcı ağlarına çıkmaz; sağlayıcı cevabı ve hata durumları test içinde taklit edilir. Gerçek anahtarı test dosyalarına, ekran görüntülerine veya hata raporlarına ekleme.
