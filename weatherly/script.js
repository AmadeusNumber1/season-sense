const statusEl = document.getElementById('status');
const placeEl = document.getElementById('place');
const cardEl = document.getElementById('weatherCard');
const tempPairEl = document.getElementById('tempPair');
const metaLineEl = document.getElementById('metaLine');
const locBtn = document.getElementById('locBtn');
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');

const cToF = (c) => (c * 9) / 5 + 32;

function setStatus(t){ statusEl.textContent = t; }

async function fetchWeather(lat, lon, label='Your area') {
  setStatus(`Fetching weather for ${label}…`);
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    timezone: 'auto'
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
  if (!res.ok) throw new Error('Could not load weather data.');
  const data = await res.json();
  const cur = data.current;
  const c = Number(cur.temperature_2m ?? 0);
  const f = cToF(c);
  const feelsC = Number(cur.apparent_temperature ?? c);
  const feelsF = cToF(feelsC);
  const hum = Number(cur.relative_humidity_2m ?? 0);
  const wind = Number(cur.wind_speed_10m ?? 0);

  tempPairEl.textContent = `${c.toFixed(1)}°C / ${f.toFixed(1)}°F`;
  metaLineEl.textContent = `Feels like ${feelsC.toFixed(1)}°C / ${feelsF.toFixed(1)}°F · Humidity ${hum.toFixed(0)}% · Wind ${wind.toFixed(1)} km/h`;
  placeEl.textContent = `Location: ${label}`;
  placeEl.hidden = false;
  cardEl.hidden = false;
  setStatus('Updated just now.');
}

async function searchCity() {
  const q = cityInput.value.trim();
  if (!q) return setStatus('Type a city name.');

  setStatus(`Searching ${q}…`);
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
  if (!res.ok) throw new Error('City search failed.');
  const data = await res.json();
  const p = data.results?.[0];
  if (!p) return setStatus(`No results for '${q}'.`);

  const label = [p.name, p.country].filter(Boolean).join(', ');
  await fetchWeather(p.latitude, p.longitude, label);
}

function loadCurrentLocation() {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported. Use Search city.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({coords}) => fetchWeather(coords.latitude, coords.longitude).catch(e => setStatus(e.message)),
    () => setStatus('Location permission denied. Use Search city.'),
    { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
  );
}

locBtn.addEventListener('click', loadCurrentLocation);
searchBtn.addEventListener('click', () => searchCity().catch(e => setStatus(e.message)));
cityInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') searchCity().catch(er => setStatus(er.message)); });

loadCurrentLocation();
