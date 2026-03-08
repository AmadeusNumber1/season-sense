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
const locationBriefEl = document.getElementById("locationBrief");
const summaryEl = document.getElementById("summary");
const forecastEl = document.getElementById("forecast");
const sourcesEl = document.getElementById("sources");
const adviceWrapEl = document.getElementById("adviceWrap");
const adviceTextEl = document.getElementById("adviceText");

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
  if (!valid.length) return null;
  return Math.max(...valid);
}

function buildDailyFromHourly(hourly) {
  const times = hourly.time || [];
  const daily = [];

  for (let d = 0; d < 7; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const start = startOfDayIndex(times, day);
    if (start === -1) continue;

    const end = Math.min(start + 24, times.length);
    const bucket = { date: day.toISOString().slice(0, 10), metrics: {} };

    for (const { key } of POLLEN_KEYS) {
      const arr = Array.isArray(hourly[key]) ? hourly[key] : [];
      bucket.metrics[key] = aggregateDay(arr.slice(start, end));
    }

    daily.push(bucket);
  }

  return daily;
}

function hasAnyNumericPollen(hourly) {
  return POLLEN_KEYS.some(({ key }) =>
    Array.isArray(hourly[key]) && hourly[key].some((v) => typeof v === "number")
  );
}

async function fetchByPoint(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: "auto",
    forecast_days: "7",
    domains: "auto",
    cell_selection: "nearest",
    hourly: POLLEN_KEYS.map((p) => p.key).join(","),
  });

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`;
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { ok: false, reason: payload.reason || "Could not load pollen data." };
  }
  if (!payload?.hourly?.time?.length) {
    return { ok: false, reason: "No hourly pollen model data returned." };
  }
  if (!hasAnyNumericPollen(payload.hourly)) {
    return { ok: false, reason: "Pollen model data missing for this area right now." };
  }

  return { ok: true, payload };
}

async function tryNearbyPoints(lat, lon) {
  const points = [
    [lat, lon],
    [lat + 0.2, lon],
    [lat - 0.2, lon],
    [lat, lon + 0.2],
    [lat, lon - 0.2],
    [lat + 0.5, lon],
    [lat - 0.5, lon],
    [lat, lon + 0.5],
    [lat, lon - 0.5],
  ];

  let lastReason = "Could not load pollen data.";
  for (const [plat, plon] of points) {
    try {
      const result = await fetchByPoint(plat, plon);
      if (result.ok) return { ...result, point: { lat: plat, lon: plon } };
      lastReason = result.reason || lastReason;
    } catch {
      lastReason = "Network error while loading pollen data.";
    }
  }

  return { ok: false, reason: lastReason };
}

async function resolveNearestCity(lat, lon) {
  try {
    const reverseUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
    const reverseRes = await fetch(reverseUrl);
    const reverseData = await reverseRes.json();
    const cityName = reverseData.city || reverseData.locality;
    if (!cityName) return null;

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      cityName
    )}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    const place = geoData.results?.[0];
    if (!place) return null;

    return {
      name: [place.name, place.country].filter(Boolean).join(", "),
      lat: place.latitude,
      lon: place.longitude,
    };
  } catch {
    return null;
  }
}

async function fetchPollen(lat, lon, label = "your area") {
  setStatus(`Fetching allergy data for ${label}…`);

  const nearby = await tryNearbyPoints(lat, lon);
  if (nearby.ok) {
    render(nearby.payload, label, nearby.point);
    return;
  }

  const city = await resolveNearestCity(lat, lon);
  if (city) {
    const cityTry = await tryNearbyPoints(city.lat, city.lon);
    if (cityTry.ok) {
      setStatus(`Using nearest supported model area: ${city.name}.`);
      render(cityTry.payload, city.name, cityTry.point);
      return;
    }
  }

  throw new Error(nearby.reason || "Could not load pollen data.");
}

async function renderLocationBrief(label, usedLat, usedLon, meta = {}) {
  const base = [label, meta.timezone, meta.elevation != null ? `${Math.round(meta.elevation)}m elevation` : null]
    .filter(Boolean)
    .join(" · ");

  try {
    const reverseUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(
      usedLat
    )}&longitude=${encodeURIComponent(usedLon)}&localityLanguage=en`;
    const r = await fetch(reverseUrl);
    const d = await r.json();
    const place = [d.city || d.locality, d.principalSubdivision, d.countryName].filter(Boolean).join(", ");
    const text = `${place}. Seasonal pollen snapshot from nearest forecast grid point.`;
    const finalText = (text || base || "Location detected.").slice(0, 200);
    locationBriefEl.textContent = finalText;
    locationBriefEl.hidden = false;
  } catch {
    locationBriefEl.textContent = (base || "Location detected.").slice(0, 200);
    locationBriefEl.hidden = false;
  }
}

function renderSources() {
  sourcesEl.innerHTML = `
    <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo Air Quality API (pollen forecast model)</a>
    <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noreferrer">Open-Meteo Geocoding API (city search)</a>
    <a href="https://www.bigdatacloud.com/geocoding-apis/free-reverse-geocode-to-city-api" target="_blank" rel="noreferrer">BigDataCloud Reverse Geocoding (location description)</a>
    <p>Coverage can vary by region/season; values shown come from the nearest available model grid.</p>
  `;
}

function renderAdvice(maxValue) {
  const [level] = levelClass(maxValue ?? 0);
  let text = "Low risk today. Keep your routine and monitor symptoms.";

  if (level === "Moderate") {
    text = "Moderate risk today. Consider antihistamines early and avoid peak windy hours outside.";
  } else if (level === "High") {
    text = "High risk today. Keep windows closed, shower after outdoor time, and use a mask if needed.";
  } else if (level === "Very High") {
    text = "Very high risk today. Limit outdoor exposure and use your allergy meds proactively.";
  }

  adviceTextEl.textContent = text;
  adviceWrapEl.hidden = false;
}

function render(data, label, usedPoint) {
  if (!data?.hourly?.time?.length) {
    setStatus(`No pollen data returned for ${label}. Try another nearby city.`);
    summaryEl.innerHTML = "";
    forecastEl.innerHTML = "";
    adviceWrapEl.hidden = true;
    locationBriefEl.hidden = true;
    return;
  }

  const daily = buildDailyFromHourly(data.hourly);
  if (!daily.length) {
    setStatus(`No usable daily allergy data for ${label}.`);
    adviceWrapEl.hidden = true;
    locationBriefEl.hidden = true;
    return;
  }

  const today = daily[0];

  const topThree = POLLEN_KEYS.map((p) => ({
    label: p.label,
    value: Number(today.metrics[p.key] ?? 0),
    raw: today.metrics[p.key],
  }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const hasAnyModelData = POLLEN_KEYS.some(({ key }) => typeof today.metrics[key] === "number");
  if (!hasAnyModelData) {
    setStatus(`Pollen model data is not available for ${label} right now. Try a nearby major city.`);
    summaryEl.innerHTML = "";
    forecastEl.innerHTML = "";
    adviceWrapEl.hidden = true;
    locationBriefEl.hidden = true;
    return;
  }

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
      const grass = d.metrics.grass_pollen == null ? "—" : Number(d.metrics.grass_pollen).toFixed(1);
      const birch = d.metrics.birch_pollen == null ? "—" : Number(d.metrics.birch_pollen).toFixed(1);
      const ragweed = d.metrics.ragweed_pollen == null ? "—" : Number(d.metrics.ragweed_pollen).toFixed(1);
      return `<div class="row">
      <span>${day}</span>
      <span>Grass: ${grass}</span>
      <span>Birch: ${birch}</span>
      <span>Ragweed: ${ragweed}</span>
    </div>`;
    })
    .join("");

  const maxToday = Math.max(...topThree.map((p) => p.value));
  renderAdvice(maxToday);

  renderLocationBrief(label, usedPoint?.lat ?? data.latitude, usedPoint?.lon ?? data.longitude, {
    timezone: data.timezone,
    elevation: data.elevation,
  });

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
