# Dry Run

**Right-click any button on any website → see the HTTP request it *would* send. Nothing is sent.**

A Chrome extension (MV3). No toggle, no setup, no rules to write: the extension stays
completely passive until you pick "Dry run" from the context menu.

Türkçe arayüzlü — aşağısı Türkçe.

---

## Ne işe yarar

Bir panelde, bir admin arayüzünde, herhangi bir sitede bir butona basmadan önce
**ne göndereceğini** bilmek istersin. Butona sağ tıkla → **"Dry run — ne gidecek?"**:

- hangi kayda gidiyor (`orders #4821 → refund`),
- hangi alanlarla (tablo hâlinde),
- **hangi koddan** atılıyor (`onClick @ chunk-a1b2.js:13:1018`),
- ve tam `curl` karşılığı.

İstek **gitmez**. Uygulamaya ağ hatası döndürülür, böylece buton "kaydediliyor"da asılı
kalmaz ve sahte bir başarı da görmezsin.

## Kurulum

```
chrome://extensions → Geliştirici modu → Paketlenmemiş öğe yükle → bu klasör
```

## Kullanım

Bir öğeye sağ tıkla → **Dry run — ne gidecek?** → sağ üstte kart çıkar.
Karttaki **kopyala**, o ana kadar yapılmış bütün dry run'ları tek markdown bloğu
hâlinde panoya alır (bir LLM'e yapıştırmak için). ✕ kartı listeden düşürür.

## Nasıl çalışıyor

Menüden seçtiğin anda ~1 saniyeliğine `fetch` / `XMLHttpRequest` / `sendBeacon` /
form submit sarmalanır, sağ tıkladığın öğe programatik olarak tıklanır, çıkan istek
yakalanıp gösterilir ve **gönderilmez**. Sonra sarmalama kendiliğinden kapanır.

Gürültüyü elemek için bir istek ancak şu ikisinden biriyse yakalanır:
tıklamanın **kendi çağrı yığınından** doğmuş olmalı, ya da **sayfanın kendi origin'ine**
gitmeli. Üçüncü parti telemetri (analytics vb.) ne ekrana çıkar ne de engellenir.

## Sınırlar

- Yakaladıkları: `fetch`, `XHR`, `sendBeacon`, `<form>` submit. **WebSocket ve service
  worker istekleri kapsam dışı.**
- Handler isteği **1 saniyeden geç** atıyorsa yakalanmaz; kart yerine "yakalanamadı" notu çıkar.
- Kopyalanan `curl`'de **auth yoktur**: oturum çerezi httpOnly olduğu için JS'e görünmez.
  Çerezli hâli için DevTools → Network → *Copy as cURL*.
- Dry run sonrası uygulama hata gösterir (kırmızı toast vb.) — beklenen davranış.
- Chrome'un kendi sayfalarında (`chrome://`, Web Store, diğer eklentiler) çalışmaz.
  `file://` için "Dosya URL'lerine erişime izin ver" gerekir.

## Lisans

MIT
