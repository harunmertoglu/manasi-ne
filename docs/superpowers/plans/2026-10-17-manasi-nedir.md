# Manası Nedir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcının kendi Groq anahtarıyla açık sayfadaki Türkçe/İngilizce kelimelerin bağlamsal anlamını açıklayan, Chrome'a yüklenebilir ilk sürümü oluşturmak.

**Architecture:** Manifest V3 content script sayfayı okur ve seçim kutusunu gösterir. Service worker anahtarı ve Groq çağrılarını yönetir; sekmeye ait bağlam session storage'da tutulur. Ayarlar ve popup eklentiye ait yerel sayfalardır; backend yoktur.

**Tech Stack:** TypeScript, Chrome Extensions API, esbuild, Vitest + jsdom; framework olmadan HTML/CSS. Bağımlılık sürümleri uygulama başlangıcında uyumlu sürümlerden seçilir ve lockfile'a kaydedilir.

**Spec:** `docs/superpowers/specs/2026-10-17-manasi-nedir-design.md`

## Global Constraints

- İlk hedef Chrome Manifest V3'tür.
- Eklenti `activeTab`, `scripting` ve `storage` izinlerini kullanır.
- Ağ izni yalnızca Groq API alan adını kapsar.
- Her kullanıcı kendi Groq API anahtarını girer.
- Uygulamanın backend'i, ortak API anahtarı, kullanıcı hesabı veya ödeme sistemi yoktur.
- Anahtar yalnızca `chrome.storage.local` içinde tutulur, senkronizasyona gönderilmez.
- Depolama erişimi güvenilir eklenti bağlamlarıyla sınırlandırılır; içerik betiği anahtarı alamaz.
- Sekme bağlamı, işleme durumu ve sınırlı cevap önbelleği `chrome.storage.session` içinde tutulur.
- Başlangıç bütçeleri: yaklaşık 120.000 metin karakteri, parça başına 12.000 karakter, en fazla 10 parça.
- En fazla son 100 cevap saklanır.
- İlk sürüm Türkçe ve İngilizceye odaklanır.
- Depoyu yayımlamak bu aşamanın parçası değildir.
- Gerçek Groq anahtarı olmadan canlı model kalitesi ölçüldü iddiasında bulunulmaz.

## Review Focus

- Aynı kelimenin aynı sayfadaki farklı kullanımları: seçimin gerçek DOM konumu üzerinden doğru paragraf bulunmalı (Task 1 ve 5).
- Boş, yalnızca navigasyon içeren veya aşırı büyük sayfa: metin bulunamadı/bütçe aşıldı sonucu verilmeli (Task 1 ve 4).
- Sayfanın eklentiyi taklit eden mesajları ve HTML içeren model cevabı: anahtara erişilememeli ve çıktı çalıştırılmamalı (Task 3 ve 5).
- Worker yeniden başlaması veya gezinme sırasında tamamlanan istek: bekleme sonlanmalı ve eski bağlam geri yazılmamalı (Task 4).
- Eklenti kutusunun eklenmesi ve küçük sayfa animasyonları: kendi UI değişimleri bağlamı geçersiz kılmamalı (Task 5).

## Dosya haritası

- `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`: bağımlılıklar ve komutlar.
- `scripts/build.mjs`, `public/manifest.json`: worker/module ve content script/IIFE derlemesi; statik dosyaları `dist/`e kopyalama.
- `public/popup.html`, `public/options.html`, `public/ui.css`: eklenti sayfaları.
- `src/shared/types.ts`, `src/shared/messages.ts`: veri tipleri ve mesaj doğrulaması.
- `src/context/extract.ts`, `chunks.ts`, `selection.ts`, `cache.ts`: metin, konum, bütçe ve önbellek işlevleri.
- `src/groq/client.ts`, `prompts.ts`, `schema.ts`: doğrudan API, talimatlar ve çıktı doğrulaması.
- `src/background/settings.ts`, `state.ts`, `controller.ts`, `index.ts`: güvenilir depolama, yaşam döngüsü ve olay yönlendirmesi.
- `src/content/index.ts`, `card.ts`, `watch.ts`: seçim, Shadow DOM kutusu ve sayfa değişimi izleme.
- `src/popup.ts`, `src/options.ts`: kullanıcı etkileşimi.
- `tests/*.test.ts`, `tests/helpers/chrome.ts`, `tests/fixtures/*`: anlamlı davranış testleri ve sahte Chrome/API.
- `README.md`, `docs/manual-checks.md`: kurulum ve etkileşim kontrolü.

## Ortak veri sözleşmeleri

`src/shared/types.ts` aşağıdaki dışa aktarımları tanımlar:

```ts
type PageContent = { url: string; title: string; paragraphs: string[]; version: string };
type SelectionContext = { text: string; paragraphIndex: number; startOffset: number; surrounding: string[] };
type Meaning = { word: string; language: 'tr' | 'en'; explanation: string; turkishEquivalent?: string };
type Settings = { apiKey: string; model: string; validated: boolean };
type PageStatus = 'preparing' | 'ready' | 'stale' | 'error';
type PageState = { tabId: number; generation: string; page: PageContent; status: PageStatus; summary: string; updatedAt: number; error?: string };
type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
type ModelOption = { id: string };
```

UI'ya gönderilen ayar bilgisi API anahtarını içermez. Ayarlar sayfasında kayıtlı anahtar tekrar gösterilmez; yeni anahtar girişi veya silme sunulur. Anlamlandırma çıktısında `language: 'en'` için boş olmayan `turkishEquivalent` zorunludur. Diğer dil sonuçları ayrı `unsupported_language` hatasıdır.

### Task 1: Metin çıkarma ve bağlam temeli

**Files:** Create proje yapılandırması, build betiği, `src/shared/types.ts`, `src/context/*`, `tests/context.test.ts`, `tests/fixtures/context.html`.

**Interfaces:**
- `extractPage(document: Document): PageContent`; `version` temizlenmiş metnin deterministik parmak izidir.
- `chunkText(paragraphs: string[]): string[]`; 120.000 toplam karakter ve 10 parça sınırında hata üretir, parça üst sınırı 12.000 karakterdir. Tek büyük paragraf bölünebilir.
- `resolveSelection(range: Range, document: Document): SelectionContext`; kelime uzunluğu 1–200 karakterdir; gerçek Range konumunu kullanır.
- `cacheKey(page: PageContent, selection: SelectionContext, model: string): string`.
- DOM eşlemesi: `extract.ts` içindeki `collectBlocks(document): {element: Element; text: string}[]` hem çıkarma hem seçim tarafından kullanılır; aynı paragraf dizinlerini sağlar. İç içe bloklar iki kez sayılmaz.

- [x] **Step 1:** `npm run build`, `npm run typecheck`, `npm test` komutlarını tanımlayan yapılandırmayı ve Vitest/jsdom ortamını kur; bağımlılıkları yükle, lockfile kaydet. Manifest/statik UI dosyalarının eklenmesini Task 6'da tamamla.
- [x] **Step 2:** Testleri yaz: `extractPage` menü/form/script/eklenti hostunu dışlar; metinsiz sayfa hata verir; yinelenen “yüz” seçiminde ikinci Range ikinci paragrafı döndürür; 120.001 karakter reddedilir; 12.001 karakterlik paragraf parçalanır; 120.000 karakter sınırı korunur; farklı konumlar farklı cache key üretir. `npm test -- tests/context.test.ts` çalıştır ve uygulama eksikliğinden başarısızlığı gör.
- [x] **Step 3:** Sözleşmeleri ve bağlam işlevlerini uygula. Semantik köklerde birden çok makale varsa hepsini belge sırasıyla dahil et. Komşu bağlamda önceki, seçilen ve sonraki paragrafı gönder; aşırı büyük paragrafta seçim çevresindeki en fazla 12.000 karakteri koru.
- [x] **Step 4:** `npm test -- tests/context.test.ts` ve `npm run typecheck` başarılı olmalı.
- [x] **Step 5:** Bu görevin dosyalarını commit et: `feat: extract page and selection context`.

### Task 2: Groq API ve cevap sözleşmesi

**Files:** Create `src/groq/{client,prompts,schema}.ts`, `tests/groq.test.ts`.

**Interfaces:** Task 1 tiplerini kullanır. `GroqClient` constructor'ı `(settings: Settings, fetcher?: typeof fetch)` alır; metotları `listModels(): Promise<ModelOption[]>`, `verify(): Promise<void>`, `summarize(text: string): Promise<string>`, `explain(page: PageContent, summary: string, selection: SelectionContext): Promise<Meaning>` olur.

- [x] **Step 1:** Sahte fetch ile 401, 429, bağlantı hatası, bozuk JSON, eksik İngilizce karşılık, desteklenmeyen dil ve başarılı TR/EN cevap testlerini yaz. `explain` girdisinin özetle beraber doğru orijinal paragrafı içerdiğini, sayfa metninin developer talimatına eklenmediğini doğrula. `npm test -- tests/groq.test.ts` başlangıçta başarısız olmalı.
- [x] **Step 2:** Uygulamadan önce resmi Groq belgelerinden `/models`, `/chat/completions`, hata ve desteklenen çıktı biçimi ayrıntılarını doğrula. Fetch tabanlı istemciyi uygula; 45 saniye zaman aşımı, otomatik yeniden deneme olmaması, JSON çıktısı ve alan doğrulaması kullan. Model kimliğini hesap listesinden al; chat yeteneğini kısa gerçek `verify` isteğiyle doğrula. Anahtar veya ham hassas istek içeriğini hata metnine koyma.
- [x] **Step 3:** Açıklama talimatını yaz: seçilen kullanıma odaklan, TR→TR, EN→EN + Türkçe karşılık, kısa açıklama, yetersiz bağlamda belirsizliği belirt. Sayfa ve seçim verilerini JSON kullanıcı girdisinde taşı. Özet çıktısını da güvenilmeyen veri olarak ele al.
- [x] **Step 4:** `npm test -- tests/groq.test.ts` ve `npm run typecheck` başarılı olmalı. Canlı hesap gerekmez.
- [x] **Step 5:** Commit: `feat: add Groq contextual explanation client`.

### Task 3: Anahtar yönetimi ve ayarlar

**Files:** Create `src/shared/messages.ts`, `src/background/settings.ts`, `src/options.ts`, `public/options.html`, `public/ui.css`, `tests/settings.test.ts`, `tests/helpers/chrome.ts`.

**Interfaces:** `getSettings(): Promise<Settings | null>`, `validateAndSaveSettings(apiKey: string, model: string): Promise<void>`, `clearSettings(): Promise<void>`. Mesajlar ayrıştırılan `unknown` girdiden doğrulanır. Ayar yazma/silme/model listeleme yalnızca `chrome-extension://<id>/options.html` göndericisine açıktır; content script'e ayar okuma yanıtı verilmez.

- [x] **Step 1:** Chrome storage/message taklitleriyle testleri yaz: `setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})` uygulanır; başarısız doğrulama geçerli ayarı ezmez; içerik betiği anahtarı okuyamaz veya ayar değiştiremez; anahtar silinince doğrulama kalkar. `npm test -- tests/settings.test.ts` başarısız olmalı.
- [x] **Step 2:** Depolama ve doğrulamayı uygula. Anahtar/model değişiminde mevcut sekme bağlamlarını geçersiz kılmak üzere controller'a olay bildir. Anahtar yalnızca güvenilir UI mesajından ve HTTP Authorization başlığından geçer; session storage'a yazılmaz.
- [x] **Step 3:** Ayarlar formunu oluştur: maskeli anahtar girişi, model listesini getir, model seç, doğrula/kaydet, anahtarı sil; durum mesajı ve tıklama kilidi. Model doğrulanmadan başlatma yapılamaz.
- [x] **Step 4:** `npm test -- tests/settings.test.ts` ve `npm run typecheck` başarılı olmalı.
- [x] **Step 5:** Commit: `feat: add private local Groq settings`.

### Task 4: Sekme oturumu ve istek koordinasyonu

**Files:** Create `src/background/{state,controller,index}.ts`, `tests/controller.test.ts`.

**Interfaces:** `PageController.start(tabId: number, page: PageContent): Promise<Result<PageState>>`, `.stop(tabId: number): Promise<void>`, `.invalidate(tabId: number): Promise<void>`, `.status(tabId: number): Promise<PageState | null>`, `.explain(tabId: number, generation: string, selection: SelectionContext): Promise<Result<Meaning>>`. Constructor storage ve istemci fabrikasını bağımlılık olarak alır; testlerde sahte saat/istemci kullanılır.

- [x] **Step 1:** Testleri yaz: kısa/çok parçalı özet, tüm parçalar tamamlanmadan hazır olmama, 100 kayıt sınırı, aynı bağlam için çift istek birleştirme, stop/gezinti sonrası geç cevabın yazılmaması, worker yeniden başlatıldığında takılı hazırlık durumunun kullanıcıya hata dönmesi. `npm test -- tests/controller.test.ts` başarısız olmalı.
- [x] **Step 2:** Controller ve session storage katmanını uygula. Her başlangıca yeni generation ata; her asenkron yazmadan önce generation doğrula. Parçaları sırayla özetle, birden fazlaysa özetleri birleştir. Worker başlangıcında önceki çalışmadan kalan preparing durumunu hata yap; anlam sorgularında sonuç yalnızca aynı generation için geçerlidir. En fazla 100 önbellek cevabı tut; ham anahtar saklama.
- [x] **Step 3:** Worker mesaj yönlendiricisini ekle. Mesaj sözleşmesi: popup `START/STOP/STATUS`, content `EXPLAIN/INVALIDATE`, options `LIST_MODELS/SAVE_SETTINGS/CLEAR_SETTINGS/SETTINGS_STATUS`; yanıtlar `Result<T>`. Content için tabId yalnızca `sender.tab.id`den alınır. Payload boyut/türlerini ve kayıtlı generation'ı doğrula. Başlatma, content script'ten `READ_PAGE` ile metin alır. `tabs.onRemoved/onUpdated` ile kapanma/tam gezintide temizle. Ağ isteği kesilmesinde content tarafı 60 saniyede yeniden denenebilir hata gösterir.
- [x] **Step 4:** `npm test -- tests/controller.test.ts` ve `npm run typecheck` başarılı olmalı.
- [x] **Step 5:** Commit: `feat: coordinate tab context and request lifecycle`.

### Task 5: Sayfa üzerindeki açıklama ve değişim izleme

**Files:** Create `src/content/{index,card,watch}.ts`, `tests/content.test.ts`.

**Interfaces:** Task 1 Range çözümlemesini ve Task 4 mesajlarını kullanır. `showCard(anchor: DOMRect, state: { loading?: boolean; meaning?: Meaning; error?: string }): void`, `hideCard(): void`, `watchPage(onInvalidated: () => void): () => void`. Content `READ_PAGE`, `ACTIVATE {generation}`, `DEACTIVATE` mesajlarına yanıt verir; tekrar enjeksiyon listener çoğaltmaz.

- [x] **Step 1:** jsdom testlerini yaz: ikinci kelime örneğinin doğru bağlamı, 200 karakter üstü seçimin reddi, yeni seçimden sonra eski cevabın yok sayılması, metin olarak HTML gösterimi, kutu eklemenin invalidation üretmemesi, SPA URL değişiminin ve ana metin değişiminin invalidation üretmesi. `npm test -- tests/content.test.ts` başarısız olmalı.
- [x] **Step 2:** Pointer/klavye seçimlerini dinle; yalnızca aktif oturumda ve ana içerikte sorgu gönder. Form/password/contenteditable alanlarını hariç tut. Kutu için Shadow DOM, `textContent`, ekran içinde konumlandırma, Escape/kapat düğmesi ve anlaşılır yükleniyor/hata durumları uygula. Kart içi seçim yeniden sorgu üretmez.
- [x] **Step 3:** MutationObserver'ı 750 ms debounce ve çıkarılan ana metnin parmak iziyle kullan; stil/attribute değişimlerini, kendi hostunu ve aynı metni yok say. URL'yi aktifken 1 saniyelik kontrol ve popstate/hashchange ile izle; değişimde derhal kapat ve invalidate gönder. Durdurmada observer/timer temizlenir. Yeni içerikte yeniden başlatma kullanıcıdan istenir.
- [x] **Step 4:** `npm test -- tests/content.test.ts` ve `npm run typecheck` başarılı olmalı.
- [x] **Step 5:** Commit: `feat: show contextual meaning beside selected words`.

### Task 6: Popup, yüklenebilir paket ve README

**Files:** Create `src/popup.ts`, `public/popup.html`, `public/manifest.json`, `README.md`, `docs/manual-checks.md`, `tests/extension.test.ts`; complete `scripts/build.mjs`.

**Interfaces:** Popup Task 4'ün `START/STOP/STATUS` mesajlarını kullanır; aktif sekmeyi sorgular, başlatmada scripting ile IIFE content script'i enjekte eder. Worker ES module, content script tek bağımsız IIFE, popup/options ayrı yerel script dosyalarıdır.

- [x] **Step 1:** Paket kontrolünü yaz: MV3 manifest, tam izin listesi, yalnızca `https://api.groq.com/*` host izni, tüm giriş dosyalarının dist içinde varlığı ve content script'te çözülmemiş import olmaması. `npm run build` ardından `npm test -- tests/extension.test.ts` manifest eksikliğinden başarısız olmalı.
- [x] **Step 2:** Manifest ve popup'ı tamamla. Başlatma öncesi “Bu sayfanın metni, kendi API anahtarınız kullanılarak Groq'a gönderilir.” metnini göster. Hazırlık ilerlemesi/status sorgusu, hazır/stale/hata, durdur ve ayarlar bağlantısı sun. Kısıtlı URL/PDF ve enjeksiyon hatasını anlaşılır göster. Popup yeniden açıldığında session durumundan devam et.
- [x] **Step 3:** Türkçe README ve kontrol belgesini yaz: `npm ci`, `npm run build`, `chrome://extensions` üzerinden `dist/` yükleme; resmi Groq Console üzerinden anahtar alımı/model bağlama; anahtar silme; maliyet/kota, gizlilik ve kapsam sınırları. Gerçek veriyle canlı test yapıldı iddiası ekleme. TR “yüz”, EN finans “headwinds”, farklı bağlam, geçersiz anahtar, durdur/gezinti ve worker yeniden başlatma kontrollerini tarif et.
- [x] **Step 4:** `npm test`, `npm run typecheck`, `npm run build` çalıştır; paket testlerini yeniden build sonrası çalıştır. Tarayıcı otomasyonu mevcutsa eklentiyi yükleyip sahte Groq yanıtıyla başlat→seç→açıklama→durdur akışını doğrula; yoksa bu sınırı raporla. `git diff --check` hatasız olmalı.
- [x] **Step 5:** Commit: `feat: package Chrome extension and document Groq setup`. Son raporda test sonuçlarını, `dist/` yolunu ve canlı API/tarayıcı doğrulamasının gerçek durumunu belirt.

## Uygulama yöntemi

Öneri: Görevler aynı Chrome mesajlaşma ve durum sözleşmelerine bağlı olduğundan bu oturumda sıralı uygulama (Native). Plan kullanıcı tarafından incelenip yöntem seçildikten sonra `superpowers:executing-plans` ile ilerlenir. Planlama aşamasında ürün kodu yazılmaz veya API anahtarı istenmez.
