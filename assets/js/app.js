/* =========================================================
   app.js
   Mengatur state, interaksi, dan tampilan halaman Beranda.
   Bergantung pada: Chart.js (CDN) dan data.js
   ========================================================= */

const TARGET_LABEL = { 1: "Oktober 2026", 2: "November 2026", 3: "Desember 2026" };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = { prov: "jabar", kom: "cabai_rawit", hor: 1, selected: null, data: [] };
let chart = null;

const $ = id => document.getElementById(id);
const byScore = arr => [...arr].sort((a, b) => b.skor - a.skor || b.change - a.change);
const selectedRegion = () => state.data.find(d => d.nama === state.selected);

/* ---------------- render utama ---------------- */
function renderAll() {
  state.data = buildRegionData(state.prov, state.kom, state.hor);
  if (!selectedRegion()) state.selected = byScore(state.data)[0].nama;

  const kom = KOMODITAS[state.kom].nama.toLowerCase();
  $("subtitle").textContent = `${WILAYAH[state.prov].nama}, data aktual hingga September 2026`;
  $("map-title").textContent = `Risiko kenaikan harga ${kom}, ${TARGET_LABEL[state.hor]}`;

  renderEnso();
  renderMap();
  renderSide();
  renderKpis();
  renderChart();
}

function renderEnso() {
  const min = -2, max = 3;
  const pos = v => `${((v - min) / (max - min)) * 100}%`;
  const v = CONFIG.ensoIndex;
  const kat = v >= 1.5 ? "kuat" : v >= 1 ? "moderat" : v >= 0.5 ? "lemah" : "netral";
  $("gauge-dot").style.left = pos(v);
  $("gauge-tick").style.left = pos(CONFIG.ensoThreshold);
  $("k-enso").innerHTML = `${v > 0 ? "+" : ""}${fmt.dec(v)} <small>kategori ${kat}</small>`;
}

function selectRegion(nama) {
  state.selected = nama;
  renderMap();
  renderKpis();
  renderChart();
}

function renderMap() {
  const w = WILAYAH[state.prov];
  const map = $("tilemap");
  map.classList.toggle("dense", w.cols > 9);
  map.style.gridTemplateColumns = `repeat(${w.cols}, minmax(0, 1fr))`;
  map.innerHTML = "";

  state.data.forEach(d => {
    const lv = LEVELS[d.level];
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `tile lv${d.level + 1}${d.nama === state.selected ? " is-selected" : ""}`;
    tile.style.gridColumn = d.col + 1;
    tile.style.gridRow = d.row + 1;
    tile.style.background = lv.color;
    tile.setAttribute("aria-label", `${d.nama}, risiko ${lv.key.toLowerCase()}, perubahan harga ${fmt.pct(d.change)}`);
    tile.setAttribute("aria-pressed", d.nama === state.selected);
    tile.innerHTML = `<span>${d.nama}</span><span class="pct">${fmt.pct(d.change)}</span>`;
    tile.addEventListener("click", () => selectRegion(d.nama));
    tile.addEventListener("mousemove", e => showTip(e, d));
    tile.addEventListener("mouseleave", hideTip);
    map.appendChild(tile);
  });

  $("legend").innerHTML = LEVELS
    .map(l => `<span><i class="sw" style="background:${l.color}"></i>${l.key}</span>`)
    .join("");
}

function renderSide() {
  const total = state.data.length;
  const counts = LEVELS.map((_, i) => state.data.filter(d => d.level === i).length);

  $("dist").innerHTML = LEVELS.map((l, i) => `
    <div class="dist-row">
      <span>${l.key}</span><span class="count">${counts[i]}</span>
      <div class="dist-bar"><i style="width:${(counts[i] / total) * 100}%;background:${l.color}"></i></div>
    </div>`).reverse().join("");

  const list = $("critical");
  list.innerHTML = "";
  byScore(state.data).slice(0, 3).forEach(d => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button">
        <span><span class="name">${d.nama}</span>
        <span class="meta">${LEVELS[d.level].key}, skor ${fmt.dec(d.skor)} dari 10</span></span>
        <span class="chip chip--up">${fmt.pct(d.change)}</span>
      </button>`;
    li.querySelector("button").addEventListener("click", () => selectRegion(d.nama));
    list.appendChild(li);
  });

  const high = counts[3] + counts[4];
  const callout = $("callout");
  const kom = KOMODITAS[state.kom].nama.toLowerCase();
  callout.classList.toggle("is-ok", high === 0);
  callout.innerHTML = high > 0
    ? `<strong>Peringatan dini</strong>${high} dari ${total} kabupaten/kota berisiko tinggi mengalami kenaikan harga ${kom}. Prioritaskan pemantauan pasokan di wilayah tersebut.`
    : `<strong>Kondisi terkendali</strong>Tidak ada kabupaten/kota dengan risiko tinggi pada periode ini.`;
}

function renderKpis() {
  const d = selectedRegion();
  const kom = KOMODITAS[state.kom].nama.toLowerCase();
  const up = d.change >= 0;

  $("k-price-label").textContent = `Prediksi harga ${kom} di ${d.nama}`;
  $("k-price").innerHTML = `${fmt.rupiah(d.predicted)} <small>/kg</small>`;
  $("k-price-foot").innerHTML =
    `<span class="chip ${up ? "chip--up" : "chip--down"}">${fmt.pct(d.change)}</span>dari ${fmt.rupiah(d.current)} saat ini`;

  const worst = byScore(state.data)[0];
  $("k-worst").textContent = worst.nama;
  $("k-worst-foot").innerHTML =
    `<span class="chip chip--warn">${LEVELS[worst.level].key}</span>skor ${fmt.dec(worst.skor)} dari 10`;

  const m = CONFIG.metrics;
  $("k-mape").innerHTML = `${fmt.dec(m.gxgb.mape)}% <small>MAPE</small>`;
  $("k-mape-foot").textContent = `Pembanding XGBoost global ${fmt.dec(m.xgbGlobal.mape)}%`;
}

/* ---------------- grafik ---------------- */
// Plugin: arsiran periode El Niño + garis "Sekarang"
const bandsPlugin = {
  id: "bands",
  beforeDatasetsDraw(c, _args, opts) {
    const { ctx, chartArea: a, scales: { x } } = c;
    const months = opts.months || [];
    const half = months.length > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2 : 0;
    ctx.save();
    let start = null;
    months.forEach(([y, m], i) => {
      const on = inElNino(y, m);
      if (on && start === null) start = i;
      const last = i === months.length - 1;
      if (start !== null && (!on || last)) {
        const end = on ? i : i - 1;
        const x0 = Math.max(a.left, x.getPixelForValue(start) - half);
        const x1 = Math.min(a.right, x.getPixelForValue(end) + half);
        ctx.fillStyle = "rgba(255,149,0,.08)";
        ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
        start = null;
      }
    });
    if (opts.nowIndex != null) {
      const xp = x.getPixelForValue(opts.nowIndex);
      ctx.strokeStyle = "#C7C7CC";
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(xp, a.top); ctx.lineTo(xp, a.bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#6E6E73";
      ctx.font = `500 11px ${Chart.defaults.font.family}`;
      ctx.fillText("Sekarang", xp + 6, a.top + 12);
    }
    ctx.restore();
  }
};

function areaGradient(c) {
  const { ctx, chartArea } = c;
  if (!chartArea) return "rgba(0,113,227,.08)";
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, "rgba(0,113,227,.16)");
  g.addColorStop(1, "rgba(0,113,227,0)");
  return g;
}

function renderChart() {
  const d = selectedRegion();
  const kom = KOMODITAS[state.kom].nama.toLowerCase();
  const s = buildSeries(d, state.kom);

  $("chart-title").textContent = `Tren harga ${kom} di ${d.nama}`;
  $("chart-sub").textContent = "Harga aktual Januari 2023 hingga September 2026 dan prediksi G-XGBoost enam bulan ke depan";

  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const nino = s.actual.filter((v, i) => v !== null && inElNino(...s.months[i]));
  const normal = s.actual.filter((v, i) => v !== null && !inElNino(...s.months[i]));
  const allActual = s.actual.filter(v => v !== null);
  $("stats").innerHTML = `
    <div><dt>Rata-rata saat El Niño</dt><dd>${fmt.rupiah(avg(nino))}</dd></div>
    <div><dt>Rata-rata di luar El Niño</dt><dd>${fmt.rupiah(avg(normal))}</dd></div>
    <div><dt>Selisih</dt><dd>${fmt.pct((avg(nino) / avg(normal) - 1) * 100)}</dd></div>
    <div><dt>Harga tertinggi historis</dt><dd>${fmt.rupiah(Math.max(...allActual))}</dd></div>`;

  const data = {
    labels: s.labels,
    datasets: [
      {
        label: "Harga aktual", data: s.actual,
        borderColor: "#0071E3", backgroundColor: c => areaGradient(c.chart),
        fill: true, borderWidth: 2.2, tension: .35,
        pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: "#0071E3"
      },
      {
        label: "Prediksi", data: s.pred,
        borderColor: "#FF9500", borderDash: [6, 5], borderWidth: 2.2, tension: .35,
        pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: "#FF9500"
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion ? false : { duration: 350 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      bands: { months: s.months, nowIndex: s.lastIdx },
      tooltip: {
        backgroundColor: "rgba(29,29,31,.9)", padding: 10, cornerRadius: 10,
        titleFont: { weight: "600" }, displayColors: false,
        filter: it => it.raw !== null && !(it.datasetIndex === 1 && it.dataIndex === s.lastIdx),
        callbacks: {
          title: items => {
            const [y, m] = s.months[items[0].dataIndex];
            return `${BULAN_PANJANG[m - 1]} ${y}${inElNino(y, m) ? ", periode El Niño" : ""}`;
          },
          label: it => `${it.dataset.label}: ${fmt.rupiah(it.raw)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false }, border: { display: false },
        ticks: { color: "#A1A1A6", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
      },
      y: {
        grid: { color: "#F0F0F3" }, border: { display: false },
        ticks: { color: "#A1A1A6", padding: 8, callback: v => `${(v / 1000).toLocaleString("id-ID")} rb` }
      }
    }
  };

  if (chart) {
    chart.data = data;
    chart.options = options;
    chart.update();
  } else {
    chart = new Chart($("trend"), { type: "line", data, options, plugins: [bandsPlugin] });
  }
}

/* ---------------- tooltip peta ---------------- */
const tip = $("tip");
function showTip(e, d) {
  tip.innerHTML = `<b>${d.nama}</b><br>Risiko ${LEVELS[d.level].key.toLowerCase()}<br>
    Saat ini ${fmt.rupiah(d.current)}<br>Prediksi ${fmt.rupiah(d.predicted)} (${fmt.pct(d.change)})`;
  tip.style.left = `${e.clientX + 14}px`;
  tip.style.top = `${e.clientY + 14}px`;
  tip.style.opacity = 1;
}
function hideTip() { tip.style.opacity = 0; }

/* ---------------- segmented control ---------------- */
function placeThumb(seg) {
  const active = seg.querySelector('[aria-checked="true"]');
  const thumb = seg.querySelector(".seg-thumb");
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

function initSegmented(id, onChange) {
  const seg = $(id);
  seg.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", b === btn));
      placeThumb(seg);
      onChange(btn.dataset.value);
    });
  });
  placeThumb(seg);
  return seg;
}

/* ---------------- inisialisasi ---------------- */
function init() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;

  const segs = [
    initSegmented("seg-prov", v => { state.prov = v; state.selected = null; renderAll(); }),
    initSegmented("seg-hor", v => { state.hor = Number(v); renderAll(); })
  ];

  const sel = $("sel-kom");
  sel.innerHTML = Object.entries(KOMODITAS)
    .map(([k, v]) => `<option value="${k}">${v.nama}</option>`).join("");
  sel.addEventListener("change", e => { state.kom = e.target.value; renderAll(); });

  $("btn-report").addEventListener("click", () => alert("Fitur unduh laporan belum dibuat."));

  // posisi thumb dihitung ulang setelah font selesai dimuat
  document.fonts?.ready.then(() => segs.forEach(placeThumb));

  renderAll();
}

init();
