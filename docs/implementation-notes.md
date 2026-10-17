# İlk sürümün uygulama ve doğrulama kaydı

17 Ekim 2026. İlk sürüm kullanıcıya ait Groq anahtarıyla doğrudan çalışır; çoklu sağlayıcı güncellemesiyle **Google Gemini API**, **OpenRouter Ücretsiz Modeller (`:free` ve `openrouter/free`)** ve isteğe bağlı yerel yardımcı üzerinden **ChatGPT ile Giriş (`Sign in with ChatGPT`)** eklendi.

## Doğrulama

- `npm test`: 15 test dosyasında 77 test geçti. Gerçek metin çıkarma, konum, çıktı doğrulama, durum/önbellek, Chrome mesaj yönlendirme, Gemini model normalizasyonu, OpenRouter ücretsiz model filtreleme/engelleme, yerel ChatGPT OAuth/PKCE/JWKS doğrulaması, `0600` izinli kimlik bilgisi deposu, `/v1/responses` SSE ayrıştırıcısı ve Native Messaging çerçeveleme davranışları test edildi.
- `npm run typecheck`: `src/`, `helper/`, `tests/` ve `e2e/` dosyaları sıfır hatayla doğrulandı.
- `npm run test:e2e`: Chromium'da 2 uçtan uca akış geçti; hem Groq akışı hem de Gemini, OpenRouter ücretsiz modeller ve yerel yardımcı sınırı üzerinden ChatGPT giriş/açıklama/çıkış akışı doğrulandı.
- Üretim paketi `dist/` klasörüne, yerel ChatGPT yardımcısı `dist-helper/chatgpt-host.mjs` dosyasına derlendi.

## Uygulama sırasında verilen kararlar

1. **Çoklu Sağlayıcı Mimarisi:** Groq, Google Gemini API (`https://generativelanguage.googleapis.com/v1beta/openai`) ve OpenRouter (`https://openrouter.ai/api/v1`) doğrudan eklenti içinden çalışır; hiçbir yerel yardımcı program gerektirmez.
2. **OpenRouter Ücretsiz Model Zorunluluğu:** OpenRouter'da hem model listeleme (`listModels`) hem doğrulama (`verify`) hem de çalışma zamanı çağrıları (`chat`) yalnızca `openrouter/free` ve sıfır fiyatlı `:free` modellerine izin verir; ücretli modeller istemci katmanında reddedilir.
3. **Yerel ChatGPT Yardımcısı (`Sign in with ChatGPT`):** OpenAI'ın resmi açık kaynak `dynamic_agent_client` akışı `http://127.0.0.1:<port>/auth/callback` geri dönüşü, PKCE (`S256`), JWKS tabanlı `id_token` imza doğrulaması, `chatgpt.tokens.use.direct` kapsam kontrolü ve `/v1/responses` (`store: false, stream: true`) SSE akışıyla yerel Node.js yardımcısında (`helper/`) uygulandı. OAuth jetonları tarayıcı depolamasına girmez; yalnızca `~/.config/manasi-nedir/chatgpt/` altında `0700`/`0600` izinleriyle tutulur.
4. **Bağlam ve Önbellek İzolasyonu:** `cacheKey` içine aktif `provider` ve `accountId` dahil edildi; aktif sağlayıcı, model veya hesap değiştiğinde açık sayfa oturumları (`stopAll`) sıfırlanır ve hata durumunda sessizce başka sağlayıcıya geçilmez.

Canlı hesapla kalite ve native popup kontrolleri için [elle kontrol listesi](manual-checks.md) kullanılabilir. Testlerde hiçbir gerçek anahtar kullanılmadı. GitHub'a yayınlama veya remote bağlantısı yapılmadı.
