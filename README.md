# Minimal Voice Room

Electron tabanli, tek sunuculu, sade bir sesli oda MVP'si. Bu repo iki ana parcadan olusur:

- `server/`: Render uzerine deploy edilecek Socket.IO signaling server
- `electron + renderer`: Local Electron desktop istemcisi

Bu asamada Render sadece signaling server icin kullanilir. Ses medyasi server uzerinden gecmez.

## Klasor Yapisi

```text
.
├── electron
│   ├── main.js
│   └── preload.js
├── renderer
│   ├── .env.example
│   ├── package.json
│   ├── vite.config.ts
│   └── src
├── server
│   ├── .env.example
│   ├── index.js
│   └── package.json
├── render.yaml
└── package.json
```

## Environment Yapisi

Server tarafinda kullanilan env'ler:

- `NODE_ENV`
- `PORT`
- `ALLOWED_ORIGINS`

Electron/renderer tarafinda kullanilan signaling env'i:

- `SIGNALING_SERVER_URL`

Browser renderer fallback'i icin:

- `VITE_SIGNALING_SERVER_URL`
- `VITE_NODE_ENV`

Not:
- Electron preload dogrudan `SIGNALING_SERVER_URL` okur.
- Vite/renderer sadece `VITE_*` prefix'li degiskenleri gorebildigi icin browser fallback tarafinda `VITE_SIGNALING_SERVER_URL` kullanilir.

## Local Kurulum

Root dizinde bagimliliklari kurun:

```bash
cd /Users/bugrakg/SelfProjects/my-voice-app
npm install
```

Server icin ornek env:

```bash
cp server/.env.example server/.env
```

Renderer browser fallback env'i:

```bash
cp renderer/.env.example renderer/.env
```

## Localde Server Nasil Calisir

```bash
npm run dev --prefix server
```

Varsayilan local server:

- URL: `http://localhost:3001`
- Health: `http://localhost:3001/health`

Production benzeri tek komut:

```bash
npm run start --prefix server
```

## Localde Renderer / Electron Nasil Calisir

Tum sistemi birlikte baslatmak icin:

```bash
npm run dev
```

Bu komut sunlari baslatir:

- server: `http://localhost:3001`
- renderer: `http://localhost:5173`
- electron app

## Windows Auto Update

Bu proje Windows auto-update icin `electron-builder` + `electron-updater` + GitHub Releases kullanir.

- installer hedefi: `NSIS`
- update kontrolu: uygulama acilisindan kisa sure sonra
- yeni surum varsa otomatik indirilir
- indirme bitince kullaniciya yeniden baslatma sorulur

### GH_TOKEN Nasil Set Edilir

Token kod icine yazilmaz. `GH_TOKEN` environment variable olarak verilir.

macOS / Linux:

```bash
export GH_TOKEN=your_github_token
```

Windows PowerShell:

```powershell
$env:GH_TOKEN="your_github_token"
```

Kalici yapmak icin Windows'ta System Environment Variables uzerinden eklemek daha dogrudur.

### Version Nasil Artirilir

Yeni release almadan once `package.json` icindeki `version` alanini arttirin.

Ornek:

```json
"version": "0.1.1"
```

### Windows Release Nasil Alinir

1. `GH_TOKEN` tanimli olsun
2. Surumu arttirin
3. Windows build alin:

```bash
npm run dist:win
```

Bu komut `dist-electron/` altinda installer ve update metadata dosyalarini uretir.

### GitHub Release Nasil Alinir

1. Yeni surum tag'i olusturun
2. Windows build ciktilarini GitHub Release'e ekleyin
3. Release'i publish edin

Gerekli dosyalar tipik olarak:

- `*.exe`
- `latest.yml`
- varsa blok map / ek updater dosyalari

### Update Nasil Calisir

1. Uygulama acilir
2. Main process `autoUpdater.checkForUpdates()` cagirir
3. Yeni surum varsa indirme baslar
4. `download-progress` loglanir
5. Indirme bitince dialog cikar:
   - `Simdi guncelle`
   - `Sonra`
6. Kullanici `Simdi guncelle` derse uygulama yeniden baslayip update'i kurar

## Push-to-Talk

Windows oncelikli global push-to-talk icin `uiohook-napi` kullanilir.

- varsayilan bas-konus tusu: `V`
- tusa basili tuttugun surece mikrofon iletilir
- tusu birakinca iletim kapanir
- uygulama arka plandayken de calisir

Native bagimliligin Electron ile uyumlu kalmasi icin:

```bash
npm install
npm run rebuild:native
```

PTT debug loglarini acmak icin:

```bash
npm run dev:electron:ptt-debug
```

Bu modda su loglar gorunur:

- `ptt keydown`
- `ptt keyup`
- `renderer received ptt-down`
- `renderer received ptt-up`
- `mic opened by ptt`
- `mic closed by ptt`

Sadece Electron istemcisini farkli signaling URL ile acmak icin:

```bash
SIGNALING_SERVER_URL=https://YOUR-RENDER-URL.onrender.com ELECTRON_RENDERER_URL=http://localhost:5173 npx electron .
```

## Render Deploy

### Secenek 1: Render Blueprint ile

Repodaki `render.yaml` dosyasi kullanilabilir.

1. Render'da `New +` > `Blueprint` secin.
2. Bu repoyu baglayin.
3. Render `render.yaml` icinden `server` servisini olusturur.

### Secenek 2: Elle Web Service olusturarak

1. Render'da `New +` > `Web Service`
2. Repo'yu secin
3. Asagidaki degerleri girin:

- Root Directory: `server`
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm run start`

### Render Dashboard Environment Variables

Su degerleri girin:

- `NODE_ENV=production`
- `PORT=10000`
- `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,file://,https://YOUR-RENDERER-OR-ELECTRON-ORIGIN`

Not:
- Electron istemcilerde Origin header bazen bos gelir; server bunu kabul edecek sekilde ayarlidir.
- Browser tabanli test yapacaksaniz `ALLOWED_ORIGINS` icine ilgili browser origin'lerini ekleyin.
- Render kendi `PORT` degerini de enjekte eder. Elle `10000` girmek zorunlu degil ama debug icin acik yazilabilir.

## Deploy Sonrasi URL Nasil Alinir

Deploy tamamlaninca Render servis ekraninda size bir public URL verir:

```text
https://minimal-voice-room-signaling.onrender.com
```

Health kontrolu:

```bash
curl https://minimal-voice-room-signaling.onrender.com/health
```

## Electron App O URL'e Nasil Baglanacak

Local Electron app'i remote signaling server'a baglamak icin tek gereken sey:

```bash
SIGNALING_SERVER_URL=https://minimal-voice-room-signaling.onrender.com npm run dev
```

Bu repo icindeki aktif baglanti mantigi:

1. Electron preload `SIGNALING_SERVER_URL` okur
2. Renderer bunu `window.voiceApp.serverUrl` olarak alir
3. Socket.IO baglantisi bu URL'e gider

Browser renderer testinde ise:

```bash
cd renderer
cp .env.example .env
```

Ardindan `.env` icinde:

```bash
VITE_SIGNALING_SERVER_URL=https://minimal-voice-room-signaling.onrender.com
VITE_NODE_ENV=production
```

## Iki Farkli Cihazla Coklu Istemci Testi

1. Render uzerinde server'i deploy edin
2. Public URL'i alin
3. Birinci cihazda Electron app'i su URL ile calistirin:

```bash
SIGNALING_SERVER_URL=https://YOUR-RENDER-URL.onrender.com npm run dev
```

4. Ikinci cihazda da ayni sekilde ayni signaling URL ile app'i acin
5. Iki cihazda farkli tag girin
6. Ayni odaya katilin
7. Kullanici listesi, speaking state ve remote audio akisini kontrol edin

## Server Eventleri

- `set-tag`
- `join-room`
- `leave-room`
- `user-list`
- `webrtc-offer`
- `webrtc-answer`
- `webrtc-ice-candidate`
- `speaking-state`
- `mic-state`
- `audio-output-state`
- `disconnect`

## Dogrulama Checklist'i

- `GET /health` 200 donuyor mu
- Socket baglantisi kuruluyor mu
- Iki kullanici ayni odaya girebiliyor mu
- `user-list` iki istemcide sync oluyor mu
- Server log'larinda `offer/answer` goruluyor mu
- Remote audio diger kullaniciya geliyor mu
- Speaking state diger kullaniciya gidiyor mu

## TODO

- TURN server eklenmeli
- Production icin daha net client origin listesi tanimlanmali
- ICE restart ve reconnect akisi guclendirilmeli
- Gerekirse Socket.IO event validation eklenmeli
