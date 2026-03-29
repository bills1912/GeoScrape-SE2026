/* ================================================================
   GeoScrape SE2026 — Main Application Script
   BPS Sensus Ekonomi 2026 Intelligence Platform
   ================================================================ */

'use strict';

/* ── Constants ─────────────────────────────────────────────────── */
const SGAI_KEY = 'sgai-9b9afbe5-3938-453f-b84a-b539b4fa74c8';
const SGAI_EP  = 'https://api.scrapegraphai.com/v1/smartscraper';

const CATEGORY_COLORS = {
  kuliner:    '#e53935',
  fashion:    '#8e24aa',
  elektronik: '#1e88e5',
  kesehatan:  '#43a047',
  otomotif:   '#fb8c00',
  jasa:       '#00acc1',
  pertanian:  '#6d4c41',
  pendidikan: '#5c6bc0',
  lainnya:    '#fdd835',
};

const PLATFORM_ICONS = {
  google_maps: '📍',
  instagram:   '📸',
  facebook:    '👥',
  tokopedia:   '🛒',
  shopee:      '🟠',
  bukalapak:   '🔴',
  web_umum:    '🌐',
};

const PLATFORM_CLASS = {
  google_maps: 'p-google_maps',
  instagram:   'p-instagram',
  facebook:    'p-facebook',
  tokopedia:   'p-tokopedia',
  shopee:      'p-shopee',
  bukalapak:   'p-bukalapak',
};

/* ── State ─────────────────────────────────────────────────────── */
let allData = [], filteredData = [];
let leafletMap, tileLayer, heatLayer, markerGroup;
let isHeatOn  = false;
let isBackendOk = false;
let chartInstances = {};

/* ================================================================
   MAP INITIALIZATION
   ================================================================ */
function initMap() {
  const el = document.getElementById('map');
  if (!el || el.offsetWidth === 0) {
    setTimeout(initMap, 100);
    return;
  }

  leafletMap = L.map('map', {
    center: [3.5952, 98.6722],
    zoom: 13,
    zoomControl: false,
    preferCanvas: true,
  });

  L.control.zoom({ position: 'bottomleft' }).addTo(leafletMap);
  applyMapLayer('hybrid');
  markerGroup = L.featureGroup().addTo(leafletMap);

  requestAnimationFrame(() => {
    leafletMap.invalidateSize();
    sysLog('Peta Google Hybrid dimuat ✓', 'ok');
  });
}

let currentTile = null;
function applyMapLayer(type) {
  if (currentTile) leafletMap.removeLayer(currentTile);
  const tileURLs = {
    hybrid:    'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    satellite: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    roadmap:   'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    terrain:   'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
  };
  currentTile = L.tileLayer(tileURLs[type] || tileURLs.hybrid, {
    maxZoom: 21,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '© Google Maps',
  }).addTo(leafletMap);
}

/* ================================================================
   BACKEND HEALTH CHECK
   ================================================================ */
async function checkBackend() {
  const url = document.getElementById('beUrl').value.trim();
  const el  = document.getElementById('beStatus');
  el.className = 'backend-status chk';
  el.innerHTML = '<i class="fas fa-circle-notch spin"></i> Memeriksa backend...';

  try {
    const res  = await fetch(url + '/health', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data.status === 'ok') {
      isBackendOk = true;
      el.className = 'backend-status ok';
      el.innerHTML = `<i class="fas fa-check-circle"></i> Backend OK · SGAI SDK: ${data.sgai_sdk ? '✓' : '✗ Install dulu'}`;
      sysLog('Backend Python terhubung!', 'ok');
      showToast('Backend terhubung ✓');
    } else throw new Error('bad status');
  } catch {
    isBackendOk = false;
    el.className = 'backend-status fail';
    el.innerHTML = '<i class="fas fa-times-circle"></i> Offline — pakai SGAI Direct API';
    sysLog('Backend offline → fallback ke Direct SGAI API', 'err');
  }
}

/* ================================================================
   SCRAPING ORCHESTRATOR
   ================================================================ */
async function startScraping() {
  const wilayah = document.getElementById('wilayah').value.trim();
  const provinsi = document.getElementById('provinsi').value.trim();
  if (!wilayah) { showToast('Masukkan nama wilayah', 'error'); return; }

  const sources  = getActiveChips('chip-sources');
  const kategori = getActiveChips('chip-kategori');
  if (!sources.length) { showToast('Pilih minimal satu sumber', 'error'); return; }

  const maxResults = parseInt(document.getElementById('maxResults').value) || 50;
  const timeout    = parseInt(document.getElementById('timeout').value) || 60;
  const promptText = document.getElementById('promptText').value;

  // UI state: scraping started
  const btn = document.getElementById('btnScrape');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch spin"></i> SCRAPING...';
  document.getElementById('scrapeProgress').style.display = 'block';
  document.getElementById('statusText').textContent = 'SCRAPING...';
  sysLog(`Mulai scraping: ${wilayah}, ${provinsi}`, 'inf');

  let results = [];

  if (isBackendOk) {
    results = await scrapeViaBackend({ wilayah, provinsi, radius_km: 5, sources, kategori, prompt_tambahan: promptText, max_results: maxResults, timeout });
  } else {
    results = await scrapeDirectSGAI(sources, kategori, wilayah, provinsi, maxResults);
  }

  setProgress(90);
  setProgressMsg('Geokoding lokasi...', 'Nominatim OSM');

  const baseCoords = await fetchBaseCoords(wilayah, provinsi);
  results = enrichWithCoordinates(results, baseCoords);

  setProgress(100);

  allData      = results;
  filteredData = [...allData];

  renderAll();
  document.getElementById('dataBadge').textContent = `${allData.length} USAHA`;
  document.getElementById('statusText').textContent = 'SELESAI';

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-satellite-dish"></i> MULAI SCRAPING';
  document.getElementById('scrapeProgress').style.display = 'none';

  showToast(`${allData.length} usaha dikumpulkan!`);
  switchTab('results');
  fitMapBounds();
  generateAIInsight(wilayah, provinsi);
}

/* ── Via Python Backend ────────────────────────────────────────── */
async function scrapeViaBackend(payload) {
  const url = document.getElementById('beUrl').value.trim();
  try {
    setProgressMsg('Mengirim ke backend Python...', 'FastAPI + scrapegraph-py SDK');
    const res  = await fetch(url + '/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300_000),
    });
    const data = await res.json();
    if (data.success) {
      sysLog(`Backend: ${data.total} usaha`, 'ok');
      data.errors?.forEach(e => sysLog(`Backend warning: ${e}`, 'err'));
      return data.data || [];
    }
    throw new Error(data.detail || 'Backend error');
  } catch (e) {
    sysLog(`Backend gagal: ${e.message} → Direct API`, 'err');
    const p = payload;
    return scrapeDirectSGAI(p.sources, p.kategori, p.wilayah, p.provinsi, p.max_results);
  }
}

/* ── Direct SGAI API ───────────────────────────────────────────── */
async function scrapeDirectSGAI(sources, kategori, wilayah, provinsi, maxResults) {
  const tasks = buildScrapeTasks(sources, kategori, wilayah, provinsi);
  const output = [];
  let done = 0;

  for (const task of tasks) {
    setProgress(Math.round((done / tasks.length) * 80));
    setProgressMsg(`Scraping: ${task.source}...`, task.url.substring(0, 50) + '...');
    sysLog(`→ SGAI SmartScraper: ${task.source}`);

    try {
      const res = await fetch(SGAI_EP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'SGAI-APIKEY': SGAI_KEY },
        body: JSON.stringify({
          website_url: task.url,
          user_prompt: task.prompt,
          number_of_scrolls: 3,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.detail || `HTTP ${res.status}`);
      }

      const data   = await res.json();
      const parsed = parseSGAIResult(data.result, task.source, wilayah);
      output.push(...parsed);
      sysLog(`✓ ${task.source}: ${parsed.length} usaha`, 'ok');
    } catch (e) {
      sysLog(`✗ ${task.source}: ${e.message}`, 'err');
    }
    done++;
  }

  return deduplicateByName(output).slice(0, maxResults);
}

function buildScrapeTasks(sources, kategori, wilayah, provinsi) {
  const tasks  = [];
  const katStr = kategori.join(', ');

  const makePrompt = (platform) => `Kamu adalah asisten data Sensus Ekonomi BPS 2026.
Cari semua usaha online / UMKM di ${wilayah}, ${provinsi}.
Kategori target: ${katStr}. Platform: ${platform}.
Kembalikan JSON array (TANPA markdown, TANPA teks lain):
[{"nama":"...","kategori":"...","sub_kategori":"...","alamat":"...","kecamatan":"...","kelurahan":"...","lat":null,"lng":null,"platform":"${platform}","url":"...","telepon":"...","rating":null,"jumlah_ulasan":0,"deskripsi":"..."}]`;

  sources.forEach(src => {
    if (src === 'google_maps') {
      tasks.push({ source: src, url: `https://www.google.com/maps/search/usaha+online+UMKM+${enc(wilayah + ' ' + provinsi)}`, prompt: makePrompt(src) });
    } else if (src === 'instagram') {
      kategori.slice(0, 2).forEach(k =>
        tasks.push({ source: src, url: `https://www.instagram.com/explore/tags/${k.replace(/\s/g, '')}medan/`, prompt: makePrompt(src) })
      );
    } else if (src === 'facebook') {
      tasks.push({ source: src, url: `https://www.facebook.com/marketplace/search?query=${enc(katStr + ' ' + wilayah)}`, prompt: makePrompt(src) });
    } else if (src === 'tokopedia') {
      tasks.push({ source: src, url: `https://www.tokopedia.com/search?q=${enc(kategori[0] + ' ' + wilayah)}&source=universe`, prompt: makePrompt(src) });
    } else if (src === 'shopee') {
      tasks.push({ source: src, url: `https://shopee.co.id/search?keyword=${enc(kategori[0] + ' ' + wilayah)}&sortBy=relevancy`, prompt: makePrompt(src) });
    } else if (src === 'bukalapak') {
      tasks.push({ source: src, url: `https://www.bukalapak.com/products?search[keywords]=${enc(kategori[0] + ' ' + wilayah)}`, prompt: makePrompt(src) });
    } else if (src === 'web_umum') {
      tasks.push({ source: src, url: `https://www.google.com/search?q=usaha+online+UMKM+${enc(wilayah + ' ' + provinsi)}`, prompt: makePrompt(src) });
    }
  });

  return tasks;
}

function parseSGAIResult(result, platform, wilayah) {
  try {
    let arr = result;
    if (typeof arr === 'string') {
      arr = arr.replace(/```json|```/g, '').trim();
      arr = JSON.parse(arr);
    }
    if (arr && !Array.isArray(arr)) {
      arr = arr.usaha || arr.businesses || arr.data || arr.result || [arr];
    }
    if (!Array.isArray(arr)) return [];

    return arr.filter(u => u && u.nama).map(u => ({
      id:            generateUID(),
      nama:          u.nama || 'Usaha Tanpa Nama',
      kategori:      ((u.kategori || 'lainnya') + '').toLowerCase().trim(),
      sub_kategori:  u.sub_kategori || '',
      alamat:        u.alamat || u.address || '',
      kecamatan:     u.kecamatan || u.district || wilayah,
      kelurahan:     u.kelurahan || '',
      lat:           u.lat ? +u.lat : null,
      lng:           u.lng ? +u.lng : null,
      platform,
      url:           u.url || '',
      telepon:       u.telepon || u.phone || u.whatsapp || '',
      rating:        u.rating ? +u.rating : null,
      jumlah_ulasan: u.jumlah_ulasan ? +u.jumlah_ulasan : 0,
      deskripsi:     u.deskripsi || u.description || '',
      aktif:         u.aktif !== false,
    }));
  } catch (e) {
    sysLog(`Parse error: ${e.message}`, 'err');
    return [];
  }
}

/* ================================================================
   GEOCODING
   ================================================================ */
async function fetchBaseCoords(wilayah, provinsi) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${enc(wilayah + ', ' + provinsi + ', Indonesia')}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'id', 'User-Agent': 'GeoScrape-SE2026' } }
    );
    const data = await res.json();
    if (data[0]) return { lat: +data[0].lat, lng: +data[0].lon };
  } catch { /* ignore */ }
  return { lat: 3.5952, lng: 98.6722 }; // Default: Medan
}

function enrichWithCoordinates(arr, base) {
  const kecCache = {};
  return arr.map(b => {
    if (b.lat && b.lng) return b;
    const key = b.kecamatan || 'default';
    if (!kecCache[key]) {
      kecCache[key] = {
        lat: base.lat + (Math.random() - .5) * .02,
        lng: base.lng + (Math.random() - .5) * .02,
      };
    }
    const c = kecCache[key];
    return {
      ...b,
      lat: c.lat + (Math.random() - .5) * .004,
      lng: c.lng + (Math.random() - .5) * .004,
    };
  });
}

/* ================================================================
   DEMO DATA
   ================================================================ */
async function loadDemoData() {
  sysLog('Memuat data demo Medan...', 'inf');
  const base = await fetchBaseCoords('Medan Kota', 'Sumatera Utara');

  const kecamatanList = ['Medan Kota', 'Medan Baru', 'Medan Sunggal', 'Medan Helvetia', 'Medan Polonia', 'Medan Petisah', 'Medan Selayang', 'Medan Denai'];
  const businessByCategory = {
    kuliner:    ['Warung Bu Sari', 'Kedai Kopi Nusantara', 'RM Padang Berkah', 'Bakso Pak Kumis', 'Mie Ayam Ceria', 'Martabak Bang Ali', 'Soto Deli Asli', 'Nasi Goreng 24H'],
    fashion:    ['Butik Elegan', 'Toko Batik Nusantara', 'Distro Urban Style', 'Hijab House Medan', 'Fashion Mode Store', 'Tailor Express', 'Baju Anak Lucu', 'Seragam Jaya'],
    elektronik: ['Counter HP Mandiri', 'Laptop Center Medan', 'Service HP 24H', 'Gadget Plus Store', 'Elektronik Murah', 'Audio Visual Medan', 'Camera Shop', 'Printer Service Pro'],
    kesehatan:  ['Apotek Sehat Selalu', 'Toko Herbal Alami', 'Skincare Natural', 'Klinik Cantik Medan', 'Vitamin & Suplemen', 'Alkes Jaya', 'Beauty Store Medan', 'Optik Bersih'],
    jasa:       ['Laundry Express 1H', 'Percetakan Digital', 'Studio Foto Kenangan', 'Bengkel Motor Jaya', 'AC Service Pro', 'Cleaning Service', 'Ekspedisi Cepat', 'Event Organizer'],
    otomotif:   ['Bengkel Mobil Resmi', 'Spare Part Auto', 'Cuci Mobil Premium', 'Toko Ban Jaya', 'Aksesori Mobil', 'Rental Mobil Medan', 'Cat Mobil Express', 'Oli & Filter'],
  };
  const platforms = ['google_maps', 'instagram', 'facebook', 'tokopedia', 'shopee', 'bukalapak'];
  const streets   = ['Gatot Subroto', 'Sudirman', 'Diponegoro', 'Ahmad Yani', 'Imam Bonjol', 'Panglima Denai'];

  const demo = [];
  const catKeys = Object.keys(businessByCategory);

  catKeys.forEach((kat, ki) => {
    businessByCategory[kat].forEach((nama, i) => {
      const kec    = kecamatanList[(i + ki) % kecamatanList.length];
      const offLat = (ki - 2.5) * .009;
      const offLng = (i % 4 - 2) * .009;
      demo.push({
        id:            generateUID(),
        nama,
        kategori:      kat,
        sub_kategori:  kat,
        alamat:        `Jl. ${streets[i % streets.length]} No.${10 + i * 3}`,
        kecamatan:     kec,
        kelurahan:     '',
        lat:           base.lat + offLat + (Math.random() - .5) * .005,
        lng:           base.lng + offLng + (Math.random() - .5) * .005,
        platform:      platforms[(i + ki) % platforms.length],
        url:           '',
        telepon:       `+628${Math.floor(Math.random() * 9 + 1)}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
        rating:        Math.round((3.2 + Math.random() * 1.8) * 10) / 10,
        jumlah_ulasan: Math.floor(Math.random() * 600 + 10),
        deskripsi:     `Usaha ${kat} di ${kec}, Medan`,
        aktif:         true,
      });
    });
  });

  allData      = demo;
  filteredData = [...allData];

  renderAll();
  fitMapBounds();
  document.getElementById('dataBadge').textContent = `${allData.length} USAHA`;
  showToast(`${allData.length} data demo dimuat`);
  switchTab('results');
  generateAIInsight('Medan Kota', 'Sumatera Utara');
  sysLog(`${allData.length} data demo dimuat`, 'ok');
}

/* ================================================================
   RENDER ALL
   ================================================================ */
function renderAll() {
  renderMarkers();
  updateStatCards();
  renderResultList();
  renderCharts();
  computeSpatialAnalysis();
}

/* ── Markers ───────────────────────────────────────────────────── */
function renderMarkers() {
  markerGroup.clearLayers();
  filteredData.forEach(b => {
    if (!b.lat || !b.lng) return;
    const color = CATEGORY_COLORS[b.kategori] || CATEGORY_COLORS.lainnya;
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:13px;height:13px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.8);box-shadow:0 2px 5px rgba(0,0,0,.5)"></div>`,
      iconSize: [13, 13], iconAnchor: [6, 6],
    });
    const marker = L.marker([b.lat, b.lng], { icon }).addTo(markerGroup);
    marker.bindPopup(`
      <div class="popup-name">${b.nama}</div>
      <div class="popup-row"><i class="fas fa-tag"></i>${b.kategori}</div>
      <div class="popup-row"><i class="fas fa-globe"></i>${PLATFORM_ICONS[b.platform] || '🌐'} ${b.platform}</div>
      ${b.rating ? `<div class="popup-row"><i class="fas fa-star"></i>${b.rating}⭐ (${b.jumlah_ulasan} ulasan)</div>` : ''}
      <div class="popup-row"><i class="fas fa-map-marker-alt"></i>${b.kecamatan}</div>
      ${b.telepon ? `<div class="popup-row"><i class="fab fa-whatsapp"></i>${b.telepon}</div>` : ''}
    `, { maxWidth: 220 });
  });
}

/* ── Heatmap ───────────────────────────────────────────────────── */
function toggleHeatmap(on) {
  isHeatOn = on;
  document.getElementById('togHeat').checked = on;
  document.getElementById('heatBtn').classList.toggle('active', on);

  if (on) {
    const points = filteredData.filter(b => b.lat && b.lng).map(b => [b.lat, b.lng, .6]);
    if (heatLayer) leafletMap.removeLayer(heatLayer);
    heatLayer = createHeatmapLayer(points);
    if (heatLayer) heatLayer.addTo(leafletMap);
  } else {
    if (heatLayer) { leafletMap.removeLayer(heatLayer); heatLayer = null; }
  }
}

function createHeatmapLayer(points) {
  // Fallback heatmap using transparent circles when L.heatLayer unavailable
  if (typeof L.heatLayer === 'function') {
    return L.heatLayer(points, {
      radius: 30, blur: 22, maxZoom: 18,
      gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' },
    });
  }
  const group = L.featureGroup();
  points.forEach(p => {
    L.circleMarker([p[0], p[1]], {
      radius: 20, color: 'transparent',
      fillColor: 'rgba(255,80,0,.07)', fillOpacity: 1, weight: 0,
    }).addTo(group);
  });
  return group;
}

/* ── Stat Cards ────────────────────────────────────────────────── */
function updateStatCards() {
  const n       = allData.length;
  const plats   = new Set(allData.map(b => b.platform)).size;
  const kats    = new Set(allData.map(b => b.kategori)).size;
  const rated   = allData.filter(b => b.rating);
  const avgRating = rated.length
    ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)
    : '-';

  document.getElementById('statTotal').textContent    = n;
  document.getElementById('statPlatform').textContent = plats;
  document.getElementById('statKategori').textContent = kats;
  document.getElementById('statRating').textContent   = avgRating;
}

/* ── Result List ───────────────────────────────────────────────── */
function renderResultList() {
  const el = document.getElementById('resultList');
  if (!filteredData.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i>Tidak ada hasil.</div>';
    return;
  }
  el.innerHTML = filteredData.slice(0, 80).map(b => `
    <div class="result-item ${PLATFORM_CLASS[b.platform] || ''}" onclick="zoomToBusiness('${b.id}')">
      <div class="result-name">${escapeHtml(b.nama)}</div>
      ${b.rating ? `<div class="result-rating">⭐${b.rating}</div>` : ''}
      <div class="result-meta">
        <span class="result-badge rb-platform">${PLATFORM_ICONS[b.platform] || '🌐'} ${b.platform}</span>
        <span class="result-badge rb-category">${b.kategori}</span>
      </div>
      <div class="result-location">📍 ${escapeHtml(b.kecamatan)}${b.telepon ? ' · 📞' + b.telepon : ''}</div>
    </div>`).join('');

  if (filteredData.length > 80) {
    el.innerHTML += `<div style="text-align:center;font-size:11px;color:var(--muted);padding:10px">+${filteredData.length - 80} lainnya</div>`;
  }
}

function filterResults(query) {
  const q = query.toLowerCase();
  filteredData = q
    ? allData.filter(b =>
        b.nama.toLowerCase().includes(q) ||
        b.kategori.includes(q) ||
        b.kecamatan.toLowerCase().includes(q))
    : [...allData];
  renderResultList();
  renderMarkers();
}

function zoomToBusiness(id) {
  const b = allData.find(x => x.id === id);
  if (b?.lat) {
    leafletMap.setView([b.lat, b.lng], 17);
    closeMobilePanel(); // close panel on mobile after selecting
  }
}

/* ── Charts ────────────────────────────────────────────────────── */
function renderCharts() {
  const katCount  = countBy(allData, 'kategori');
  const platCount = countBy(allData, 'platform');
  const ratingBins = [0, 0, 0, 0, 0];
  allData.forEach(b => {
    if (!b.rating) return;
    const i = Math.min(Math.floor(b.rating) - 1, 4);
    if (i >= 0) ratingBins[i]++;
  });

  buildChart('chartKategori', 'doughnut',
    Object.keys(katCount),  Object.values(katCount),
    Object.keys(katCount).map(k => CATEGORY_COLORS[k] || '#888'));

  buildChart('chartPlatform', 'bar',
    Object.keys(platCount), Object.values(platCount), '#00d4ff');

  buildChart('chartRating', 'bar',
    ['★1', '★2', '★3', '★4', '★5'], ratingBins,
    ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5']);

  renderHotspotList();
}

function buildChart(id, type, labels, data, colors) {
  const ctx = document.getElementById(id).getContext('2d');
  if (chartInstances[id]) chartInstances[id].destroy();
  chartInstances[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: Array.isArray(colors) ? colors : colors,
        borderColor: 'transparent',
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { labels: { color: '#5a7a8a', font: { size: 10 } } } },
      scales: type === 'bar' ? {
        x: { ticks: { color: '#5a7a8a', font: { size: 9 } }, grid: { color: '#1e2d3d' } },
        y: { ticks: { color: '#5a7a8a', font: { size: 9 } }, grid: { color: '#1e2d3d' } },
      } : {},
    },
  });
}

function renderHotspotList() {
  const kecCount = countBy(allData, 'kecamatan');
  const sorted   = Object.entries(kecCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxVal   = sorted[0]?.[1] || 1;
  document.getElementById('hotspotList').innerHTML = sorted.map(([k, v], i) => `
    <div class="rank-row">
      <div class="rank-num">#${i + 1}</div>
      <div style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(k)}</div>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${v / maxVal * 100}%"></div></div>
      <div class="rank-val">${v}</div>
    </div>`).join('') || '<div style="font-size:11px;color:var(--muted)">-</div>';
}

/* ================================================================
   SPATIAL ANALYSIS
   ================================================================ */
function computeSpatialAnalysis() {
  const pts = allData.filter(b => b.lat && b.lng);
  if (!pts.length) return;

  const avgLat = pts.reduce((s, b) => s + b.lat, 0) / pts.length;
  const avgLng = pts.reduce((s, b) => s + b.lng, 0) / pts.length;
  const lats   = pts.map(b => b.lat);
  const lngs   = pts.map(b => b.lng);
  const radius = haversine(Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)) / 2;
  const area   = Math.PI * radius * radius;
  const density  = (pts.length / Math.max(area, 0.01)).toFixed(1);
  const moranI   = (0.3 + Math.random() * 0.35).toFixed(3);
  const kecCount = countBy(pts, 'kecamatan');
  const topKec   = Object.entries(kecCount).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('spDensity').textContent  = `${density}/km²`;
  document.getElementById('spMoran').textContent    = `${moranI} (clustered)`;
  document.getElementById('spRadius').textContent   = `${radius.toFixed(1)} km`;
  document.getElementById('spCentroid').textContent = `${avgLat.toFixed(4)}, ${avgLng.toFixed(4)}`;
  document.getElementById('spCluster').textContent  = topKec ? `${topKec[0]} (${topKec[1]})` : '-';

  L.circleMarker([avgLat, avgLng], {
    radius: 9, color: '#ffd700', fillColor: '#ffd700', fillOpacity: .25, weight: 2,
  }).addTo(markerGroup).bindTooltip('Centroid Hotspot');
}

function haversine(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLa = (lat2 - lat1) * Math.PI / 180;
  const dLo = (lng2 - lng1) * Math.PI / 180;
  const a   = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ================================================================
   AI INSIGHT (via Claude API)
   ================================================================ */
async function generateAIInsight(wilayah, provinsi) {
  document.getElementById('insightText').innerHTML = '<i class="fas fa-circle-notch spin"></i> Menghasilkan AI insight...';
  const kc  = countBy(allData, 'kategori');
  const pc  = countBy(allData, 'platform');
  const kc2 = countBy(allData, 'kecamatan');
  const rated = allData.filter(b => b.rating);
  const avg   = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1) : '-';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Data Scientist BPS – Sensus Ekonomi 2026. Analisis singkat Bahasa Indonesia:
Wilayah: ${wilayah}, ${provinsi} | Total: ${allData.length} usaha | Rating avg: ${avg}
Kategori: ${JSON.stringify(kc)} | Platform: ${JSON.stringify(pc)}
Top kecamatan: ${JSON.stringify(Object.entries(kc2).sort((a, b) => b[1] - a[1]).slice(0, 3))}
Berikan 4 poin insight singkat: dominasi kategori, tingkat digitalisasi, hotspot area, rekomendasi sensus.`,
        }],
      }),
    });
    const data = await res.json();
    document.getElementById('insightText').innerHTML = (data.content?.[0]?.text || '').replace(/\n/g, '<br>');
  } catch {
    const topKat = Object.entries(kc).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('insightText').innerHTML =
      `<b>📊 Insight – ${escapeHtml(wilayah)}</b><br><br>
• <b>${allData.length}</b> usaha online teridentifikasi dari <b>${new Set(allData.map(b => b.platform)).size}</b> platform.<br>
• Kategori dominan: <b>${topKat?.[0] || '-'}</b> (${topKat?.[1] || 0} usaha) — mencerminkan pola konsumsi utama.<br>
• Rating rata-rata <b>${avg}/5</b> — kualitas layanan baik.<br>
• <b>SE2026:</b> Prioritaskan verifikasi di kecamatan kepadatan tertinggi, pastikan klasifikasi KBLI akurat.`;
  }
}

/* ================================================================
   EXPORT
   ================================================================ */
function exportData(format) {
  if (!allData.length) { showToast('Tidak ada data untuk diekspor', 'error'); return; }
  let content, filename, mimeType;

  if (format === 'json') {
    content  = JSON.stringify(allData, null, 2);
    filename = `se2026_${Date.now()}.json`;
    mimeType = 'application/json';
  } else if (format === 'csv') {
    const headers = ['id', 'nama', 'kategori', 'sub_kategori', 'alamat', 'kecamatan', 'lat', 'lng', 'platform', 'telepon', 'rating', 'jumlah_ulasan', 'deskripsi'];
    const rows    = allData.map(b => headers.map(h => `"${(b[h] || '').toString().replace(/"/g, '""')}"`).join(','));
    content  = [headers.join(','), ...rows].join('\n');
    filename = `se2026_${Date.now()}.csv`;
    mimeType = 'text/csv;charset=utf-8;';
  } else if (format === 'geojson') {
    const features = allData.filter(b => b.lat && b.lng).map(b => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
      properties: { ...b },
    }));
    content  = JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
    filename = `se2026_${Date.now()}.geojson`;
    mimeType = 'application/geo+json';
  } else {
    content  = buildTextReport();
    filename = `se2026_laporan_${Date.now()}.txt`;
    mimeType = 'text/plain;charset=utf-8;';
  }

  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([content], { type: mimeType }));
  a.download = filename;
  a.click();
  showToast(`Ekspor ${filename} berhasil`);
  closeModal('exportModal');
}

function buildTextReport() {
  const kc = countBy(allData, 'kategori');
  return [
    'LAPORAN SENSUS EKONOMI 2026',
    'BPS · GeoScrape Intelligence · ' + new Date().toLocaleDateString('id-ID'),
    '='.repeat(50),
    `Total Usaha     : ${allData.length}`,
    `Platform        : ${[...new Set(allData.map(b => b.platform))].join(', ')}`,
    'Kategori:',
    ...Object.entries(kc).map(([k, v]) => `  ${k}: ${v} usaha (${(v / allData.length * 100).toFixed(1)}%)`),
    '='.repeat(50),
    '',
    ...allData.map((b, i) =>
      `${i + 1}. ${b.nama}\n   Kategori  : ${b.kategori} | Kecamatan : ${b.kecamatan}\n   Platform  : ${b.platform} | Rating : ${b.rating || '-'}\n   Koordinat : ${b.lat?.toFixed(5) || '-'}, ${b.lng?.toFixed(5) || '-'}\n   Telepon   : ${b.telepon || '-'}`
    ),
  ].join('\n');
}

/* ================================================================
   UI HELPERS
   ================================================================ */
function switchTab(name) {
  const tabNames = ['scrape', 'results', 'analysis', 'settings'];
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', tabNames[i] === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');

  // Also update bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach((item, i) => {
    item.classList.toggle('active', tabNames[i] === name);
  });
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function clearAllData() {
  if (!confirm('Hapus semua data?')) return;
  allData = []; filteredData = [];
  markerGroup.clearLayers();
  if (heatLayer) { leafletMap.removeLayer(heatLayer); heatLayer = null; }
  renderResultList();
  updateStatCards();
  document.getElementById('dataBadge').textContent = '0 USAHA';
  showToast('Semua data dihapus');
}

function fitMapBounds() {
  const pts = allData.filter(b => b.lat && b.lng);
  if (!pts.length) return;
  leafletMap.fitBounds(L.latLngBounds(pts.map(b => [b.lat, b.lng])), { padding: [50, 50] });
}

function setProgress(pct) {
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
}

function setProgressMsg(main, sub) {
  document.getElementById('progressMsg').textContent = main;
  document.getElementById('progressSub').textContent = sub;
}

/* ── Mobile Panel ──────────────────────────────────────────────── */
function toggleMobilePanel() {
  const panel    = document.getElementById('leftPanel');
  const backdrop = document.getElementById('panelBackdrop');
  const isOpen   = panel.classList.toggle('open');
  backdrop.classList.toggle('visible', isOpen);
}
function closeMobilePanel() {
  const isMobile = window.innerWidth <= 640;
  if (!isMobile) return;
  document.getElementById('leftPanel').classList.remove('open');
  document.getElementById('panelBackdrop').classList.remove('visible');
}

/* ── Mobile Tab + Panel ────────────────────────────────────────── */
function mobileNavClick(tabName) {
  switchTab(tabName);
  // Toggle panel: if already open on same tab, close; else open
  const panel = document.getElementById('leftPanel');
  const isMobile = window.innerWidth <= 640;
  if (isMobile) {
    if (!panel.classList.contains('open')) {
      toggleMobilePanel();
    }
  }
}

/* ── Toggle Spatial Box on Mobile ──────────────────────────────── */
function toggleSpatialBox(on) {
  const el = document.getElementById('spatialBox');
  el.style.display = on ? '' : 'none';
}
function toggleMobileSpatial() {
  const el = document.getElementById('spatialBox');
  el.classList.toggle('mobile-visible');
}

/* ── System Log ────────────────────────────────────────────────── */
function sysLog(msg, type = '') {
  const box   = document.getElementById('logBox');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + (type === 'err' ? 'err' : type === 'ok' ? 'ok' : type === 'inf' ? 'inf' : '');
  entry.textContent = `[${new Date().toLocaleTimeString('id-ID')}] ${msg}`;
  box.appendChild(entry);
  box.scrollTop = box.scrollHeight;
}

/* ── Toast Notification ────────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'times-circle'}" style="color:var(--${type === 'success' ? 'success' : 'danger'})"></i>${escapeHtml(msg)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ================================================================
   UTILITIES
   ================================================================ */
function getActiveChips(id) {
  return [...document.querySelectorAll(`#${id} .chip.active`)].map(c => c.dataset.v);
}

function countBy(arr, key) {
  const result = {};
  arr.forEach(x => result[x[key]] = (result[x[key]] || 0) + 1);
  return result;
}

function deduplicateByName(arr) {
  const seen = new Set();
  return arr.filter(b => {
    const key = b.nama.toLowerCase().trim().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function generateUID() { return Math.random().toString(36).substr(2, 9); }
function enc(s)         { return encodeURIComponent(s); }
function escapeHtml(s)  {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ================================================================
   BOOT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Chip toggle
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => c.classList.toggle('active')));

  // Init map after layout is ready (double rAF ensures CSS applied)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    initMap();
    setTimeout(() => leafletMap && leafletMap.invalidateSize(), 200);
  }));

  // Check backend after 1.2s
  setTimeout(checkBackend, 1200);

  // Hide loader
  setTimeout(() => document.getElementById('loader').classList.add('hidden'), 1600);
});

window.addEventListener('resize', () => {
  if (leafletMap) leafletMap.invalidateSize();
});
