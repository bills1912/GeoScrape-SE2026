# 🛰️ GeoScrape SE2026

> **Platform Intelijen Geospasial untuk Sensus Ekonomi 2026 — BPS Republik Indonesia**

GeoScrape SE2026 adalah aplikasi web berbasis AI yang dirancang untuk mendukung pengumpulan dan pemetaan data usaha online / UMKM dalam rangka **Sensus Ekonomi 2026 BPS RI**. Platform ini mengintegrasikan *AI-powered web scraping* via **ScrapeGraphAI**, peta interaktif Leaflet.js, dan analisis geospasial otomatis — semuanya dalam satu antarmuka modern berbasis browser.

---

## 📸 Tampilan Aplikasi

```
┌─────────────────────────────────────────────────────────────┐
│  🛰️ GeoScrape SE2026        ● SISTEM SIAP      [48 USAHA]  │
├──────────────────────┬──────────────────────────────────────┤
│  [SCRAPE|HASIL|...] │                                       │
│                      │      🗺️  PETA INTERAKTIF              │
│  🎯 Target Wilayah   │      (Google Hybrid Satellite)       │
│  📡 Sumber Data      │                                       │
│  🏷️  Kategori KBLI   │      ● ● ●  Marker Usaha             │
│  🤖 Prompt AI        │         🔥 Heatmap KDE               │
│  [MULAI SCRAPING]    │                                       │
│                      │  📡 ANALISIS SPASIAL                  │
│  📋 Log Sistem       │  Moran's I | Density | Centroid      │
└──────────────────────┴──────────────────────────────────────┘
```

---

## ✨ Fitur Utama

### 🤖 AI-Powered Scraping
- Integrasi **ScrapeGraphAI SmartScraper** untuk ekstraksi data cerdas dari berbagai sumber
- Scraping berbasis prompt natural language — instruksikan AI sesuai kebutuhan
- Fallback otomatis: jika backend Python offline, langsung menggunakan **SGAI Direct API** dari browser
- Deduplikasi cerdas berdasarkan nama usaha

### 🗺️ Peta Interaktif
- Basemap **Google Maps** (Hybrid, Satellite, Roadmap, Terrain)
- Marker berwarna berdasarkan **kategori KBLI** usaha
- **Heatmap KDE** untuk visualisasi konsentrasi usaha
- Popup detail per usaha (nama, kategori, platform, rating, koordinat)
- Fit bounds otomatis setelah data dimuat

### 📊 Analisis Geospasial
- **Moran's I** — indeks autokorelasi spasial (deteksi pola klaster)
- **Kernel Density Estimation (KDE)** — visualisasi hotspot kepadatan
- Perhitungan centroid, radius cakupan, dan kepadatan usaha per km²
- Identifikasi kecamatan dengan konsentrasi usaha tertinggi

### 📈 Dashboard Analitik
- Distribusi kategori usaha (Doughnut Chart)
- Sebaran platform digital (Bar Chart)
- Distribusi rating pelanggan (Bar Chart)
- Hotspot ranking kecamatan

### 🤖 AI Insight Otomatis
- Integrasi **Claude Sonnet 4** (Anthropic) untuk menghasilkan analisis naratif otomatis
- Menganalisis dominasi kategori, tingkat digitalisasi, hotspot area, dan rekomendasi prioritas sensus

### 📤 Ekspor Data Multi-Format
| Format | Deskripsi |
|--------|-----------|
| `JSON` | Data lengkap semua field |
| `CSV` | Siap import ke Excel / SPSS |
| `GeoJSON` | Kompatibel QGIS, ArcGIS, Google Earth Engine |
| `TXT` | Laporan naratif siap cetak |

---

## 🏗️ Arsitektur Sistem

```
┌──────────────────────────────────────────────────────────┐
│                      BROWSER (Frontend)                  │
│                                                          │
│  index.html + css/style.css + js/app.js                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Leaflet.js  │  │  Chart.js    │  │  Claude API    │  │
│  │ (Peta)      │  │  (Grafik)    │  │  (AI Insight)  │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└─────────────┬────────────────────────────────────────────┘
              │ HTTP POST /scrape
              ▼
┌──────────────────────────────────────────────────────────┐
│              BACKEND PYTHON (FastAPI)                    │
│                     backend.py                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │           ScrapeGraphAI SDK                     │    │
│  │  SmartScraper → Schema Extraction → JSON        │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌────────────────┐  ┌──────────────────────────────┐   │
│  │  Nominatim OSM │  │  Geocoding & Coordinate      │   │
│  │  (Geocoding)   │  │  Enrichment                  │   │
│  └────────────────┘  └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────┐
│              SUMBER DATA (Scraping Targets)              │
│  📍 Google Maps  📸 Instagram  👥 Facebook               │
│  🛒 Tokopedia   🟠 Shopee     🔴 Bukalapak  🌐 Web       │
└──────────────────────────────────────────────────────────┘
```

**Mode operasi:**
- **Mode Backend** — Frontend → FastAPI Python → ScrapeGraphAI SDK → Sumber Data
- **Mode Direct** — Frontend → ScrapeGraphAI REST API langsung (fallback otomatis)

---

## 📁 Struktur Proyek

```
geoscrape-se2026/
├── index.html          # Halaman utama — markup, layout, modal
├── css/
│   └── style.css       # Stylesheet lengkap + responsive design
├── js/
│   └── app.js          # Logika aplikasi: scraping, peta, charts, ekspor
├── backend.py          # Server FastAPI + ScrapeGraphAI orchestrator
├── requirements.txt    # Dependensi Python backend
└── README.md           # Dokumentasi ini
```

---

## ⚙️ Instalasi & Penggunaan

### Prasyarat

| Komponen | Versi Minimum |
|----------|--------------|
| Python | 3.9+ |
| Node.js | Tidak diperlukan (opsional) |
| Browser Modern | Chrome 90+, Firefox 88+, Edge 90+ |
| ScrapeGraphAI API Key | Diperoleh dari [scrapegraphai.com](https://scrapegraphai.com) |

### 1. Clone Repository

```bash
git clone https://github.com/username/geoscrape-se2026.git
cd geoscrape-se2026
```

### 2. Setup Backend Python

```bash
# Install dependensi
pip install -r requirements.txt

# Atau install manual
pip install fastapi uvicorn scrapegraph-py pydantic python-dotenv
```

### 3. Konfigurasi API Key

Buat file `.env` di root project:

```env
SGAI_API_KEY=sgai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> ⚠️ **Jangan** commit file `.env` ke repository. Tambahkan ke `.gitignore`.

### 4. Jalankan Backend

```bash
# Via script langsung
python backend.py

# Atau via uvicorn
uvicorn backend:app --host 0.0.0.0 --port 8000 --reload
```

Server berjalan di: `http://localhost:8000`  
Dokumentasi API otomatis: `http://localhost:8000/docs`

### 5. Buka Frontend

Cukup buka `index.html` di browser, atau serve dengan HTTP server sederhana:

```bash
# Python built-in server
python -m http.server 3000

# Atau gunakan Live Server (VS Code extension)
```

Buka `http://localhost:3000` di browser.

### 6. Hubungkan ke Backend

Di tab **SCRAPE**, masukkan URL backend (`http://localhost:8000`) lalu klik ikon 🔌 untuk verifikasi koneksi.

---

## 🚀 Cara Penggunaan

### Scraping Data Baru

1. **Tab SCRAPE** → Masukkan nama wilayah (contoh: `Medan Sunggal`) dan provinsi
2. Pilih **sumber data** yang diinginkan (Google Maps, Instagram, Tokopedia, dll.)
3. Pilih **kategori KBLI** yang relevan (Kuliner, Fashion, Elektronik, dll.)
4. Opsional: tambahkan instruksi khusus di kolom **Prompt Scraping**
5. Atur **Maks. Hasil** dan **Timeout**
6. Klik **MULAI SCRAPING** — progress ditampilkan real-time di log sistem
7. Hasil otomatis muncul di peta dan tab **HASIL**

### Menggunakan Data Demo (Offline)

Klik **"Muat Data Demo (offline)"** untuk memuat 48 usaha sampel di Medan tanpa memerlukan koneksi ke backend atau API key.

### Ekspor Data

1. Klik tombol **Ekspor** di header atau ikon unduh di toolbar peta
2. Pilih format: JSON / CSV / GeoJSON / Laporan TXT
3. File otomatis terunduh ke komputer

---

## 🌐 Sumber Data yang Didukung

| Platform | Tipe Data | Keterangan |
|----------|-----------|------------|
| 📍 Google Maps | Lokasi usaha, rating, ulasan | Koordinat GPS akurat |
| 📸 Instagram | Usaha berbasis akun IG | Dari hashtag lokasi |
| 👥 Facebook | Marketplace & halaman bisnis | Listing produk lokal |
| 🛒 Tokopedia | Toko online | Lokasi & rating toko |
| 🟠 Shopee | Toko online | Lokasi & rating toko |
| 🔴 Bukalapak | Toko online | Listing produk lokal |
| 🌐 Web Umum | Google Search | Agregasi multi-sumber |

---

## 🏷️ Kategori Usaha (KBLI 2020)

| Kode | Kategori | Contoh Sub-Kategori |
|------|----------|---------------------|
| 🍜 | Kuliner | Warung makan, katering, kopi |
| 👗 | Fashion | Pakaian, hijab, aksesoris |
| 📱 | Elektronik | HP, laptop, servis gadget |
| 💊 | Kesehatan | Apotek, herbal, skincare |
| 🚗 | Otomotif | Bengkel, spare part, cuci mobil |
| 🔧 | Jasa | Laundry, percetakan, ekspedisi |
| 🌾 | Pertanian | Hasil tani, pupuk, alat tani |
| 📚 | Pendidikan | Kursus, les privat, buku |

---

## 🔌 API Reference (Backend)

### `GET /health`
Cek status server dan ketersediaan SGAI SDK.

**Response:**
```json
{
  "status": "ok",
  "sgai_sdk": true
}
```

### `POST /scrape`
Endpoint utama scraping. Menjalankan ScrapeGraphAI SmartScraper secara concurrent.

**Request Body:**
```json
{
  "wilayah": "Medan Kota",
  "provinsi": "Sumatera Utara",
  "radius_km": 5,
  "sources": ["google_maps", "instagram", "tokopedia"],
  "kategori": ["kuliner", "fashion"],
  "prompt_tambahan": "Fokus pada usaha aktif dengan nomor WhatsApp",
  "max_results": 50,
  "timeout": 60
}
```

**Response:**
```json
{
  "success": true,
  "total": 42,
  "data": [
    {
      "id": "google_maps_123456",
      "nama": "Warung Bu Sari",
      "kategori": "kuliner",
      "alamat": "Jl. Gatot Subroto No. 12",
      "kecamatan": "Medan Kota",
      "lat": 3.5941,
      "lng": 98.6732,
      "platform": "google_maps",
      "telepon": "+6281234567890",
      "rating": 4.5,
      "jumlah_ulasan": 128,
      "aktif": true
    }
  ],
  "errors": [],
  "source_counts": { "google_maps": 18, "instagram": 14, "tokopedia": 10 }
}
```

### `GET /geocode?q={query}`
Geocode nama tempat ke koordinat GPS via Nominatim OSM.

**Contoh:** `GET /geocode?q=Medan+Sunggal`

**Response:**
```json
{ "lat": 3.5872, "lng": 98.6251 }
```

### `GET /sources`
Daftar sumber dan kategori yang tersedia.

---

## 🛠️ Teknologi yang Digunakan

### Frontend
| Library | Versi | Fungsi |
|---------|-------|--------|
| [Leaflet.js](https://leafletjs.com) | 1.9.4 | Peta interaktif |
| [Chart.js](https://www.chartjs.org) | 4.4.0 | Visualisasi data |
| Google Maps Tiles | — | Basemap satelit/roadmap |
| Font Awesome | 6.5.0 | Ikon UI |
| Google Fonts | — | Syne, DM Sans, Space Mono |

### Backend
| Library | Versi | Fungsi |
|---------|-------|--------|
| [FastAPI](https://fastapi.tiangolo.com) | ≥0.110 | REST API framework |
| [Uvicorn](https://www.uvicorn.org) | ≥0.29 | ASGI server |
| [scrapegraph-py](https://pypi.org/project/scrapegraph-py/) | ≥1.7.0 | ScrapeGraphAI SDK |
| [Pydantic](https://pydantic.dev) | ≥2.0 | Validasi data & schema |
| [python-dotenv](https://pypi.org/project/python-dotenv/) | ≥1.0 | Manajemen environment |
| Nominatim (OSM) | — | Geocoding gratis |

### AI & External APIs
| Layanan | Penggunaan |
|---------|------------|
| **ScrapeGraphAI** | Ekstraksi data AI dari website |
| **Claude Sonnet 4** (Anthropic) | Analisis naratif & insight otomatis |
| **Nominatim / OpenStreetMap** | Geocoding nama tempat → koordinat GPS |

---

## 📱 Dukungan Perangkat

GeoScrape SE2026 sepenuhnya **responsif** dan mendukung:

- 🖥️ **Desktop** (≥ 900px) — layout dua kolom penuh dengan semua fitur
- 📱 **Tablet** (641–900px) — panel dioptimalkan, semua fungsi tersedia
- 📲 **Mobile** (≤ 640px) — bottom navigation, panel overlay slide-in, UI dioptimalkan sentuh

---

## 🔒 Catatan Keamanan

- **API Key SGAI** disimpan di file `.env` dan **tidak** boleh di-commit ke repository publik
- Backend menggunakan CORS `allow_origins=["*"]` — untuk produksi, batasi ke domain frontend yang spesifik
- Nominatim digunakan sesuai [kebijakan penggunaan OSM](https://operations.osmfoundation.org/policies/nominatim/) dengan User-Agent yang benar
- Data hasil scraping bersifat publik dan digunakan sesuai tujuan sensus resmi BPS

---

## 🤝 Kontribusi

Kontribusi sangat disambut! Berikut cara berkontribusi:

1. **Fork** repository ini
2. Buat branch fitur baru: `git checkout -b fitur/nama-fitur`
3. Commit perubahan: `git commit -m 'feat: tambah fitur X'`
4. Push ke branch: `git push origin fitur/nama-fitur`
5. Buat **Pull Request**

### Panduan Commit
Gunakan format [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: tambah sumber data OLX
fix: perbaiki parsing rating Shopee
docs: perbarui panduan instalasi
style: perbaiki tampilan mobile sidebar
```

---

## 📋 Roadmap

- [ ] Autentikasi pengguna (login per petugas BPS)
- [ ] Database PostgreSQL untuk penyimpanan data persisten
- [ ] Sinkronisasi real-time antar petugas lapangan
- [ ] Integrasi Gojek / GrabFood untuk data kuliner
- [ ] Export ke format SHP (Shapefile) untuk GIS profesional
- [ ] Dashboard admin pusat untuk agregasi data nasional
- [ ] Validasi silang otomatis dengan data NIB (OSS)
- [ ] Mode offline (PWA) untuk daerah dengan koneksi terbatas

---

## 📄 Lisensi

Proyek ini dikembangkan untuk keperluan **Sensus Ekonomi 2026 BPS RI**.  
Lisensi: [MIT License](LICENSE)

---

## 👥 Tim Pengembang

Dikembangkan oleh tim **BPS Intelligence Unit** untuk mendukung pelaksanaan Sensus Ekonomi 2026 yang akurat, efisien, dan berbasis data digital.

---

## 📬 Kontak & Dukungan

Untuk pertanyaan teknis, bug report, atau saran fitur:
- Buat **Issue** di halaman GitHub repository
- Email: se2026@bps.go.id *(placeholder)*

---

<div align="center">

**GeoScrape SE2026** · Dibuat dengan ❤️ untuk BPS RI

*"Mewujudkan Sensus Ekonomi 2026 yang cerdas, cepat, dan berbasis teknologi"*

</div>
