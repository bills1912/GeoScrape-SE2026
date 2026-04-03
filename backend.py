"""
GeoScrape SE2026 - Backend Server
==================================
Jalankan dengan:
    pip install fastapi uvicorn scrapegraph-py pydantic python-dotenv
    uvicorn backend:app --host 0.0.0.0 --port 8000 --reload

Atau dengan Python langsung:
    python backend.py
"""

import asyncio
import json
import re
import os
import urllib.request
from typing import List, Optional
from dotenv import load_dotenv
load_dotenv()


# ── FastAPI & stdlib ─────────────────────────────────────────────────────────
try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    from pydantic import BaseModel, Field
    FASTAPI_OK = True
except ImportError:
    FASTAPI_OK = False
    print("PERINGATAN: FastAPI tidak terinstal. Jalankan: pip install fastapi uvicorn")

# ── ScrapeGraphAI SDK ────────────────────────────────────────────────────────
try:
    from scrapegraph_py import Client, AsyncClient
    SGAI_OK = True
except ImportError:
    SGAI_OK = False
    print("PERINGATAN: scrapegraph-py tidak terinstal. Jalankan: pip install scrapegraph-py")

# ════════════════════════════════════════════════════════════════════════════
SGAI_API_KEY = os.getenv("SGAI_API_KEY")

# ── Pydantic Schemas ─────────────────────────────────────────────────────────
class UsahaItem(BaseModel):
    nama: str = Field(description="Nama usaha")
    kategori: str = Field(description="Kategori usaha / KBLI")
    sub_kategori: Optional[str] = Field(None, description="Sub-kategori spesifik")
    alamat: Optional[str] = Field(None, description="Alamat lengkap")
    kecamatan: Optional[str] = Field(None, description="Nama kecamatan")
    kelurahan: Optional[str] = Field(None, description="Nama kelurahan")
    lat: Optional[float] = Field(None, description="Latitude koordinat GPS")
    lng: Optional[float] = Field(None, description="Longitude koordinat GPS")
    platform: Optional[str] = Field(None, description="Platform digital (instagram, tokopedia, dll)")
    url: Optional[str] = Field(None, description="URL profil atau toko online")
    telepon: Optional[str] = Field(None, description="Nomor telepon atau WhatsApp")
    rating: Optional[float] = Field(None, description="Rating pelanggan (1-5)")
    jumlah_ulasan: Optional[int] = Field(None, description="Jumlah ulasan pelanggan")
    deskripsi: Optional[str] = Field(None, description="Deskripsi singkat usaha")
    aktif: Optional[bool] = Field(True, description="Status aktif usaha")

class UsahaList(BaseModel):
    usaha: List[UsahaItem] = Field(description="Daftar usaha yang ditemukan")

class ScrapeRequest(BaseModel):
    wilayah: str
    provinsi: str
    radius_km: int = 5
    sources: List[str]
    kategori: List[str]
    prompt_tambahan: str = ""
    max_results: int = 50
    timeout: int = 60

class ScrapeResponse(BaseModel):
    success: bool
    total: int
    data: List[dict]
    errors: List[str]
    source_counts: dict

# ════════════════════════════════════════════════════════════════════════════
# SOURCE URL BUILDERS
# ════════════════════════════════════════════════════════════════════════════

def build_source_configs(wilayah: str, provinsi: str, kategori_list: List[str], sources: List[str]) -> List[dict]:
    """Build scraping targets per source."""
    kat_str = ", ".join(kategori_list)
    configs = []

    for src in sources:
        if src == "google_maps":
            configs.append({
                "source": "google_maps",
                "url": f"https://www.google.com/maps/search/usaha+online+UMKM+{wilayah.replace(' ', '+')}+{provinsi.replace(' ', '+')}",
                "prompt": f"""
Kamu adalah asisten pencari data untuk Sensus Ekonomi BPS Indonesia 2026.
Cari dan ekstrak semua usaha online / UMKM di wilayah {wilayah}, {provinsi}.
Kategori yang dicari: {kat_str}.
Untuk setiap usaha, ekstrak:
- nama usaha
- kategori (pilih dari: {kat_str})
- sub_kategori (deskripsi lebih spesifik)
- alamat lengkap
- kecamatan
- lat dan lng (koordinat GPS jika tersedia)
- platform (google_maps)
- telepon / WhatsApp
- rating (angka 1-5)
- jumlah_ulasan
- deskripsi singkat
Kembalikan data dalam format JSON dengan key "usaha" berisi array objek.
"""
            })

        elif src == "instagram":
            for kat in kategori_list[:3]:  # limit to avoid too many
                configs.append({
                    "source": "instagram",
                    "url": f"https://www.instagram.com/explore/tags/{kat.replace(' ','')}medan/",
                    "prompt": f"""
Cari akun usaha/bisnis di Instagram yang berjualan {kat} di wilayah {wilayah}, {provinsi} Indonesia.
Ekstrak informasi: nama usaha, kategori ({kat}), alamat (jika ada di bio), kecamatan (estimasi dari {wilayah}),
platform (instagram), telepon/WhatsApp (dari bio), url (link profil), deskripsi (dari bio).
Kembalikan JSON dengan key "usaha" berisi array objek.
"""
                })

        elif src == "facebook":
            configs.append({
                "source": "facebook",
                "url": f"https://www.facebook.com/marketplace/category/home-goods-furniture/?location_latitude=3.5952&location_longitude=98.6722",
                "prompt": f"""
Cari listing usaha / toko online di Facebook Marketplace atau halaman bisnis di wilayah {wilayah}, {provinsi}.
Kategori: {kat_str}.
Ekstrak: nama, kategori, alamat, kecamatan, platform (facebook), telepon, rating, deskripsi.
Kembalikan JSON dengan key "usaha" berisi array objek.
"""
            })

        elif src == "tokopedia":
            for kat in kategori_list[:2]:
                configs.append({
                    "source": "tokopedia",
                    "url": f"https://www.tokopedia.com/search?q={kat}+{wilayah}&source=universe&st=product",
                    "prompt": f"""
Cari toko/usaha yang menjual {kat} di Tokopedia yang berlokasi di {wilayah}, {provinsi}, Sumatera.
Untuk setiap toko, ekstrak: nama toko, kategori ({kat}), kota (dari lokasi toko),
kecamatan (estimasi), platform (tokopedia), url toko, rating toko, jumlah ulasan.
Kembalikan JSON dengan key "usaha" berisi array objek.
"""
                })

        elif src == "shopee":
            for kat in kategori_list[:2]:
                configs.append({
                    "source": "shopee",
                    "url": f"https://shopee.co.id/search?keyword={kat}+{wilayah}&sortBy=relevancy",
                    "prompt": f"""
Cari toko Shopee yang menjual {kat} di {wilayah}, {provinsi}.
Ekstrak: nama toko, kategori ({kat}), lokasi toko, platform (shopee), url, rating, jumlah ulasan.
Kembalikan JSON dengan key "usaha" berisi array objek.
"""
                })

        elif src == "bukalapak":
            configs.append({
                "source": "bukalapak",
                "url": f"https://www.bukalapak.com/products?search[keywords]={kat_str.split(',')[0]}+{wilayah}",
                "prompt": f"""
Cari toko/pelapak di Bukalapak yang berlokasi di {wilayah}, {provinsi}.
Kategori: {kat_str}.
Ekstrak: nama toko, kategori, lokasi, platform (bukalapak), url, rating, jumlah_ulasan.
Kembalikan JSON dengan key "usaha" berisi array objek.
"""
            })

        elif src == "web_umum":
            configs.append({
                "source": "web_umum",
                "url": f"https://www.google.com/search?q=usaha+online+UMKM+{wilayah.replace(' ', '+')}+{provinsi.replace(' ', '+')}+site:instagram.com+OR+site:tokopedia.com+OR+site:shopee.co.id",
                "prompt": f"""
Dari hasil pencarian Google ini, ekstrak informasi usaha online / UMKM di {wilayah}, {provinsi}.
Kategori: {kat_str}.
Untuk setiap usaha yang muncul di hasil pencarian, ekstrak:
nama, kategori, alamat/kota, kecamatan (estimasi {wilayah}), platform (sumber), url, telepon, deskripsi.
Kembalikan JSON dengan key "usaha" berisi array objek.
"""
            })

    return configs


# ════════════════════════════════════════════════════════════════════════════
# GEOCODING VIA NOMINATIM
# ════════════════════════════════════════════════════════════════════════════

def nominatim_geocode(query: str) -> Optional[dict]:
    """Geocode via OpenStreetMap Nominatim (free, no key needed)."""
    try:
        encoded = query.replace(" ", "+")
        url = f"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&limit=1&countrycodes=id"
        req = urllib.request.Request(url, headers={"User-Agent": "GeoScrape-SE2026/1.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
            if data:
                return {"lat": float(data[0]["lat"]), "lng": float(data[0]["lon"])}
    except Exception:
        pass
    return None


def get_base_coords(wilayah: str, provinsi: str) -> dict:
    result = nominatim_geocode(f"{wilayah}, {provinsi}, Indonesia")
    if result:
        return result
    # Fallback ke Medan
    return {"lat": 3.5952, "lng": 98.6722}


def enrich_coordinates(businesses: List[dict], wilayah: str, provinsi: str, base: dict) -> List[dict]:
    """Assign GPS coordinates to businesses that don't have them."""
    import random
    import math

    kecamatan_cache = {}

    for b in businesses:
        if b.get("lat") and b.get("lng"):
            continue  # sudah punya koordinat

        kec = b.get("kecamatan") or wilayah
        if kec not in kecamatan_cache:
            coords = nominatim_geocode(f"{kec}, {provinsi}, Indonesia")
            kecamatan_cache[kec] = coords or base
        center = kecamatan_cache[kec]

        # Scatter dalam radius ~300m
        angle = random.uniform(0, 2 * math.pi)
        dist = random.uniform(0, 0.003)  # ~300m
        b["lat"] = center["lat"] + dist * math.cos(angle)
        b["lng"] = center["lng"] + dist * math.sin(angle)

    return businesses


# ════════════════════════════════════════════════════════════════════════════
# CORE SCRAPING FUNCTION
# ════════════════════════════════════════════════════════════════════════════

async def scrape_single(config: dict, sgai_client) -> List[dict]:
    """Scrape satu sumber dengan SGAI SmartScraper."""
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: sgai_client.smartscraper(
                website_url=config["url"],
                user_prompt=config["prompt"],
                output_schema=UsahaList
            )
        )

        result = response.get("result", {})
        if isinstance(result, str):
            result = json.loads(result.replace("```json", "").replace("```", "").strip())

        usaha_list = []
        if isinstance(result, dict):
            usaha_list = result.get("usaha", result.get("businesses", result.get("data", [])))
        elif isinstance(result, list):
            usaha_list = result

        cleaned = []
        for u in usaha_list:
            if not isinstance(u, dict):
                continue
            item = {
                "id": f"{config['source']}_{hash(u.get('nama',''))%999999:06d}",
                "nama": u.get("nama") or u.get("name") or "Usaha Tanpa Nama",
                "kategori": (u.get("kategori") or u.get("category") or config["source"]).lower(),
                "sub_kategori": u.get("sub_kategori") or u.get("subcategory") or "",
                "alamat": u.get("alamat") or u.get("address") or "",
                "kecamatan": u.get("kecamatan") or u.get("district") or "",
                "kelurahan": u.get("kelurahan") or "",
                "lat": float(u["lat"]) if u.get("lat") else None,
                "lng": float(u["lng"]) if u.get("lng") else None,
                "platform": config["source"],
                "url": u.get("url") or u.get("link") or "",
                "telepon": u.get("telepon") or u.get("phone") or u.get("whatsapp") or "",
                "rating": float(u["rating"]) if u.get("rating") else None,
                "jumlah_ulasan": int(u["jumlah_ulasan"]) if u.get("jumlah_ulasan") else 0,
                "deskripsi": u.get("deskripsi") or u.get("description") or "",
                "aktif": u.get("aktif", True),
            }
            cleaned.append(item)

        return cleaned

    except Exception as e:
        print(f"[ERROR] Gagal scrape {config['source']}: {e}")
        return []


async def run_scraping(req: ScrapeRequest) -> ScrapeResponse:
    """Main scraping orchestrator."""
    if not SGAI_OK:
        raise RuntimeError("scrapegraph-py tidak terinstal")

    configs = build_source_configs(req.wilayah, req.provinsi, req.kategori, req.sources)
    print(f"[INFO] Total {len(configs)} scraping tasks untuk {req.wilayah}")

    all_results = []
    source_counts = {}
    errors = []

    with Client(api_key=SGAI_API_KEY) as client:
        # Jalankan scraping secara concurrent per source
        tasks = [scrape_single(cfg, client) for cfg in configs]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for cfg, res in zip(configs, results):
            src = cfg["source"]
            if isinstance(res, Exception):
                errors.append(f"{src}: {str(res)}")
                print(f"[ERROR] {src}: {res}")
            else:
                all_results.extend(res)
                source_counts[src] = source_counts.get(src, 0) + len(res)
                print(f"[OK] {src}: {len(res)} usaha")

    # Deduplicate by name
    seen = set()
    unique = []
    for b in all_results:
        key = re.sub(r'\s+', '', b["nama"].lower())
        if key not in seen and key != "usahatananama":
            seen.add(key)
            unique.append(b)

    print(f"[INFO] Deduplicated: {len(all_results)} -> {len(unique)}")

    # Geocode
    base_coords = get_base_coords(req.wilayah, req.provinsi)
    geocoded = enrich_coordinates(unique, req.wilayah, req.provinsi, base_coords)

    # Limit
    geocoded = geocoded[:req.max_results]

    return ScrapeResponse(
        success=True,
        total=len(geocoded),
        data=geocoded,
        errors=errors,
        source_counts=source_counts,
    )


# ════════════════════════════════════════════════════════════════════════════
# FASTAPI APP
# ════════════════════════════════════════════════════════════════════════════

if FASTAPI_OK:
    app = FastAPI(
        title="GeoScrape SE2026 API",
        description="Backend API untuk Sensus Ekonomi 2026 - BPS",
        version="1.0.0"
    )
    
    app.mount("/static", StaticFiles(directory="."), name="static")

    @app.get("/app")
    async def serve_frontend():
        return FileResponse("index.html")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # allow frontend dari semua origin
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    async def root():
        return {
            "app": "GeoScrape SE2026",
            "status": "running",
            "sgai_connected": SGAI_OK,
            "api_key_suffix": SGAI_API_KEY[-6:]
        }

    @app.get("/health")
    async def health():
        return {"status": "ok", "sgai_sdk": SGAI_OK}

    @app.post("/scrape", response_model=ScrapeResponse)
    async def scrape_endpoint(req: ScrapeRequest):
        """
        Endpoint utama scraping.
        Menerima parameter wilayah, sumber, kategori, dan menjalankan SGAI SmartScraper.
        """
        try:
            result = await run_scraping(req)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/geocode")
    async def geocode_endpoint(q: str):
        """Geocode sebuah nama tempat ke koordinat GPS."""
        coords = nominatim_geocode(q)
        if coords:
            return coords
        raise HTTPException(status_code=404, detail="Lokasi tidak ditemukan")

    @app.get("/sources")
    async def list_sources():
        return {
            "sources": ["google_maps", "instagram", "facebook", "tokopedia", "shopee", "bukalapak", "web_umum"],
            "kategori": ["kuliner", "fashion", "elektronik", "kesehatan", "otomotif", "jasa", "pertanian", "pendidikan"]
        }


# ════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if not FASTAPI_OK:
        print("ERROR: Install dependensi terlebih dahulu:")
        print("  pip install fastapi uvicorn scrapegraph-py pydantic")
        exit(1)

    import uvicorn
    print("=" * 60)
    print("  GeoScrape SE2026 Backend")
    print("  BPS - Sensus Ekonomi 2026")
    print("=" * 60)
    print(f"  SGAI API Key: {SGAI_API_KEY[:12]}...{SGAI_API_KEY[-6:]}")
    print(f"  SGAI SDK: {'OK' if SGAI_OK else 'NOT INSTALLED'}")
    print(f"  Server: http://localhost:8000")
    print(f"  Docs:   http://localhost:8000/docs")
    print("=" * 60)

    uvicorn.run(
        "backend:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
