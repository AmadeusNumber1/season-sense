const POLLEN_KEYS = [
  { key: "alder_pollen", label: "Alder" },
  { key: "birch_pollen", label: "Birch" },
  { key: "grass_pollen", label: "Grass" },
  { key: "ragweed_pollen", label: "Ragweed" },
  { key: "mugwort_pollen", label: "Mugwort" },
  { key: "olive_pollen", label: "Olive" },
];

const locateBtn = document.getElementById("locateBtn");
const searchBtn = document.getElementById("searchBtn");
const cityInput = document.getElementById("cityInput");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const forecastEl = document.getElementById("forecast");
const sourcesEl = document.getElementById("sources");

function levelClass(value) {
  if (value <= 20) return ["Low", "low"];
  if (value <= 60) return ["Moderate", "moderate"];
  if (value <= 120) return ["High", "high"];
  return ["Very High", "very-high"];
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function startOfDayIndex(times, date) {
  const target = date.toISOString().slice(0, 10);
  return times.findIndex((t) => t.startsWith(target));
}

function aggregateDay(hours) {
  const valid = hours.filter((n) => typeof n === "number" && !Number.isNaN(n));
  if (!valid.length) return 0;
  return Math.max(...valid);
}

function buildDailyFromHourly(hourly) {
  const times = hourly.time;
  const daily = [];

  for (let d = 0; d < 7; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const start = startOfDayIndex(times, day);
    if (start === -1) continue;

    const end = Math.min(start + 24, times.length);
    const bucket = { date: day.toISOString().slice(0, 10), metrics: {} };

    for (const { key } of POLLEN_KEYS) {
      bucket.metrics[key] = aggregateDay(hourly[key].slice(start, end));
    }

    daily.push(bucket);
  }

  return daily;
}

async function fetchPollen(lat, lon, label = "your area") {
  setStatus(`Fetching allergy data for ${label}…`);

  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: "auto",
    forecast_days: "7",
    domains: "cams_europe",
    hourly: POLLEN_KEYS.map((p) => p.key).join(","),
  });

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load pollen data.");

  const data = await res.json();
  render(data, label);
}

function renderSources() {
  sourcesEl.innerHTML = `
    <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo Air Quality API</a>
    <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noreferrer">Open-Meteo Geocoding API</a>
    <p>Data coverage for pollen is strongest in Europe (CAMS Europe model).</p>
  `;
}

function render(data, label) {
  if (!data?.hourly?.time?.length) {
    setStatus(`No pollen data returned for ${label}. Try another nearby city.`);
    summaryEl.innerHTML = "";
    forecastEl.innerHTML = "";
    return;
  }

  const daily = buildDailyFromHourly(data.hourly);
  if (!daily.length) {
    setStatus(`No usable daily allergy data for ${label}.`);
    return;
  }

  const today = daily[0];

  const topThree = POLLEN_KEYS
    .map((p) => ({
      label: p.label,
      value: Number(today.metrics[p.key] ?? 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  summaryEl.innerHTML = topThree
    .map((p) => {
      const [text, cls] = levelClass(p.value);
      return `<article class="pollen-card">
        <h3>${p.label}</h3>
        <div class="value">${p.value.toFixed(1)}</div>
        <span class="badge ${cls}">${text}</span>
      </article>`;
    })
    .join("");

  forecastEl.innerHTML = daily
    .map((d) => {
      const day = formatDate(d.date);
      const grass = Number(d.metrics.grass_pollen ?? 0).toFixed(1);
      const birch = Number(d.metrics.birch_pollen ?? 0).toFixed(1);
      const ragweed = Number(d.metrics.ragweed_pollen ?? 0).toFixed(1);
      return `<div class="row">
      <span>${day}</span>
      <span>Grass: ${grass}</span>
      <span>Birch: ${birch}</span>
      <span>Ragweed: ${ragweed}</span>
    </div>`;
    })
    .join("");

  setStatus(`Showing allergy forecast for ${label}. Updated just now.`);
  renderSources();
}

async function searchCity() {
  const q = cityInput.value.trim();
  if (!q) return setStatus("Type a city name first.");

  setStatus(`Searching ${q}…`);
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  const res = await fetch(geoUrl);
  if (!res.ok) throw new Error("City search failed.");

  const data = await res.json();
  const place = data.results?.[0];
  if (!place) return setStatus(`No results for '${q}'.`);

  const label = [place.name, place.country].filter(Boolean).join(", ");
  await fetchPollen(place.latitude, place.longitude, label);
}

locateBtn.addEventListener("click", async () => {
  if (!navigator.geolocation) return setStatus("Geolocation is not supported in this browser.");

  setStatus("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        await fetchPollen(latitude, longitude);
      } catch (err) {
        setStatus(err.message || "Failed to fetch allergy data.");
      }
    },
    () => setStatus("Location permission denied. Try city search instead."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

searchBtn.addEventListener("click", () => {
  searchCity().catch((err) => setStatus(err.message || "Failed to search city."));
});

cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    searchCity().catch((err) => setStatus(err.message || "Failed to search city."));
  }
});

setStatus("Tap 'Use my location' to get started.");
renderSources();
