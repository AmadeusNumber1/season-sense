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

async function fetchPollen(lat, lon, label = "your area") {
  setStatus(`Fetching allergy data for ${label}…`);

  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: "auto",
    daily: POLLEN_KEYS.map((p) => p.key).join(","),
  });

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load pollen data.");

  const data = await res.json();
  render(data, label);
}

function render(data, label) {
  const { daily } = data;
  if (!daily?.time?.length) {
    setStatus(`No pollen data returned for ${label}.`);
    return;
  }

  const todayIdx = 0;
  const topThree = [...POLLEN_KEYS]
    .map((p) => ({
      label: p.label,
      value: Number(daily[p.key]?.[todayIdx] ?? 0),
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

  const maxDays = Math.min(7, daily.time.length);
  forecastEl.innerHTML = Array.from({ length: maxDays }, (_, i) => {
    const day = formatDate(daily.time[i]);
    const grass = Number(daily.grass_pollen?.[i] ?? 0).toFixed(1);
    const birch = Number(daily.birch_pollen?.[i] ?? 0).toFixed(1);
    const ragweed = Number(daily.ragweed_pollen?.[i] ?? 0).toFixed(1);

    return `<div class="row">
      <span>${day}</span>
      <span>Grass: ${grass}</span>
      <span>Birch: ${birch}</span>
      <span>Ragweed: ${ragweed}</span>
    </div>`;
  }).join("");

  setStatus(`Showing allergy forecast for ${label}.`);
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
