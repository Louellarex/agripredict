/* =========================================================
   data.js
   Konfigurasi, data contoh, dan fungsi bantu.
   Di sistem sebenarnya, fungsi buildRegionData() dan buildSeries()
   diganti dengan pengambilan data hasil model dari database/API,
   misalnya: fetch(`/api/prediksi?prov=${prov}&kom=${kom}&target=${h}`)
   ========================================================= */

const CONFIG = {
  ensoIndex: 1.6,        // CONTOH: ambil dari data ENSO BMKG terbaru
  ensoThreshold: 0.5,    // ambang El Niño
  lastActual: { year: 2026, month: 9 },
  // CONTOH: verifikasi periode El Niño ke BMKG/NOAA sebelum dipakai
  elNinoPeriods: [
    { start: [2023, 6], end: [2024, 4] },
    { start: [2026, 6], end: [2027, 3] }
  ],
  // CONTOH: ganti dengan hasil evaluasi model pada data uji
  metrics: { gxgb: { mape: 8.4 }, xgbGlobal: { mape: 10.9 } }
};

// Harga dasar & volatilitas relatif: CONTOH, bukan data riil
const KOMODITAS = {
  cabai_rawit: { nama: "Cabai rawit merah",   base: 58000, vol: 0.28 },
  cabai_merah: { nama: "Cabai merah keriting", base: 46000, vol: 0.24 },
  telur:       { nama: "Telur ayam ras",       base: 28500, vol: 0.08 },
  ayam:        { nama: "Daging ayam ras",      base: 37500, vol: 0.07 }
};

// Tata letak peta skematik: [nama, kolom, baris]
const WILAYAH = {
  jabar: {
    nama: "Jawa Barat", cols: 8, rows: 5,
    items: [
      ["Kota Depok",1,0],["Kota Bekasi",2,0],["Bekasi",3,0],["Karawang",4,0],["Subang",5,0],["Indramayu",6,0],["Kota Cirebon",7,0],
      ["Kota Sukabumi",0,1],["Bogor",1,1],["Kota Bogor",2,1],["Purwakarta",4,1],["Sumedang",5,1],["Majalengka",6,1],["Cirebon",7,1],
      ["Sukabumi",0,2],["Cianjur",1,2],["Bandung Barat",2,2],["Kota Cimahi",3,2],["Kota Bandung",4,2],["Kuningan",6,2],
      ["Bandung",3,3],["Garut",4,3],["Kota Tasikmalaya",5,3],["Ciamis",6,3],["Kota Banjar",7,3],
      ["Tasikmalaya",5,4],["Pangandaran",6,4]
    ]
  },
  jatim: {
    nama: "Jawa Timur", cols: 11, rows: 5,
    items: [
      ["Tuban",1,0],["Lamongan",2,0],["Gresik",3,0],["Kota Surabaya",4,0],["Bangkalan",5,0],["Sampang",6,0],["Pamekasan",7,0],["Sumenep",8,0],
      ["Ngawi",0,1],["Bojonegoro",1,1],["Jombang",2,1],["Mojokerto",3,1],["Sidoarjo",4,1],["Pasuruan",5,1],["Kota Pasuruan",6,1],["Kota Probolinggo",7,1],["Probolinggo",8,1],["Situbondo",9,1],
      ["Magetan",0,2],["Kota Madiun",1,2],["Nganjuk",2,2],["Kota Mojokerto",3,2],["Kota Batu",4,2],["Malang",5,2],["Lumajang",7,2],["Bondowoso",9,2],["Banyuwangi",10,2],
      ["Ponorogo",0,3],["Madiun",1,3],["Kediri",2,3],["Kota Kediri",3,3],["Kota Malang",5,3],["Jember",8,3],
      ["Pacitan",0,4],["Trenggalek",1,4],["Tulungagung",2,4],["Blitar",3,4],["Kota Blitar",4,4]
    ]
  }
};

const LEVELS = [
  { key: "Sangat rendah", color: "var(--r1)" },
  { key: "Rendah",        color: "var(--r2)" },
  { key: "Sedang",        color: "var(--r3)" },
  { key: "Tinggi",        color: "var(--r4)" },
  { key: "Sangat tinggi", color: "var(--r5)" }
];

const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const BULAN_PANJANG = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

/* ---------- format angka ---------- */
const fmt = {
  rupiah: n => "Rp " + Math.round(n).toLocaleString("id-ID"),
  pct: n => (n >= 0 ? "+" : "") + n.toFixed(1).replace(".", ",") + "%",
  dec: n => n.toFixed(1).replace(".", ",")
};

/* ---------- bantu ---------- */
function seeded(str) {  // RNG deterministik agar data contoh selalu sama
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inElNino(y, m) {
  const v = y * 12 + m;
  return CONFIG.elNinoPeriods.some(p =>
    v >= p.start[0] * 12 + p.start[1] && v <= p.end[0] * 12 + p.end[1]);
}

/* ---------- data contoh: prediksi per kabupaten/kota ---------- */
function buildRegionData(provKey, komKey, horizon) {
  const kom = KOMODITAS[komKey];
  return WILAYAH[provKey].items.map(([nama, col, row]) => {
    const rnd = seeded(provKey + nama + komKey);
    const sens = Math.pow(rnd(), 0.9);          // kepekaan wilayah terhadap El Niño
    const amp = 0.6 + 0.6 * rnd();
    const current = kom.base * (0.9 + rnd() * 0.25);
    const changeAt = k => {                      // perubahan harga (%) k bulan ke depan
      const hf = [0, 0.85, 1, 1.1, 1.05, 0.95, 0.85][k];
      return kom.vol * 60 * sens * amp * hf - kom.vol * 6;
    };
    const change = changeAt(horizon);
    const skor = Math.max(0, Math.min(10, (change / (kom.vol * 60)) * 10 * 1.35));
    return {
      nama, col, row, sens, current, changeAt, change, skor,
      predicted: current * (1 + change / 100),
      level: Math.min(4, Math.floor(skor / 2))
    };
  });
}

/* ---------- data contoh: deret waktu satu wilayah ---------- */
function buildSeries(region, komKey) {
  const kom = KOMODITAS[komKey];
  const rnd = seeded("series" + region.nama + komKey);
  const { year: ly, month: lm } = CONFIG.lastActual;
  const lastV = ly * 12 + lm;
  const labels = [], months = [], raw = [];
  let y = 2023, m = 1, trend = 1;

  while (y * 12 + m <= lastV + 6) {
    labels.push(BULAN[m - 1] + " '" + String(y).slice(2));
    months.push([y, m]);
    const season = Math.sin((m / 12) * Math.PI * 2 + 1.2) * kom.vol * 0.35;
    const nino = inElNino(y, m) ? region.sens * kom.vol * 0.9 : 0;
    const noise = (rnd() - 0.5) * kom.vol * 0.25;
    raw.push(trend * (1 + season + nino + noise));
    trend *= 1.002;
    if (++m > 12) { m = 1; y++; }
  }

  // skala ulang agar harga aktual terakhir sama dengan harga saat ini
  const lastIdx = months.findIndex(([yy, mm]) => yy * 12 + mm === lastV);
  const scale = region.current / raw[lastIdx];
  const actual = raw.map((v, i) => (i <= lastIdx ? Math.round(v * scale) : null));
  const pred = labels.map((_, i) => {
    if (i < lastIdx) return null;
    const k = i - lastIdx;
    return k === 0 ? actual[lastIdx] : Math.round(region.current * (1 + region.changeAt(k) / 100));
  });

  return { labels, months, actual, pred, lastIdx };
}
