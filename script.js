/* ==========================================================================
   AETHERA WEATHER APPLICATION JAVASCRIPT CONTROLLER
   ========================================================================== */

// Clear any old PWA caches immediately on load to prevent stale code loads
if ('caches' in window) {
  caches.keys().then(keys => {
    keys.forEach(key => {
      if (key === 'aethera-weather-cache-v1') {
        caches.delete(key).then(() => {
          console.log('Cleared stale cache v1');
          window.location.reload();
        });
      }
    });
  });
}

// --- Configuration & Constants ---
// Place your real OpenWeatherMap API Key here to fetch live data (fallback layer).
const OPENWEATHER_API_KEY = "YOUR_API_KEY_HERE";

// Cache Configuration TTLs (Time-To-Live)
const CACHE_WEATHER_TTL = 15 * 60 * 1000; // 15 Minutes
const CACHE_GEO_TTL = 24 * 60 * 60 * 1000; // 24 Hours

// State Management
const state = {
  units: localStorage.getItem('aethera_units') || 'metric', // 'metric' (°C) or 'imperial' (°F)
  theme: localStorage.getItem('aethera_theme') || 'dark',   // 'dark' or 'light'
  favorites: JSON.parse(localStorage.getItem('aethera_favorites')) || ['London', 'New York', 'Tokyo', 'Kharadi'],
  history: JSON.parse(localStorage.getItem('aethera_history')) || ['London', 'Pune', 'New York'],
  activeLocation: {
    name: 'London, Greater London, England, United Kingdom',
    lat: 51.5074,
    lon: -0.1278,
    level: 'City',
    confidence: 100,
    provider: 'OSM Nominatim'
  },
  weatherData: null,
  chartInstance: null,
  particlesInterval: null,
  particleEngine: null
};

// --- DOM Element Cache ---
const elements = {
  body: document.body,
  splashScreen: document.getElementById('splash-screen'),
  splashProgress: document.getElementById('splash-progress'),
  splashStatus: document.getElementById('splash-status'),
  appContainer: document.getElementById('app-container'),

  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  clearSearchBtn: document.getElementById('clear-search-btn'),
  searchDropdown: document.getElementById('search-dropdown'),
  autocompleteSection: document.getElementById('autocomplete-section'),
  autocompleteList: document.getElementById('autocomplete-list'),
  searchHistoryList: document.getElementById('search-history-list'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),

  locateBtn: document.getElementById('locate-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  refreshIcon: document.getElementById('refresh-icon'),
  unitToggle: document.getElementById('unit-toggle'),
  unitC: document.getElementById('unit-c'),
  unitF: document.getElementById('unit-f'),
  themeBtn: document.getElementById('theme-btn'),
  themeIcon: document.getElementById('theme-icon'),

  favoriteToggle: document.getElementById('favorite-toggle'),
  favoritesContainer: document.getElementById('favorites-container'),

  cityName: document.getElementById('city-name'),
  currentDate: document.getElementById('current-date'),
  currentTemp: document.getElementById('current-temp'),
  weatherIconSvg: document.getElementById('weather-icon-svg'),
  weatherDesc: document.getElementById('weather-desc'),
  tempMax: document.getElementById('temp-max'),
  tempMin: document.getElementById('temp-min'),

  feelsLike: document.getElementById('feels-like'),
  humidity: document.getElementById('humidity'),
  windSpeedQuick: document.getElementById('wind-speed-quick'),
  aqiBadge: document.getElementById('aqi-badge'),
  aqiDot: document.getElementById('aqi-dot'),
  aqiText: document.getElementById('aqi-text'),
  lastUpdatedTime: document.getElementById('last-updated-time'),

  hourlyScroll: document.getElementById('hourly-scroll'),
  dailyForecastList: document.getElementById('daily-forecast-list'),
  alertsCard: document.getElementById('alerts-card'),
  alertTitle: document.getElementById('alert-title'),
  alertDesc: document.getElementById('alert-desc'),

  uvIndexVal: document.getElementById('uv-index-val'),
  uvThumb: document.getElementById('uv-thumb'),
  uvDesc: document.getElementById('uv-desc'),

  sunriseTime: document.getElementById('sunrise-time'),
  sunsetTime: document.getElementById('sunset-time'),
  arcProgress: document.getElementById('arc-progress'),
  sunNode: document.getElementById('sun-node'),

  compassNeedle: document.getElementById('compass-needle'),
  windSpeed: document.getElementById('wind-speed'),
  windDir: document.getElementById('wind-dir'),
  windGust: document.getElementById('wind-gust'),

  humidityVal: document.getElementById('humidity-val'),
  humidityFill: document.getElementById('humidity-fill'),
  dewPoint: document.getElementById('dew-point'),

  visibilityVal: document.getElementById('visibility-val'),
  cloudinessVal: document.getElementById('cloudiness-val'),
  visibilityDesc: document.getElementById('visibility-desc'),

  pressureVal: document.getElementById('pressure-val'),
  pressurePointer: document.getElementById('pressure-pointer'),
  pressureDesc: document.getElementById('pressure-desc'),

  matchedLocationText: document.getElementById('matched-location-text'),
  matchedCoordsText: document.getElementById('matched-coords-text'),
  confidenceCircle: document.getElementById('confidence-circle'),
  confidencePercentageText: document.getElementById('confidence-percentage-text'),
  resolvedTypeTag: document.getElementById('resolved-type-tag'),
  resolvedProviderTag: document.getElementById('resolved-provider-tag'),

  pwaBanner: document.getElementById('pwa-banner'),
  pwaInstall: document.getElementById('pwa-install'),
  pwaDismiss: document.getElementById('pwa-dismiss'),
  backToTop: document.getElementById('back-to-top'),
  offlineBanner: document.getElementById('offline-banner'),

  cursorGlow: document.getElementById('cursor-glow'),
  cursorDot: document.getElementById('cursor-dot'),
  canvas: document.getElementById('weather-particles')
};

// --- Cache Service Manager ---
const CacheService = {
  get(key) {
    try {
      const data = localStorage.getItem(key);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (Date.now() > parsed.expiry) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed.value;
    } catch (e) {
      return null;
    }
  },

  set(key, value, ttl) {
    try {
      const data = {
        value: value,
        expiry: Date.now() + ttl
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn("Storage quota limit reached, could not cache details.");
    }
  },

  clearPrefix(prefix) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
  }
};

// --- Geocoding Fallback Engine ---
const GeocoderService = {
  // Check if string contains coordinates
  parseCoordinates(query) {
    const regex = /^s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
    const match = query.trim().match(regex);
    if (match) {
      return {
        lat: parseFloat(match[1]),
        lon: parseFloat(match[2])
      };
    }
    return null;
  },

  calculateConfidenceScore(query, address, level) {
    const qWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const resLower = address.toLowerCase();
    let matches = 0;
    qWords.forEach(word => {
      if (resLower.includes(word)) matches++;
    });

    const overlap = qWords.length > 0 ? (matches / qWords.length) : 1;
    let factor = 0.95;

    if (['locality', 'suburb', 'neighbourhood', 'village'].includes(level.toLowerCase())) {
      factor = 0.99;
    } else if (['postcode', 'postalcode'].includes(level.toLowerCase())) {
      factor = 1.0;
    } else if (['city', 'town'].includes(level.toLowerCase())) {
      factor = 0.95;
    } else if (['district', 'county', 'taluka'].includes(level.toLowerCase())) {
      factor = 0.88;
    } else {
      factor = 0.80;
    }

    return Math.round(overlap * factor * 100);
  },

  determineLocationLevel(addressData) {
    if (addressData.neighbourhood || addressData.suburb) return 'Suburb';
    if (addressData.locality || addressData.quarter) return 'Locality';
    if (addressData.village || addressData.hamlet) return 'Village';
    if (addressData.postcode) return 'Postal Code';
    if (addressData.city || addressData.town) return 'City';
    if (addressData.district || addressData.county || addressData.taluka) return 'District';
    if (addressData.state) return 'State';
    return 'Region';
  },

  formatNominatimAddress(addr) {
    const parts = [];
    if (addr.neighbourhood || addr.suburb || addr.locality || addr.village) {
      parts.push(addr.neighbourhood || addr.suburb || addr.locality || addr.village);
    }
    if (addr.city || addr.town || addr.district || addr.county) {
      parts.push(addr.city || addr.town || addr.district || addr.county);
    }
    if (addr.state) parts.push(addr.state);
    if (addr.country) parts.push(addr.country);
    return parts.join(', ');
  },

  async search(query) {
    const cleanQuery = query.trim();
    if (!cleanQuery) throw new Error("Search query is empty");

    // 1. Direct coordinate lookup check
    const coords = this.parseCoordinates(cleanQuery);
    if (coords) {
      return {
        name: `Coords: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`,
        lat: coords.lat,
        lon: coords.lon,
        level: 'Coordinates',
        confidence: 100,
        provider: 'Direct Coordinates'
      };
    }

    // 2. Check local geocode cache
    const cacheKey = `geo_query_${cleanQuery.toLowerCase()}`;
    const cachedResult = CacheService.get(cacheKey);
    if (cachedResult) return cachedResult;

    // 3. Fallback geocoder pipelines
    let errorLog = [];

    // Pipeline A: OpenStreetMap Nominatim API
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&addressdetails=1&limit=3`;
      // Fetch with standard User-Agent header context
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en-US,en;q=0.9' }
      });
      if (!res.ok) throw new Error(`OSM Nominatim returned HTTP ${res.status}`);
      const data = await res.json();

      if (data && data.length > 0) {
        const primary = data[0];
        const level = this.determineLocationLevel(primary.address);
        const name = this.formatNominatimAddress(primary.address) || primary.display_name;
        const confidence = this.calculateConfidenceScore(cleanQuery, name, level);

        const result = {
          name: name,
          lat: parseFloat(primary.lat),
          lon: parseFloat(primary.lon),
          level: level,
          confidence: Math.min(100, Math.max(15, confidence)),
          provider: 'OSM Nominatim'
        };
        CacheService.set(cacheKey, result, CACHE_GEO_TTL);
        return result;
      }
    } catch (e) {
      errorLog.push(`OSM Nominatim failed: ${e.message}`);
    }

    // Pipeline B: Open-Meteo Geocoding Search
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=3&language=en&format=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Open-Meteo Geocoding returned HTTP ${res.status}`);
      const data = await res.json();

      if (data && data.results && data.results.length > 0) {
        const primary = data.results[0];
        const locationDetails = [primary.name];
        if (primary.admin1) locationDetails.push(primary.admin1);
        if (primary.country) locationDetails.push(primary.country);
        const name = locationDetails.join(', ');

        // map feature codes to location levels
        let level = 'City';
        if (primary.feature_code && primary.feature_code.startsWith('PPL')) {
          level = primary.feature_code === 'PPLA' ? 'District' : 'Town/Village';
        }

        const confidence = this.calculateConfidenceScore(cleanQuery, name, level);

        const result = {
          name: name,
          lat: primary.latitude,
          lon: primary.longitude,
          level: level,
          confidence: Math.min(100, Math.max(15, confidence)),
          provider: 'Open-Meteo'
        };
        CacheService.set(cacheKey, result, CACHE_GEO_TTL);
        return result;
      }
    } catch (e) {
      errorLog.push(`Open-Meteo Geocoding failed: ${e.message}`);
    }

    // Pipeline C: OpenWeather Geocoding API (Fallback with key)
    if (OPENWEATHER_API_KEY && OPENWEATHER_API_KEY !== "YOUR_API_KEY_HERE") {
      try {
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanQuery)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`OpenWeather Geocoding returned HTTP ${res.status}`);
        const data = await res.json();

        if (data && data.length > 0) {
          const primary = data[0];
          const name = `${primary.name}${primary.state ? ', ' + primary.state : ''}, ${primary.country}`;
          const result = {
            name: name,
            lat: primary.lat,
            lon: primary.lon,
            level: 'City',
            confidence: this.calculateConfidenceScore(cleanQuery, name, 'City'),
            provider: 'OpenWeather'
          };
          CacheService.set(cacheKey, result, CACHE_GEO_TTL);
          return result;
        }
      } catch (e) {
        errorLog.push(`OpenWeather Geocoding failed: ${e.message}`);
      }
    }

    // If offline or geocoders return empty, build mock matching to guarantee operation
    return generateStaticMockGeocode(cleanQuery);
  },

  // Google-like Autocomplete Suggestions fetcher
  async getSuggestions(query) {
    if (query.trim().length < 2) return [];

    try {
      // Primary choice Nominatim is extremely fast for autocompletion
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en-US,en;q=0.9' }
      });
      if (res.ok) {
        const data = await res.json();
        return data.map(item => {
          const mainName = item.address.neighbourhood || item.address.suburb || item.address.locality || item.address.village || item.address.city || item.address.town || item.name;
          const fullLabel = this.formatNominatimAddress(item.address) || item.display_name;
          return {
            name: mainName,
            label: fullLabel,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon)
          };
        });
      }
    } catch (e) {
      // Fallback suggestions from Open-Meteo
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.results) {
            return data.results.map(item => {
              const locationParts = [item.name];
              if (item.admin1) locationParts.push(item.admin1);
              if (item.country) locationParts.push(item.country);
              return {
                name: item.name,
                label: locationParts.join(', '),
                lat: item.latitude,
                lon: item.longitude
              };
            });
          }
        }
      } catch (err) { }
    }

    // Static local auto-complete recommendations fallback if network fails
    return getStaticSuggestionsFallback(query);
  }
};

// --- Weather Service Multi-API Fallback Engine ---
const WeatherService = {
  // Mapping WMO Weather Codes (Open-Meteo) to standard terms
  mapWMOCodeToCondition(code) {
    if (code === 0) return 'Clear';
    if (code === 1 || code === 2 || code === 3) return 'Clouds';
    if (code >= 45 && code <= 48) return 'Atmosphere';
    if (code >= 51 && code <= 55) return 'Drizzle';
    if (code >= 61 && code <= 65) return 'Rain';
    if (code >= 66 && code <= 67) return 'Snow';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 80 && code <= 82) return 'Rain';
    if (code >= 85 && code <= 86) return 'Snow';
    if (code >= 95 && code <= 99) return 'Thunderstorm';
    return 'Clouds';
  },

  mapWMOCodeToDescription(code) {
    const descriptions = {
      0: 'clear sky',
      1: 'mainly clear',
      2: 'partly cloudy',
      3: 'overcast',
      45: 'foggy',
      48: 'depositing rime fog',
      51: 'light drizzle',
      53: 'moderate drizzle',
      55: 'dense drizzle',
      61: 'slight rain',
      63: 'moderate rain',
      65: 'heavy rain',
      71: 'light snow fall',
      73: 'moderate snow fall',
      75: 'heavy snow fall',
      77: 'snow grains',
      80: 'slight rain showers',
      81: 'moderate rain showers',
      82: 'violent rain showers',
      85: 'slight snow showers',
      86: 'heavy snow showers',
      95: 'thunderstorm',
      96: 'thunderstorm with slight hail',
      99: 'thunderstorm with heavy hail'
    };
    return descriptions[code] || 'cloudy overcast';
  },

  async fetchForecast(lat, lon) {
    const cacheKey = `weather_forecast_${lat.toFixed(4)}_${lon.toFixed(4)}`;
    const cachedResult = CacheService.get(cacheKey);
    if (cachedResult) return cachedResult;

    let errorLog = [];

    // Provider 1: Open-Meteo
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,pressure_msl,visibility,wind_speed_10m,wind_direction_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_probability_max&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Open-Meteo returned HTTP status ${res.status}`);
      const data = await res.json();

      const mapped = this.parseOpenMeteoResponse(data);
      CacheService.set(cacheKey, mapped, CACHE_WEATHER_TTL);
      return mapped;
    } catch (e) {
      errorLog.push(`Open-Meteo API Failed: ${e.message}`);
    }

    // Provider 2: OpenWeatherMap (requires key)
    if (OPENWEATHER_API_KEY && OPENWEATHER_API_KEY !== "YOUR_API_KEY_HERE") {
      try {
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
        const currentRes = await fetch(currentUrl);
        const forecastRes = await fetch(forecastUrl);

        if (currentRes.ok && forecastRes.ok) {
          const currentJson = await currentRes.ok ? await currentRes.json() : null;
          const forecastJson = await forecastRes.ok ? await forecastRes.json() : null;

          if (currentJson && forecastJson) {
            const mapped = assembleOpenWeatherMapResponse(currentJson, forecastJson);
            CacheService.set(cacheKey, mapped, CACHE_WEATHER_TTL);
            return mapped;
          }
        }
      } catch (e) {
        errorLog.push(`OpenWeatherMap API Failed: ${e.message}`);
      }
    }

    // Fallback Mock generator for full reliability
    return generateStaticMockWeather(lat, lon);
  },

  // Map Open-Meteo variables into unified Aethera dashboard state model
  parseOpenMeteoResponse(data) {
    const cur = data.current;
    const hourly = data.hourly;
    const daily = data.daily;

    // Sunrise / Sunset calculations parsed directly from Open-Meteo ISO strings
    const sunriseTs = Math.round(new Date(daily.sunrise[0]).getTime() / 1000);
    const sunsetTs = Math.round(new Date(daily.sunset[0]).getTime() / 1000);

    // Group 24h Hourly parameters (starting from current hour index)
    const currentHourISO = new Date(new Date().setMinutes(0, 0, 0)).toISOString().slice(0, 14) + "00";
    let startIdx = hourly.time.indexOf(currentHourISO);
    if (startIdx === -1) {
      // Find closest hour
      const nowMs = Date.now();
      let diff = Infinity;
      hourly.time.forEach((t, i) => {
        const ms = new Date(t).getTime();
        const d = Math.abs(nowMs - ms);
        if (d < diff) {
          diff = d;
          startIdx = i;
        }
      });
    }

    const hourlyForecast = [];
    for (let i = 0; i < 8; i++) {
      const idx = startIdx + (i * 3); // 3 hour gaps to span 24 hours
      if (idx < hourly.time.length) {
        const timeObj = new Date(hourly.time[idx]);
        // Form hourly display text using local timezone formatting matching data
        const timeStr = timeObj.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });

        hourlyForecast.push({
          time: timeStr,
          temp: hourly.temperature_2m[idx],
          condition: this.mapWMOCodeToCondition(hourly.weather_code[idx]),
          description: this.mapWMOCodeToDescription(hourly.weather_code[idx]),
          rainProb: Math.round(hourly.precipitation_probability[idx] || 0)
        });
      }
    }

    // Group 7-Day Forecast parameters
    const dailyForecast = [];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    daily.time.forEach((dayStr, idx) => {
      const dateObj = new Date(dayStr);
      const dayName = weekdays[dateObj.getDay()];
      dailyForecast.push({
        day: dayName,
        tempMin: daily.temperature_2m_min[idx],
        tempMax: daily.temperature_2m_max[idx],
        condition: this.mapWMOCodeToCondition(daily.weather_code[idx]),
        description: this.mapWMOCodeToDescription(daily.weather_code[idx])
      });
    });

    return {
      temp: cur.temperature_2m,
      tempMax: daily.temperature_2m_max[0],
      tempMin: daily.temperature_2m_min[0],
      condition: this.mapWMOCodeToCondition(cur.weather_code),
      description: this.mapWMOCodeToDescription(cur.weather_code),
      feelsLike: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      windSpeed: cur.wind_speed_10m / 3.6, // convert km/h back to m/s
      windDeg: cur.wind_direction_10m,
      windGust: cur.wind_gusts_10m / 3.6,
      pressure: cur.pressure_msl,
      visibility: (hourly.visibility[startIdx] || 10000) / 1000, // meters to km
      clouds: cur.cloud_cover,
      sunrise: sunriseTs,
      sunset: sunsetTs,
      uvIndex: hourly.uv_index[startIdx] || 0,
      timezoneName: data.timezone,
      utcOffsetSeconds: data.utc_offset_seconds,
      daily: dailyForecast,
      hourly: hourlyForecast
    };
  }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initPWA();
  initTheme();
  initCustomCursor();
  initAutocomplete();
  initSplashLoader();
});

// --- Theme Management ---
function initTheme() {
  if (state.theme === 'dark') {
    elements.body.classList.add('dark-mode');
    elements.themeIcon.setAttribute('data-lucide', 'sun');
  } else {
    elements.body.classList.remove('dark-mode');
    elements.themeIcon.setAttribute('data-lucide', 'moon');
  }
  lucide.createIcons();
}

elements.themeBtn.addEventListener('click', () => {
  elements.themeBtn.classList.add('neumorphic-active');
  setTimeout(() => elements.themeBtn.classList.remove('neumorphic-active'), 150);

  if (elements.body.classList.contains('dark-mode')) {
    elements.body.classList.remove('dark-mode');
    state.theme = 'light';
    elements.themeIcon.setAttribute('data-lucide', 'moon');
  } else {
    elements.body.classList.add('dark-mode');
    state.theme = 'dark';
    elements.themeIcon.setAttribute('data-lucide', 'sun');
  }
  localStorage.setItem('aethera_theme', state.theme);
  lucide.createIcons();

  if (state.weatherData) {
    updateWeatherChart(state.weatherData);
  }
});

// --- Custom Cursor Glow Tracker ---
function initCustomCursor() {
  if (!elements.cursorGlow || !elements.cursorDot) return;

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    elements.cursorGlow.style.display = 'none';
    elements.cursorDot.style.display = 'none';
    return;
  }

  document.addEventListener('mousemove', (e) => {
    elements.cursorGlow.style.left = `${e.clientX}px`;
    elements.cursorGlow.style.top = `${e.clientY}px`;
    elements.cursorDot.style.left = `${e.clientX}px`;
    elements.cursorDot.style.top = `${e.clientY}px`;
  });

  const clickables = document.querySelectorAll('button, input, .favorite-card, .hourly-item, .unit-toggle');
  clickables.forEach(item => {
    item.addEventListener('mouseenter', () => {
      elements.cursorGlow.style.width = '380px';
      elements.cursorGlow.style.height = '380px';
    });
    item.addEventListener('mouseleave', () => {
      elements.cursorGlow.style.width = '300px';
      elements.cursorGlow.style.height = '300px';
    });
  });
}

// --- Splash Loader Execution ---
function initSplashLoader() {
  const steps = [
    { progress: 20, status: 'Initializing geolocation engine...' },
    { progress: 50, status: 'Setting up API routing tables...' },
    { progress: 80, status: 'Syncing timezone cache indexes...' },
    { progress: 100, status: 'Ready. Querying local conditions...' }
  ];

  let currentStep = 0;
  const interval = setInterval(() => {
    if (currentStep < steps.length) {
      const step = steps[currentStep];
      elements.splashProgress.style.width = `${step.progress}%`;
      elements.splashStatus.textContent = step.status;
      currentStep++;
    } else {
      clearInterval(interval);
      loadInitialWeatherData();
    }
  }, 300);
}

function dismissSplash() {
  elements.splashScreen.classList.add('fade-out');
  elements.appContainer.classList.remove('hidden');
  window.dispatchEvent(new Event('scroll'));
}

// --- Search Autocomplete Suggester bindings ---
function initAutocomplete() {
  let debounceTimeout;

  elements.searchInput.addEventListener('input', () => {
    const val = elements.searchInput.value.trim();
    if (!val) {
      elements.clearSearchBtn.classList.add('hidden');
      elements.autocompleteSection.classList.add('hidden');
      return;
    }

    elements.clearSearchBtn.classList.remove('hidden');
    clearTimeout(debounceTimeout);

    debounceTimeout = setTimeout(async () => {
      const suggestions = await GeocoderService.getSuggestions(val);
      renderSuggestions(suggestions);
    }, 350);
  });

  elements.clearSearchBtn.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.clearSearchBtn.classList.add('hidden');
    elements.autocompleteSection.classList.add('hidden');
    elements.searchInput.focus();
  });

  // Close suggestion dropdown on clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.searchInput.contains(e.target) && !elements.searchDropdown.contains(e.target)) {
      elements.searchDropdown.classList.add('hidden');
    }
  });

  elements.searchInput.addEventListener('focus', () => {
    renderHistoryDropdown();
    elements.searchDropdown.classList.remove('hidden');
  });
}

function renderSuggestions(suggestions) {
  elements.autocompleteList.innerHTML = '';

  if (suggestions.length === 0) {
    elements.autocompleteSection.classList.add('hidden');
    return;
  }

  elements.autocompleteSection.classList.remove('hidden');
  elements.searchDropdown.classList.remove('hidden');

  suggestions.forEach(item => {
    const li = document.createElement('li');
    li.className = 'suggestion-item';
    li.innerHTML = `
      <i data-lucide="map-pin" class="suggestion-icon"></i>
      <div class="suggestion-text-block">
        <span class="suggestion-primary">${item.name}</span>
        <span class="suggestion-secondary">${item.label}</span>
      </div>
    `;

    li.addEventListener('click', () => {
      elements.searchInput.value = item.label;
      elements.searchDropdown.classList.add('hidden');
      loadWeatherByResolvedLocation({
        name: item.label,
        lat: item.lat,
        lon: item.lon,
        level: 'Matched',
        confidence: 99,
        provider: 'OSM Autocomplete'
      });
    });

    elements.autocompleteList.appendChild(li);
  });

  lucide.createIcons();
}

// --- Local Storage Favorites & History Sync ---
function renderFavorites() {
  elements.favoritesContainer.innerHTML = '';

  if (state.favorites.length === 0) {
    elements.favoritesContainer.innerHTML = `
      <div class="no-favorites-msg">
        <p>No favorite cities saved yet. Star a city to bookmark it here!</p>
      </div>`;
    return;
  }

  state.favorites.forEach(city => {
    const card = document.createElement('div');
    card.className = 'favorite-card glass-card';
    card.setAttribute('data-city', city);

    const randTemp = getMockTempForCity(city);
    const mockIcon = getMockIconForCity(city);

    card.innerHTML = `
      <h4>${city}</h4>
      <i data-lucide="${mockIcon}"></i>
      <span class="fav-temp">${randTemp}°</span>
    `;

    card.addEventListener('click', () => {
      executeLocationSearch(city);
    });

    elements.favoritesContainer.appendChild(card);
  });
  lucide.createIcons();
}

function renderHistoryDropdown() {
  elements.searchHistoryList.innerHTML = '';
  if (state.history.length === 0) {
    const li = document.createElement('li');
    li.style.cursor = 'default';
    li.style.color = 'var(--text-secondary)';
    li.textContent = 'No recent searches';
    elements.searchHistoryList.appendChild(li);
    return;
  }

  state.history.forEach(city => {
    const li = document.createElement('li');
    li.innerHTML = `<i data-lucide="clock" class="small-icon"></i> ${city}`;
    li.addEventListener('click', () => {
      elements.searchInput.value = city;
      elements.searchDropdown.classList.add('hidden');
      executeLocationSearch(city);
    });
    elements.searchHistoryList.appendChild(li);
  });
  lucide.createIcons();
}

// Add/Remove Favorites toggling
elements.favoriteToggle.addEventListener('click', () => {
  const activeName = state.activeLocation.name;
  // Use first segment of address for clean listing
  const shortName = activeName.split(',')[0].trim();
  const index = state.favorites.indexOf(shortName);

  if (index > -1) {
    state.favorites.splice(index, 1);
    elements.favoriteToggle.classList.remove('active');
  } else {
    state.favorites.push(shortName);
    elements.favoriteToggle.classList.add('active');
  }

  localStorage.setItem('aethera_favorites', JSON.stringify(state.favorites));
  renderFavorites();
});

// Clear history
elements.clearHistoryBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  state.history = [];
  localStorage.setItem('aethera_history', JSON.stringify(state.history));
  renderHistoryDropdown();
});

// Search Trigger Buttons
elements.searchBtn.addEventListener('click', () => {
  const query = elements.searchInput.value.trim();
  if (query) {
    executeLocationSearch(query);
    elements.searchDropdown.classList.add('hidden');
  }
});

elements.searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const query = elements.searchInput.value.trim();
    if (query) {
      executeLocationSearch(query);
      elements.searchDropdown.classList.add('hidden');
    }
  }
});

// Locate button
elements.locateBtn.addEventListener('click', () => {
  if (navigator.geolocation) {
    elements.locateBtn.classList.add('neumorphic-active');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        elements.locateBtn.classList.remove('neumorphic-active');
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        // Match name using reverse geocode
        let name = `Coords: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          if (res.ok) {
            const data = await res.json();
            name = GeocoderService.formatNominatimAddress(data.address) || data.display_name;
          }
        } catch (e) { }

        loadWeatherByResolvedLocation({
          name: name,
          lat: lat,
          lon: lon,
          level: 'GPS Coordinates',
          confidence: 100,
          provider: 'GPS Geolocation'
        });
      },
      (error) => {
        elements.locateBtn.classList.remove('neumorphic-active');
        alert("GPS locate request denied. Using default locations.");
      }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
  }
});

// Refresh button clears Cache to fetch fresh details
elements.refreshBtn.addEventListener('click', () => {
  elements.refreshIcon.classList.add('animate-spin-once');
  setTimeout(() => elements.refreshIcon.classList.remove('animate-spin-once'), 800);

  // Evict cached parameters for active location
  const loc = state.activeLocation;
  const weatherKey = `weather_forecast_${loc.lat.toFixed(4)}_${loc.lon.toFixed(4)}`;
  localStorage.removeItem(weatherKey);

  loadWeatherByResolvedLocation(loc);
});

// C/F toggle
elements.unitToggle.addEventListener('click', () => {
  if (state.units === 'metric') {
    state.units = 'imperial';
    elements.unitToggle.classList.add('fahrenheit');
    elements.unitC.classList.remove('active');
    elements.unitF.classList.add('active');
  } else {
    state.units = 'metric';
    elements.unitToggle.classList.remove('fahrenheit');
    elements.unitC.classList.add('active');
    elements.unitF.classList.remove('active');
  }
  localStorage.setItem('aethera_units', state.units);

  if (state.weatherData) {
    updateDashboardUI(state.weatherData);
  }
});

// --- Controller Loaders ---
async function loadInitialWeatherData() {
  renderFavorites();
  renderHistoryDropdown();

  // Resolve first favorite or default Kharadi
  const defaultSearch = state.favorites[0] || 'Kharadi';
  await executeLocationSearch(defaultSearch);
  dismissSplash();
}

async function executeLocationSearch(query) {
  try {
    showSkeletons();

    // Step 1: Resolve location via Geocoding Chain
    const resolved = await GeocoderService.search(query);
    state.activeLocation = resolved;

    // Add simple query term to history list
    const queryTerm = query.split(',')[0].trim();
    if (!state.history.includes(queryTerm)) {
      state.history.unshift(queryTerm);
      if (state.history.length > 5) state.history.pop();
      localStorage.setItem('aethera_history', JSON.stringify(state.history));
      renderHistoryDropdown();
    }

    // Step 2: Query Weather via Weather Service Chain
    await loadWeatherByResolvedLocation(resolved);

  } catch (error) {
    hideSkeletons();
    alert(`Could not find weather data for search: "${query}".`);
  }
}

async function loadWeatherByResolvedLocation(location) {
  try {
    showSkeletons();
    state.activeLocation = location;

    // Fetch unified weather model
    const weather = await WeatherService.fetchForecast(location.lat, location.lon);
    state.weatherData = weather;

    // Update Favorite Star active status
    const shortName = location.name.split(',')[0].trim();
    if (state.favorites.includes(shortName)) {
      elements.favoriteToggle.classList.add('active');
    } else {
      elements.favoriteToggle.classList.remove('active');
    }

    updateDashboardUI(weather);
    hideSkeletons();
  } catch (e) {
    hideSkeletons();
    alert(`Failed to load weather forecast maps: ${e.message}`);
  }
}

// Convert metrics
function convertTemp(celsius) {
  if (state.units === 'imperial') {
    return Math.round((celsius * 9) / 5 + 32);
  }
  return Math.round(celsius);
}

function convertWind(speedMps) {
  if (state.units === 'imperial') {
    return `${Math.round(speedMps * 2.23694)} mph`;
  }
  return `${Math.round(speedMps * 3.6)} km/h`;
}

// --- Dashboard View Updates ---
function updateDashboardUI(weather) {
  const loc = state.activeLocation;

  // 1. Matched name details (Confidence details)
  const shortCityName = loc.name.split(',')[0].trim();
  elements.cityName.textContent = shortCityName;

  // Display dynamic local time based on weather's timezone offset
  const localDateObj = getLocalTimeFromOffset(weather.utcOffsetSeconds);
  elements.currentDate.textContent = localDateObj.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric'
  });

  elements.currentTemp.textContent = convertTemp(weather.temp);
  elements.tempMax.textContent = `${convertTemp(weather.tempMax)}°`;
  elements.tempMin.textContent = `${convertTemp(weather.tempMin)}°`;
  elements.weatherDesc.textContent = weather.description;

  elements.feelsLike.textContent = `${convertTemp(weather.feelsLike)}°`;
  elements.humidity.textContent = `${weather.humidity}%`;
  elements.windSpeedQuick.textContent = convertWind(weather.windSpeed);

  // Trigger Canvas particle shifts
  updateWeatherConditionBackground(weather.condition);

  // Hydrate custom SVG icons
  elements.weatherIconSvg.innerHTML = getWeatherIconSVG(weather.condition);

  // Dynamic Alert banner simulations
  if (weather.condition === 'Thunderstorm') {
    elements.alertsCard.className = "alerts-section glass-card warning-gradient alert-active";
    elements.alertTitle.textContent = "Active Storm Warnings";
    elements.alertDesc.textContent = "High electrical fields and heavy local precipitation detected. Remain indoors.";
  } else {
    elements.alertsCard.className = "alerts-section glass-card warning-gradient";
    elements.alertTitle.textContent = "No Active Weather Alerts";
    elements.alertDesc.textContent = "Enjoy the current stable atmospheric conditions.";
  }

  // 2. Hydrate Location Match Confidence system
  elements.matchedLocationText.textContent = loc.name;
  elements.matchedCoordsText.textContent = `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
  elements.resolvedTypeTag.textContent = loc.level;
  elements.resolvedProviderTag.textContent = loc.provider;
  elements.confidencePercentageText.textContent = `${loc.confidence}%`;

  // Adjust progress path values
  const pathLength = 100; // approximation circle length
  elements.confidenceCircle.setAttribute('stroke-dasharray', `${loc.confidence}, ${pathLength}`);

  // 3. Hydrate Widgets

  // UV indicator slider
  const calcUV = Math.round(weather.uvIndex);
  elements.uvIndexVal.textContent = calcUV;
  elements.uvThumb.style.left = `${Math.min(100, (calcUV / 11) * 100)}%`;
  if (calcUV <= 2) {
    elements.uvDesc.textContent = "Low risk index.";
  } else if (calcUV <= 5) {
    elements.uvDesc.textContent = "Moderate UV index.";
  } else if (calcUV <= 7) {
    elements.uvDesc.textContent = "High UV levels.";
  } else {
    elements.uvDesc.textContent = "Very high UV index.";
  }

  // Sunrise/sunset trackerprogress using offset calculation relative to destination day length
  const formatSunrise = formatTimeWithOffset(weather.sunrise, weather.utcOffsetSeconds);
  const formatSunset = formatTimeWithOffset(weather.sunset, weather.utcOffsetSeconds);
  elements.sunriseTime.textContent = formatSunrise;
  elements.sunsetTime.textContent = formatSunset;

  // Sun Progress position
  const curTimeTs = Math.round(localDateObj.getTime() / 1000);
  const totalDayLen = weather.sunset - weather.sunrise;
  const currentSunProgress = curTimeTs - weather.sunrise;
  let sunPercent = 0;
  if (currentSunProgress > 0 && currentSunProgress < totalDayLen) {
    sunPercent = currentSunProgress / totalDayLen;
  } else if (currentSunProgress >= totalDayLen) {
    sunPercent = 1;
  }

  const arcStrokeLen = 141;
  elements.arcProgress.setAttribute('stroke-dashoffset', arcStrokeLen - (arcStrokeLen * sunPercent));
  const sunAngle = Math.PI - (sunPercent * Math.PI);
  const sunCx = 50 + 40 * Math.cos(sunAngle);
  const sunCy = 45 - 40 * Math.sin(sunAngle);
  elements.sunNode.setAttribute('cx', sunCx);
  elements.sunNode.setAttribute('cy', sunCy);

  // Compass needles & speed
  elements.windSpeed.innerHTML = `${convertWind(weather.windSpeed)}`;
  elements.windDir.textContent = `Direction: ${weather.windDeg}°`;
  elements.windGust.textContent = weather.windGust ? `Gusts: ${convertWind(weather.windGust)}` : 'Gusts: None';
  elements.compassNeedle.style.transform = `translate(-50%, -50%) rotate(${weather.windDeg}deg)`;

  // Humidity & Dew Point
  elements.humidityVal.textContent = `${weather.humidity}%`;
  elements.humidityFill.style.width = `${weather.humidity}%`;
  const MagnusA = 17.27;
  const MagnusB = 237.7;
  const alphaVal = ((MagnusA * weather.temp) / (MagnusB + weather.temp)) + Math.log(weather.humidity / 100);
  const calculatedDewTemp = (MagnusB * alphaVal) / (MagnusA - alphaVal);
  elements.dewPoint.textContent = `The dew point is ${convertTemp(calculatedDewTemp)}° right now.`;

  // Visibility & cloud coverage
  elements.visibilityVal.innerHTML = `${Math.round(weather.visibility)} <small>km</small>`;
  elements.cloudinessVal.textContent = `Cloud coverage: ${weather.clouds}%`;
  if (weather.visibility >= 9) {
    elements.visibilityDesc.textContent = "Perfect clear visibility.";
  } else if (weather.visibility >= 5) {
    elements.visibilityDesc.textContent = "Hazy conditions. Average visibility.";
  } else {
    elements.visibilityDesc.textContent = "Low visibility parameters.";
  }

  // Pressure barometer
  elements.pressureVal.innerHTML = `${weather.pressure} <small>hPa</small>`;
  const clampPress = Math.min(1050, Math.max(970, weather.pressure));
  const pointerRotationAngle = ((clampPress - 970) / (1050 - 970) * 180) - 90;
  elements.pressurePointer.style.transform = `rotate(${pointerRotationAngle}deg)`;

  if (weather.pressure < 1009) {
    elements.pressureDesc.textContent = "Low pressure. Humid air masses.";
  } else if (weather.pressure > 1022) {
    elements.pressureDesc.textContent = "High pressure. Clear and dry.";
  } else {
    elements.pressureDesc.textContent = "Balanced sea-level pressure.";
  }

  // Last update timestamp
  elements.lastUpdatedTime.textContent = localDateObj.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit'
  });

  // 4. Hourly Forecast listing
  elements.hourlyScroll.innerHTML = '';
  weather.hourly.forEach(step => {
    const card = document.createElement('div');
    card.className = 'hourly-item';

    const iconName = getHourlyConditionIcon(step.condition);

    card.innerHTML = `
      <span class="hourly-time">${step.time}</span>
      <i data-lucide="${iconName}" class="hourly-icon"></i>
      <span class="hourly-temp">${convertTemp(step.temp)}°</span>
      <span class="hourly-rain-prob">
        <i data-lucide="droplet" class="small-icon"></i> ${step.rainProb}%
      </span>
    `;
    elements.hourlyScroll.appendChild(card);
  });

  // 5. Daily Forecast range sliders
  elements.dailyForecastList.innerHTML = '';
  let weekMin = 999;
  let weekMax = -999;
  weather.daily.forEach(d => {
    if (d.tempMin < weekMin) weekMin = d.tempMin;
    if (d.tempMax > weekMax) weekMax = d.tempMax;
  });

  const totalRange = weekMax - weekMin;

  weather.daily.forEach(day => {
    const card = document.createElement('div');
    card.className = 'daily-item';

    const iconName = getHourlyConditionIcon(day.condition);

    const barLeft = totalRange > 0 ? ((day.tempMin - weekMin) / totalRange) * 100 : 0;
    const barWidth = totalRange > 0 ? ((day.tempMax - day.tempMin) / totalRange) * 100 : 100;

    card.innerHTML = `
      <span class="daily-day">${day.day}</span>
      <div class="daily-icon-box">
        <i data-lucide="${iconName}"></i>
      </div>
      <span class="daily-desc-box">${day.description}</span>
      <div class="daily-temp-bar-box">
        <span class="min-t">${convertTemp(day.tempMin)}°</span>
        <div class="temp-slider-bar">
          <div class="temp-slider-fill" style="left: ${barLeft}%; width: ${barWidth}%"></div>
        </div>
        <span class="max-t">${convertTemp(day.tempMax)}°</span>
      </div>
    `;
    elements.dailyForecastList.appendChild(card);
  });

  // Hydrate Lucide graphics
  lucide.createIcons();

  // 6. Plotted Trend Canvas Chart
  updateWeatherChart(weather);
}

// Convert UTC times to local target timezone representations
function getLocalTimeFromOffset(offsetSeconds) {
  const currentUtcMs = Date.now();
  // Target time offset adjusted to browser date wrapper
  return new Date(currentUtcMs + (offsetSeconds * 1000) + (new Date().getTimezoneOffset() * 60 * 1000));
}

function formatTimeWithOffset(unixTimestamp, offsetSeconds) {
  const date = new Date((unixTimestamp + offsetSeconds + (new Date().getTimezoneOffset() * 60)) * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

function getHourlyConditionIcon(cond) {
  switch (cond) {
    case 'Clear': return 'sun';
    case 'Clouds': return 'cloud-sun';
    case 'Drizzle':
    case 'Rain': return 'cloud-rain';
    case 'Snow': return 'snowflake';
    case 'Thunderstorm': return 'cloud-lightning';
    case 'Atmosphere': return 'cloud-fog';
    default: return 'cloud';
  }
}

function getWeatherIconSVG(cond) {
  switch (cond) {
    case 'Clear':
      return `<svg class="animated-icon" viewBox="0 0 24 24" width="70" height="70" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5" fill="#f59e0b" stroke="#f59e0b"></circle>
                <line x1="12" y1="1" x2="12" y2="3" stroke="#f59e0b" stroke-width="2.5"></line>
                <line x1="12" y1="21" x2="12" y2="23" stroke="#f59e0b" stroke-width="2.5"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="#f59e0b" stroke-width="2.5"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="#f59e0b" stroke-width="2.5"></line>
                <line x1="1" y1="12" x2="3" y2="12" stroke="#f59e0b" stroke-width="2.5"></line>
                <line x1="21" y1="12" x2="23" y2="12" stroke="#f59e0b" stroke-width="2.5"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="#f59e0b" stroke-width="2.5"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="#f59e0b" stroke-width="2.5"></line>
              </svg>`;
    case 'Rain':
    case 'Drizzle':
      return `<svg class="animated-icon" viewBox="0 0 24 24" width="70" height="70" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 18a5 5 0 0 0-10 0" fill="#94a3b8" stroke="#94a3b8"></path>
                <path d="M12 2v2" stroke="#3b82f6"></path>
                <path d="m4.93 4.93 1.41 1.41" stroke="#3b82f6"></path>
                <path d="m19.07 4.93-1.41 1.41" stroke="#3b82f6"></path>
                <path d="M20 12h2" stroke="#3b82f6"></path>
                <path d="M2 12h2" stroke="#3b82f6"></path>
                <line x1="8" y1="19" x2="8" y2="21" stroke="#60a5fa" stroke-width="2.5"></line>
                <line x1="12" y1="20" x2="12" y2="22" stroke="#60a5fa" stroke-width="2.5"></line>
                <line x1="16" y1="19" x2="16" y2="21" stroke="#60a5fa" stroke-width="2.5"></line>
              </svg>`;
    case 'Snow':
      return `<svg class="animated-icon" viewBox="0 0 24 24" width="70" height="70" fill="none" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="12" y1="2" x2="12" y2="22"></line>
                <path d="m20 16-4-4 4-4"></path>
                <path d="m4 8 4 4-4 4"></path>
                <path d="m16 4-4 4-4-4"></path>
                <path d="m8 20 4-4 4 4"></path>
              </svg>`;
    case 'Thunderstorm':
      return `<svg class="animated-icon" viewBox="0 0 24 24" width="70" height="70" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 8.58" fill="#475569" stroke="#475569"></path>
                <polyline points="13 11 9 17 12 17 9 23" stroke="#fbbf24" stroke-width="2.5"></polyline>
              </svg>`;
    case 'Clouds':
      return `<svg class="animated-icon" viewBox="0 0 24 24" width="70" height="70" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v2" stroke="#fbbf24"></path>
                <path d="m4.93 4.93 1.41 1.41" stroke="#fbbf24"></path>
                <path d="M20 12h2" stroke="#fbbf24"></path>
                <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 8.58" fill="#e2e8f0" stroke="#cbd5e1"></path>
              </svg>`;
    default:
      return `<svg class="animated-icon" viewBox="0 0 24 24" width="70" height="70" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 8.58" fill="#94a3b8" stroke="#cbd5e1"></path>
              </svg>`;
  }
}

// --- Chart.js Layout Rendering ---
function updateWeatherChart(weather) {
  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  const isDark = elements.body.classList.contains('dark-mode');
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const labelColor = isDark ? '#9ca3af' : '#565e70';

  const labels = weather.hourly.map(step => step.time);
  const temperatures = weather.hourly.map(step => convertTemp(step.temp));
  const rainProbabilities = weather.hourly.map(step => step.rainProb);

  const ctx = document.getElementById('weather-trend-chart').getContext('2d');

  const tempGrad = ctx.createLinearGradient(0, 0, 0, 250);
  if (isDark) {
    tempGrad.addColorStop(0, 'rgba(96, 165, 250, 0.45)');
    tempGrad.addColorStop(1, 'rgba(96, 165, 250, 0.0)');
  } else {
    tempGrad.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    tempGrad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
  }

  state.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: `Temperature (${state.units === 'metric' ? '°C' : '°F'})`,
          data: temperatures,
          borderColor: isDark ? '#60a5fa' : '#3b82f6',
          borderWidth: 3,
          pointBackgroundColor: isDark ? '#60a5fa' : '#3b82f6',
          pointHoverRadius: 6,
          fill: true,
          backgroundColor: tempGrad,
          tension: 0.38,
          yAxisID: 'y'
        },
        {
          label: 'Rain Probability (%)',
          data: rainProbabilities,
          type: 'bar',
          backgroundColor: isDark ? 'rgba(249, 115, 22, 0.5)' : 'rgba(239, 68, 68, 0.4)',
          borderRadius: 4,
          maxBarThickness: 16,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: labelColor,
            font: { family: 'Outfit', size: 12 }
          }
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          titleColor: isDark ? '#fff' : '#000',
          bodyColor: isDark ? '#cbd5e1' : '#475569',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)'
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: labelColor, font: { family: 'Outfit' } }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: gridColor },
          ticks: { color: labelColor, font: { family: 'Outfit' } }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: labelColor,
            font: { family: 'Outfit' },
            callback: (val) => `${val}%`
          },
          min: 0,
          max: 100
        }
      }
    }
  });
}

// --- Skeleton Loading Overlay Triggers ---
function showSkeletons() {
  const cards = document.querySelectorAll('.parameter-card, .current-weather-card, .charts-card, .location-confidence-card');
  cards.forEach(card => card.classList.add('shimmer'));
  elements.hourlyScroll.classList.add('hidden');
  elements.dailyForecastList.classList.add('hidden');
}

function hideSkeletons() {
  const cards = document.querySelectorAll('.parameter-card, .current-weather-card, .charts-card, .location-confidence-card');
  cards.forEach(card => card.classList.remove('shimmer'));
  elements.hourlyScroll.classList.remove('hidden');
  elements.dailyForecastList.classList.remove('hidden');
}

// --- Weather background manager & Canvas Particles ---
function updateWeatherConditionBackground(cond) {
  elements.body.className = state.theme === 'dark' ? 'dark-mode' : '';

  const hour = getLocalTimeFromOffset(state.weatherData ? state.weatherData.utcOffsetSeconds : 0).getHours();
  const isNight = (hour < 6 || hour > 18);
  const timeSuffix = isNight ? '-night' : '-day';

  let mappedClass = 'clear-day';
  let canvasEngine = 'sunny';

  switch (cond) {
    case 'Clear':
      mappedClass = isNight ? 'clear-night' : 'clear-day';
      canvasEngine = isNight ? 'stars' : 'sunny';
      break;
    case 'Clouds':
      mappedClass = isNight ? 'clouds-night' : 'clouds-day';
      canvasEngine = 'clouds';
      break;
    case 'Rain':
    case 'Drizzle':
      mappedClass = isNight ? 'rain-night' : 'rain-day';
      canvasEngine = 'rain';
      break;
    case 'Snow':
      mappedClass = isNight ? 'snow-night' : 'snow-day';
      canvasEngine = 'snow';
      break;
    case 'Thunderstorm':
      mappedClass = isNight ? 'thunder-night' : 'thunder-day';
      canvasEngine = 'thunder';
      break;
    default:
      mappedClass = isNight ? 'clear-night' : 'clouds-day';
      canvasEngine = 'clouds';
  }

  elements.body.classList.add(mappedClass);
  initWeatherParticles(canvasEngine);
}

// --- Canvas Engine Animations ---
function initWeatherParticles(engineType) {
  const canvas = elements.canvas;
  const ctx = canvas.getContext('2d');

  if (state.particlesInterval) {
    cancelAnimationFrame(state.particlesInterval);
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const particles = [];

  class RainDrop {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * -canvas.height;
      this.vy = 8 + Math.random() * 8;
      this.vx = -1 - Math.random() * 2;
      this.len = 10 + Math.random() * 15;
      this.opacity = 0.15 + Math.random() * 0.3;
    }
    update() {
      this.y += this.vy;
      this.x += this.vx;
      if (this.y > canvas.height) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(174, 219, 255, ${this.opacity})`;
      ctx.lineWidth = 1.5;
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.vx, this.y + this.len);
      ctx.stroke();
    }
  }

  class SnowFlake {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * -canvas.height;
      this.vy = 1 + Math.random() * 2;
      this.vx = (Math.random() - 0.5) * 1.5;
      this.r = 1.5 + Math.random() * 3;
      this.opacity = 0.2 + Math.random() * 0.6;
      this.swing = Math.random() * 100;
    }
    update() {
      this.y += this.vy;
      this.swing += 0.02;
      this.x += this.vx + Math.sin(this.swing) * 0.5;
      if (this.y > canvas.height) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  class Star {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.r = 0.5 + Math.random() * 1.2;
      this.opacity = Math.random();
      this.delta = 0.008 + Math.random() * 0.012;
    }
    update() {
      this.opacity += this.delta;
      if (this.opacity > 1 || this.opacity < 0) this.delta = -this.delta;
    }
    draw() {
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  class SunRay {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.maxR = Math.max(canvas.width, canvas.height) * 0.55;
      this.swing = 0;
    }
    update() { this.swing += 0.0005; }
    draw() {
      const grad = ctx.createRadialGradient(
        canvas.width * 0.9, 0, 20,
        canvas.width * 0.9, 0, this.maxR
      );
      const beamIntensity = 0.08 + Math.sin(this.swing * 20) * 0.02;
      grad.addColorStop(0, `rgba(255, 218, 125, ${beamIntensity})`);
      grad.addColorStop(0.3, `rgba(255, 255, 255, ${beamIntensity * 0.5})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(canvas.width, 0, this.maxR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  class FloatingCloud {
    constructor() { this.reset(); }
    reset() {
      this.x = -200 - Math.random() * 400;
      this.y = Math.random() * (canvas.height * 0.4);
      this.speed = 0.2 + Math.random() * 0.3;
      this.size = 120 + Math.random() * 140;
      this.opacity = 0.03 + Math.random() * 0.05;
    }
    update() {
      this.x += this.speed;
      if (this.x > canvas.width + 300) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.arc(this.x + this.size * 0.6, this.y - this.size * 0.1, this.size * 0.8, 0, Math.PI * 2);
      ctx.arc(this.x - this.size * 0.6, this.y - this.size * 0.1, this.size * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (engineType === 'rain') {
    for (let i = 0; i < 75; i++) particles.push(new RainDrop());
  } else if (engineType === 'snow') {
    for (let i = 0; i < 50; i++) particles.push(new SnowFlake());
  } else if (engineType === 'stars') {
    for (let i = 0; i < 80; i++) particles.push(new Star());
  } else if (engineType === 'sunny') {
    particles.push(new SunRay());
  } else if (engineType === 'clouds') {
    for (let i = 0; i < 8; i++) particles.push(new FloatingCloud());
  } else if (engineType === 'thunder') {
    for (let i = 0; i < 90; i++) particles.push(new RainDrop());
  }

  let lightningCooldown = 0;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (engineType === 'thunder') {
      lightningCooldown--;
      if (lightningCooldown <= 0 && Math.random() > 0.99) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        lightningCooldown = 15 + Math.round(Math.random() * 30);
      }
    }

    particles.forEach(p => {
      p.update();
      p.draw();
    });

    state.particlesInterval = requestAnimationFrame(animate);
  }

  animate();
}

// --- Indian Cities Detector Helper ---
function isIndianCity(name) {
  const normalized = name.toLowerCase().trim();
  const indianCities = [
    'delhi', 'mumbai', 'bombay', 'kolkata', 'calcutta', 'chennai', 'madras',
    'bangalore', 'bengaluru', 'hyderabad', 'ahmedabad', 'pune', 'surat',
    'jaipur', 'lucknow', 'kanpur', 'nagpur', 'patna', 'indore', 'thane',
    'bhopal', 'visakhapatnam', 'vadodara', 'ghaziabad', 'ludhiana', 'agra',
    'nashik', 'ranchi', 'faridabad', 'meerut', 'rajkot', 'varanasi', 'srinagar',
    'coimbatore', 'jabalpur', 'madurai', 'guwahati', 'chandigarh', 'noida',
    'gurgaon', 'gurugram', 'kochi', 'cochin', 'trivandrum', 'thiruvananthapuram',
    'bhubaneswar', 'dehradun', 'shimla', 'amritsar', 'udaipur', 'jodhpur',
    'goa', 'panaji', 'kharadi', 'wakad', 'baner', 'hinjewadi', 'pimpri',
    'chinchwad', 'hadapsar', 'viman nagar', 'wagholi', 'shivajinagar',
    'koregaon park', 'india'
  ];
  return indianCities.some(city => normalized.includes(city)) || normalized.endsWith(', in') || normalized.endsWith(', india');
}

// --- Static Fallback Mocks for Offline / API Limit Safety ---
function getMockTempForCity(name) {
  if (isIndianCity(name)) {
    const normalized = name.toLowerCase();
    if (normalized.includes('delhi')) return 41;
    if (normalized.includes('mumbai') || normalized.includes('bombay')) return 31;
    if (normalized.includes('bangalore') || normalized.includes('bengaluru')) return 26;
    if (normalized.includes('chennai') || normalized.includes('madras')) return 36;
    if (normalized.includes('kolkata') || normalized.includes('calcutta')) return 33;
    if (normalized.includes('srinagar')) return 22;
    if (normalized.includes('shimla')) return 19;
    if (normalized.includes('kharadi') || normalized.includes('pune')) return 34;

    const sum = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return 32 + (sum % 10);
  }
  const sum = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (sum % 22) + 8;
}

function getMockIconForCity(name) {
  const code = name.length % 5;
  const icons = isIndianCity(name)
    ? ['sun', 'cloud-sun', 'cloud-rain', 'cloud-lightning', 'cloud-sun']
    : ['sun', 'cloud-sun', 'cloud-rain', 'cloud-lightning', 'snowflake'];
  return icons[code];
}

function getStaticSuggestionsFallback(query) {
  const normalized = query.toLowerCase().trim();
  const db = [
    { name: "Kharadi", label: "Kharadi, Pune, Maharashtra, India", lat: 18.5519, lon: 73.9377 },
    { name: "Wakad", label: "Wakad, Pune, Maharashtra, India", lat: 18.5987, lon: 73.7479 },
    { name: "Baner", label: "Baner, Pune, Maharashtra, India", lat: 18.5590, lon: 73.7868 },
    { name: "Hinjewadi", label: "Hinjewadi, Pune, Maharashtra, India", lat: 18.5913, lon: 73.7386 },
    { name: "Pimpri", label: "Pimpri, Pune, Maharashtra, India", lat: 18.6278, lon: 73.7997 },
    { name: "Chinchwad", label: "Chinchwad, Pune, Maharashtra, India", lat: 18.6298, lon: 73.7847 },
    { name: "Hadapsar", label: "Hadapsar, Pune, Maharashtra, India", lat: 18.5089, lon: 73.9260 },
    { name: "Viman Nagar", label: "Viman Nagar, Pune, Maharashtra, India", lat: 18.5679, lon: 73.9143 },
    { name: "Wagholi", label: "Wagholi, Pune, Maharashtra, India", lat: 18.5794, lon: 73.9859 },
    { name: "Shivajinagar", label: "Shivajinagar, Pune, Maharashtra, India", lat: 18.5310, lon: 73.8442 },
    { name: "Koregaon Park", label: "Koregaon Park, Pune, Maharashtra, India", lat: 18.5362, lon: 73.8940 }
  ];
  return db.filter(item => item.label.toLowerCase().includes(normalized));
}

function generateStaticMockGeocode(query) {
  // Try static matchers for Pune list
  const match = getStaticSuggestionsFallback(query)[0];
  if (match) {
    return {
      name: match.label,
      lat: match.lat,
      lon: match.lon,
      level: 'Locality',
      confidence: 99,
      provider: 'Static Resolution Cache'
    };
  }

  // Generic fallback resolver
  const sum = query.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const lat = 15 + (sum % 20) + (sum % 1000 / 1000);
  const lon = 70 + (sum % 20) + (sum % 1000 / 1000);
  return {
    name: `${query}, Resolved Area, World`,
    lat: lat,
    lon: lon,
    level: 'Sub-Region',
    confidence: 65,
    provider: 'Local Approximation Engine'
  };
}

function generateStaticMockWeather(lat, lon) {
  const baseTemp = 15 + (Math.round(lat + lon) % 20);
  const isIndia = (lat > 8 && lat < 36 && lon > 68 && lon < 97);

  const daily = [];
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayIndex = new Date().getDay();
  for (let i = 0; i < 5; i++) {
    daily.push({
      day: weekdays[(todayIndex + i) % 7],
      tempMin: baseTemp - 4 + i,
      tempMax: baseTemp + 4 + i,
      condition: isIndia ? 'Clouds' : 'Clear',
      description: isIndia ? 'broken clouds' : 'clear sky'
    });
  }

  const hourly = [];
  for (let i = 0; i < 8; i++) {
    const dispHour = (new Date().getHours() + i * 3) % 12 || 12;
    const period = (new Date().getHours() + i * 3) >= 12 ? 'PM' : 'AM';
    hourly.push({
      time: `${dispHour} ${period}`,
      temp: baseTemp + Math.sin(i) * 3,
      condition: 'Clear',
      description: 'clear sky',
      rainProb: Math.round(Math.abs(Math.sin(i)) * 40)
    });
  }

  return {
    temp: baseTemp,
    tempMax: baseTemp + 5,
    tempMin: baseTemp - 5,
    condition: isIndia ? 'Clouds' : 'Clear',
    description: isIndia ? 'broken clouds' : 'clear sky',
    feelsLike: baseTemp + 1,
    humidity: 65,
    windSpeed: 3.5,
    windDeg: 140,
    windGust: 5.2,
    pressure: 1012,
    visibility: 10,
    clouds: 20,
    sunrise: Math.round(new Date().setHours(5, 30, 0, 0) / 1000),
    sunset: Math.round(new Date().setHours(19, 0, 0, 0) / 1000),
    uvIndex: 5,
    timezoneName: "GMT",
    utcOffsetSeconds: 0,
    daily: daily,
    hourly: hourly
  };
}

function assembleOpenWeatherMapResponse(current, forecast) {
  // Map OpenWeather to unified format
  const hourly = forecast.list.slice(0, 8).map(item => {
    const timeObj = new Date(item.dt * 1000);
    return {
      time: timeObj.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
      temp: item.main.temp,
      condition: item.weather[0].main,
      description: item.weather[0].description,
      rainProb: Math.round((item.pop || 0) * 100)
    };
  });

  const dailyMap = {};
  forecast.list.forEach(item => {
    const dateStr = item.dt_txt.split(' ')[0];
    if (!dailyMap[dateStr]) dailyMap[dateStr] = [];
    dailyMap[dateStr].push(item);
  });

  const daily = Object.keys(dailyMap).slice(0, 5).map(dateStr => {
    const list = dailyMap[dateStr];
    let tMax = -999;
    let tMin = 999;
    list.forEach(step => {
      if (step.main.temp_max > tMax) tMax = step.main.temp_max;
      if (step.main.temp_min < tMin) tMin = step.main.temp_min;
    });
    const dayName = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    return {
      day: dayName,
      tempMin: tMin,
      tempMax: tMax,
      condition: list[0].weather[0].main,
      description: list[0].weather[0].description
    };
  });

  return {
    temp: current.main.temp,
    tempMax: current.main.temp_max,
    tempMin: current.main.temp_min,
    condition: current.weather[0].main,
    description: current.weather[0].description,
    feelsLike: current.main.feels_like,
    humidity: current.main.humidity,
    windSpeed: current.wind.speed,
    windDeg: current.wind.deg || 0,
    windGust: current.wind.gust || current.wind.speed,
    pressure: current.main.pressure,
    visibility: (current.visibility || 10000) / 1000,
    clouds: current.clouds ? current.clouds.all : 0,
    sunrise: current.sys.sunrise,
    sunset: current.sys.sunset,
    uvIndex: 6,
    timezoneName: "UTC",
    utcOffsetSeconds: current.timezone || 0,
    daily: daily,
    hourly: hourly
  };
}

// --- PWA Service Worker Registration & Prompts ---
let deferredPrompt;
function initPWA() {
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Aethera service worker registered successfully', reg.scope))
      .catch(err => console.warn('Service worker registration failed:', err));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    elements.pwaBanner.classList.remove('hidden');
    elements.pwaBanner.classList.add('active');
  });

  elements.pwaInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      elements.pwaBanner.classList.add('hidden');
      elements.pwaBanner.classList.remove('active');
    }
  });

  elements.pwaDismiss.addEventListener('click', () => {
    elements.pwaBanner.classList.add('hidden');
    elements.pwaBanner.classList.remove('active');
  });
}

function updateOnlineStatus() {
  if (navigator.onLine) {
    elements.offlineBanner.classList.remove('active');
  } else {
    elements.offlineBanner.classList.add('active');
  }
}

// --- Back to Top button scroll bindings ---
window.addEventListener('scroll', () => {
  if (window.scrollY > 400) {
    elements.backToTop.classList.add('active');
  } else {
    elements.backToTop.classList.remove('active');
  }
});

elements.backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
