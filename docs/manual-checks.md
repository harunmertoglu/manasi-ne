# Chrome üzerinde elle kontrol

1. README üzerinden derle ve `dist/` yükle. Ayarlar'da kendi Groq anahtarınla model doğrula. Listede görünse bile ses modellerinin kaydetme kontrolünü geçmemesini bekle.
2. Geçersiz anahtar girip kaydetmeyi dene: açık hata gösterilmeli, önceki geçerli ayar bozulmamalı. Anahtar veya sayfa metni konsola yazılmamalı.
3. Türkçe bir sayfayı başlat. “Yüz kişi” ve “yüz ifadesi” gibi farklı kullanımları seç; aynı kelimenin bağlama uygun ayrı açıklamalarını kontrol et.
4. İngilizce finans metninde “headwinds” seç. İngilizce tanım ve bağlama uygun Türkçe karşılık bekle. Mecazı rüzgâr olarak açıklamamalı. Bu kontrol model kalitesini ölçer; otomatik testin yerine geçmez.
5. Aynı konumdaki kelimeyi yeniden seç; yeni Groq isteği oluşmamalı. Farklı bağlamda seç; yeni istek oluşmalı.
6. Çok hızlı iki farklı ifade seç; ilk cevabın yeni açıklamayı değiştirmediğini kontrol et. Kutu beklerken ×/Escape ile kapat; geç gelen cevap kutuyu açmamalı.
7. Popup'ı hazırlık sırasında kapat/aç; ilerleme korunmalı. Worker hazırlıkta sonlanırsa tekrar açıldığında işlem kesildi mesajı görünmeli.
8. Normal gezinme, SPA adres değişimi ve ana metne yeni bölüm eklenmesi önceki bağlamı kullanmamalı. Yeniden başlatma istenmeli. Kendi açıklama kutusu ve CSS animasyonları gereksiz geçersizleştirme üretmemeli.
9. Durdur, yeniden kelime seç: ağ isteği/kutu oluşmamalı. Sekmeyi kapat: ilgili session storage kaydı silinmeli.
10. Anahtarı sil: local storage anahtarı ve tüm session bağlamları temizlenmeli, açık sayfalar durmalı. Sonrasında başlatma anahtar kurulumunu istemeli.
11. Chrome iç sayfası/PDF/metinsiz sayfa ve 120.000 karakteri aşan sayfa açık hata vermeli. 429/zaman aşımında otomatik sınırsız tekrar yapılmamalı.

Otomatik uçtan uca testler gerçek Groq ağına çıkmaz; sağlayıcı cevabı ve hata durumları test içinde taklit edilir. Gerçek anahtarı test dosyalarına, ekran görüntülerine veya hata raporlarına ekleme.
