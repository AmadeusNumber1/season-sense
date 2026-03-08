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
const modeBadgeEl = document.getElementById("modeBadge");
const locationBriefEl = document.getElementById("locationBrief");
const summaryEl = document.getElementById("summary");
const airExplainEl = document.getElementById("airExplain");
const airExplainTextEl = document.getElementById("airExplainText");
const forecastEl = document.getElementById("forecast");
const sourcesEl = document.getElementById("sources");
const driversWrapEl = document.getElementById("driversWrap");
const driversTextEl = document.getElementById("driversText");
const symptomsWrapEl = document.getElementById("symptomsWrap");
const symptomsTextEl = document.getElementById("symptomsText");
const adviceWrapEl = document.getElementById("adviceWrap");
const adviceTextEl = document.getElementById("adviceText");
const coldCheckWrapEl = document.getElementById("coldCheckWrap");
const coldCheckTextEl = document.getElementById("coldCheckText");

function levelClass(value) {
  if (value <= 20) return ["Low", "low"];
  if (value <= 60) return ["Moderate", "moderate"];
  if (value <= 120) return ["High", "high"];
  return ["Very High", "very-high"];
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function iconForLabel(label) {
  const map = {
    Grass: "🌾",
    Alder: "🌳",
    Birch: "🌿",
    Ragweed: "🍂",
    Mugwort: "🌱",
    Olive: "🫒",
    "Dust (PM10)": "🌫️",
    UV: "☀️",
    Wind: "💨",
  };
  return map[label] || "•";
}

function renderModeBadge(text) {
  modeBadgeEl.textContent = text;
  modeBadgeEl.hidden = false;
}

function renderAirExplain(text) {
  airExplainTextEl.textContent = text;
  airExplainEl.hidden = false;
}

function renderDrivers(text) {
  driversTextEl.textContent = text;
  driversWrapEl.hidden = false;
}

function renderSymptoms(text) {
  symptomsTextEl.textContent = text;
  symptomsWrapEl.hidden = false;
}

function renderColdVsAllergy(text) {
  coldCheckTextEl.textContent = text;
  coldCheckWrapEl.hidden = false;
}

function buildColdVsAllergyText() {
  return "Allergies are more likely with itchy/watery eyes, repeated sneezing, and clear mucus without fever. A cold is more likely with fever, sore throat, body aches, and thicker mucus. If symptoms persist or worsen, check with a clinician.";
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

function buildDailyFromHourly(hourly, keys) {
  const times = hourly.time || [];
  const daily = [];

  for (let d = 0; d < 7; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const start = startOfDayIndex(times, day);
    if (start === -1) continue;

    const end = Math.min(start + 24, times.length);
    const bucket = { date: day.toISOString().slice(0, 10), metrics: {} };

    for (const key of keys) {
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
    hourly: [...POLLEN_KEYS.map((p) => p.key), "pm10", "wind_speed_10m", "relative_humidity_2m"].join(","),
  });

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`;
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { ok: false, reason: payload.reason || "Could not load data." };
  }
  if (!payload?.hourly?.time?.length) {
    return { ok: false, reason: "No model data returned." };
  }

  return { ok: true, payload, hasPollen: hasAnyNumericPollen(payload.hourly) };
}

function buildSearchPoints(lat, lon) {
  const distances = [0, 0.2, 0.5, 1, 2, 3, 5];
  const points = [[lat, lon]];

  for (const d of distances) {
    if (d === 0) continue;
    points.push([lat + d, lon]);
    points.push([lat - d, lon]);
    points.push([lat, lon + d]);
    points.push([lat, lon - d]);
    points.push([lat + d, lon + d]);
    points.push([lat + d, lon - d]);
    points.push([lat - d, lon + d]);
    points.push([lat - d, lon - d]);
  }

  return points;
}

async function tryNearbyPoints(lat, lon) {
  const points = buildSearchPoints(lat, lon);

  let lastReason = "Could not load pollen data.";
  let fallbackNoPollen = null;

  for (const [plat, plon] of points) {
    try {
      const result = await fetchByPoint(plat, plon);
      if (!result.ok) {
        lastReason = result.reason || lastReason;
        continue;
      }
      if (result.hasPollen) return { ...result, point: { lat: plat, lon: plon }, mode: "pollen" };
      if (!fallbackNoPollen) fallbackNoPollen = { ...result, point: { lat: plat, lon: plon }, mode: "proxy" };
    } catch {
      lastReason = "Network error while loading data.";
    }
  }

  if (fallbackNoPollen) return fallbackNoPollen;
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

async function fetchWeatherDaily(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: "auto",
    forecast_days: "7",
    daily: "uv_index_max,wind_speed_10m_max,temperature_2m_max",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return payload;
}

async function fetchPollen(lat, lon, label = "your area") {
  setStatus(`Fetching allergy data for ${label}…`);

  let nearby = await tryNearbyPoints(lat, lon);
  let finalLabel = label;

  const city = await resolveNearestCity(lat, lon);

  // If first result is only proxy, still attempt to force real pollen mode via nearest city search.
  if (city && (!nearby.ok || nearby.mode !== "pollen")) {
    const cityTry = await tryNearbyPoints(city.lat, city.lon);
    if (cityTry.ok && cityTry.mode === "pollen") {
      nearby = cityTry;
      finalLabel = `${city.name} (nearest pollen zone)`;
    } else if (!nearby.ok && cityTry.ok) {
      nearby = cityTry;
      finalLabel = city.name;
    }
  }

  if (!nearby.ok) throw new Error(nearby.reason || "Could not load data.");

  if (nearby.mode === "pollen") {
    renderPollen(nearby.payload, finalLabel, nearby.point);
  } else {
    const weather = await fetchWeatherDaily(nearby.point.lat, nearby.point.lon);
    renderProxy(nearby.payload, weather, finalLabel, nearby.point);
  }
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
    const text = `${place}. Seasonal allergy snapshot from nearest available forecast grid.`;
    locationBriefEl.textContent = (text || base || "Location detected.").slice(0, 200);
    locationBriefEl.hidden = false;
  } catch {
    locationBriefEl.textContent = (base || "Location detected.").slice(0, 200);
    locationBriefEl.hidden = false;
  }
}

function renderSources(extra = "") {
  sourcesEl.innerHTML = `
    <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo Air Quality API</a>
    <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noreferrer">Open-Meteo Geocoding API</a>
    <a href="https://api.open-meteo.com/v1/forecast" target="_blank" rel="noreferrer">Open-Meteo Weather API</a>
    <a href="https://www.bigdatacloud.com/geocoding-apis/free-reverse-geocode-to-city-api" target="_blank" rel="noreferrer">BigDataCloud Reverse Geocoding</a>
    <p>${extra || "When pollen model is unavailable, an environmental allergy risk proxy is shown."}</p>
  `;
}

function renderAdvice(maxValue, proxy = false) {
  const [level] = levelClass(maxValue ?? 0);
  let text = proxy
    ? "Low environmental allergy risk."
    : "Low pollen risk today. Keep your routine and monitor symptoms.";

  if (level === "Moderate") {
    text = proxy
      ? "Moderate environmental risk. Sensitive users may want meds and less wind exposure."
      : "Moderate pollen risk today. Consider antihistamines early and avoid peak windy hours.";
  } else if (level === "High") {
    text = proxy
      ? "High environmental risk. Limit outdoor exposure and consider a mask."
      : "High pollen risk today. Keep windows closed and shower after outdoor time.";
  } else if (level === "Very High") {
    text = proxy
      ? "Very high environmental risk. Minimize outdoor time and use medication proactively."
      : "Very high pollen risk today. Limit outdoor exposure and use allergy meds proactively.";
  }

  adviceTextEl.textContent = text;
  adviceWrapEl.hidden = false;
}

function renderPollen(data, label, usedPoint) {
  const daily = buildDailyFromHourly(data.hourly, POLLEN_KEYS.map((p) => p.key));
  if (!daily.length) throw new Error("No usable daily allergy data.");

  const today = daily[0];
  const allPollen = POLLEN_KEYS.map((p) => ({
    label: p.label,
    value: Number(today.metrics[p.key] ?? 0),
  })).sort((a, b) => b.value - a.value);

  const pollenIndex = allPollen.reduce((sum, p) => sum + p.value, 0);

  summaryEl.innerHTML = [
    {
      label: "Total Pollen Index",
      value: pollenIndex,
      icon: "🧪",
    },
    ...allPollen,
  ]
    .map((p) => {
      const [text, cls] = levelClass(p.value);
      const icon = p.icon || iconForLabel(p.label);
      return `<article class="pollen-card"><h3><span>${icon}</span>${p.label}</h3><div class="value">${p.value.toFixed(
        1
      )}</div><span class="badge ${cls}">${text}</span></article>`;
    })
    .join("");

  forecastEl.innerHTML = daily
    .map((d) => {
      const day = formatDate(d.date);
      const grass = d.metrics.grass_pollen == null ? "—" : Number(d.metrics.grass_pollen).toFixed(1);
      const birch = d.metrics.birch_pollen == null ? "—" : Number(d.metrics.birch_pollen).toFixed(1);
      const ragweed = d.metrics.ragweed_pollen == null ? "—" : Number(d.metrics.ragweed_pollen).toFixed(1);
      return `<div class="row"><span>${day}</span><span>Grass: ${grass}</span><span>Birch: ${birch}</span><span>Ragweed: ${ragweed}</span></div>`;
    })
    .join("");

  renderAdvice(Math.max(...allPollen.map((p) => p.value)), false);
  renderModeBadge("🧬 Pollen Mode");
  renderAirExplain(
    `Main triggers today: ${allPollen[0].label}, ${allPollen[1].label}, ${allPollen[2].label}, and ${allPollen[3].label}. These are the strongest likely allergens in your local air right now.`
  );
  const windToday = data.hourly?.wind_speed_10m?.find((v) => typeof v === "number");
  const humidityToday = data.hourly?.relative_humidity_2m?.find((v) => typeof v === "number");
  renderDrivers(
    `Blooming pressure is led by ${allPollen[0].label}. ${typeof windToday === "number" ? `Wind is around ${windToday.toFixed(1)} km/h, which can spread pollen farther.` : "Wind may still carry pollen between neighborhoods."} ${typeof humidityToday === "number" ? `Humidity is near ${humidityToday.toFixed(0)}%, which can change how heavy air feels.` : "Humidity can also change how symptoms feel."}`
  );
  renderSymptoms(
    `Most likely today: sneezing, itchy/watery eyes, runny or blocked nose, and throat tickle—especially if you’re sensitive to ${allPollen[0].label.toLowerCase()} pollen.`
  );
  renderColdVsAllergy(buildColdVsAllergyText());
  renderLocationBrief(label, usedPoint.lat, usedPoint.lon, { timezone: data.timezone, elevation: data.elevation });
  setStatus(`Showing pollen forecast for ${label}.`);
  renderSources("Primary source: pollen model.");
}

function renderProxy(air, weather, label, usedPoint) {
  const pmDaily = buildDailyFromHourly(air.hourly, ["pm10"]);
  const w = weather?.daily || {};
  const days = (w.time || pmDaily.map((d) => d.date)).slice(0, 7);

  const rows = days.map((date, i) => ({
    date,
    pm10: pmDaily[i]?.metrics?.pm10 ?? null,
    uv: w.uv_index_max?.[i] ?? null,
    wind: w.wind_speed_10m_max?.[i] ?? null,
  }));

  const today = rows[0] || { pm10: 0, uv: 0, wind: 0 };
  const cards = [
    { label: "Dust (PM10)", value: today.pm10 ?? 0 },
    { label: "UV", value: (today.uv ?? 0) * 12 },
    { label: "Wind", value: (today.wind ?? 0) * 2 },
  ].sort((a, b) => b.value - a.value);

  summaryEl.innerHTML = cards
    .map((p) => {
      const [text, cls] = levelClass(p.value);
      return `<article class="pollen-card"><h3><span>${iconForLabel(p.label)}</span>${p.label}</h3><div class="value">${Number(p.value).toFixed(
        1
      )}</div><span class="badge ${cls}">${text}</span></article>`;
    })
    .join("");

  forecastEl.innerHTML = rows
    .map((d) => {
      const day = formatDate(d.date);
      const pm10 = d.pm10 == null ? "—" : Number(d.pm10).toFixed(1);
      const uv = d.uv == null ? "—" : Number(d.uv).toFixed(1);
      const wind = d.wind == null ? "—" : Number(d.wind).toFixed(1);
      return `<div class="row"><span>${day}</span><span>PM10: ${pm10}</span><span>UV: ${uv}</span><span>Wind: ${wind}</span></div>`;
    })
    .join("");

  renderAdvice(Math.max(...cards.map((c) => c.value)), true);
  renderModeBadge("🌍 Global Proxy Mode");
  renderAirExplain(
    `No direct pollen model here, so risk is estimated from Dust (PM10), UV, and Wind. Higher values can worsen allergy symptoms, especially for sensitive users.`
  );
  const t = rows[0] || {};
  renderDrivers(
    `Today’s air pattern: ${t.pm10 != null ? `dust around ${Number(t.pm10).toFixed(1)} µg/m³` : "dust data limited"}, ${t.wind != null ? `wind near ${Number(t.wind).toFixed(1)} km/h` : "wind variable"}, and ${t.uv != null ? `UV near ${Number(t.uv).toFixed(1)}` : "UV moderate"}. These can amplify irritation.`
  );
  renderSymptoms(
    "Most likely today: dry/itchy eyes, sneezing, throat irritation, and nasal congestion—especially outdoors or in windy periods."
  );
  renderColdVsAllergy(buildColdVsAllergyText());
  renderLocationBrief(label, usedPoint.lat, usedPoint.lon, { timezone: air.timezone, elevation: air.elevation });
  setStatus(`Pollen model unavailable for ${label}. Showing environmental allergy risk proxy.`);
  renderSources("Proxy mode: PM10 + UV + wind used where pollen model is unavailable.");
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
  if (e.key === "Enter") searchCity().catch((err) => setStatus(err.message || "Failed to search city."));
});

setStatus("Tap 'Use my location' to get started.");
renderSources();
