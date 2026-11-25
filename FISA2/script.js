"use strict";

/*
  WeatherWise uses one JavaScript file in two contexts:

  1. Service worker:
     Caches the local application pages and files.

  2. Browser:
     Handles searches, weather displays, settings and forms.
*/

if (typeof document === "undefined") {
  /* =====================================================
     SERVICE WORKER
     ===================================================== */

  const CACHE_NAME = "weatherwise-shell-v3";

  const APP_FILES = [
    "./index.html",
    "./weather.html",
    "./settings.html",
    "./about.html",
    "./style.css",
    "./script.js"
  ];

  const APP_URLS = new Set(
    APP_FILES.map(file => new URL(file, self.location.href).href)
  );

  self.addEventListener("install", event => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => cache.addAll(APP_FILES))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener("activate", event => {
    event.waitUntil(
      caches.keys()
        .then(names => Promise.all(
          names
            .filter(name =>
              name.startsWith("weatherwise-shell-") &&
              name !== CACHE_NAME
            )
            .map(name => caches.delete(name))
        ))
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);

    if (
      request.method !== "GET" ||
      url.origin !== self.location.origin
    ) {
      return;
    }

    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request).catch(async () => {
          const cache = await caches.open(CACHE_NAME);

          const savedPage = await cache.match(request, {
            ignoreSearch: true
          });

          return savedPage ||
            await cache.match("./index.html") ||
            new Response(
              "WeatherWise is unavailable offline.",
              {
                status: 503,
                headers: {
                  "Content-Type": "text/plain"
                }
              }
            );
        })
      );

      return;
    }

    if (APP_URLS.has(url.href)) {
      event.respondWith(
        caches.match(request)
          .then(cached => cached || fetch(request))
      );
    }
  });
} else {
  /* =====================================================
     BROWSER APPLICATION
     ===================================================== */

  const SETTINGS_KEY = "weatherwise-settings-v1";
  const WEATHER_KEY = "weatherwise-weather-v1";
  const API_KEY = "weatherwise-api-key";

  const DEFAULT_SETTINGS = {
    units: "metric",
    theme: "light",
    showHumidity: true,
    showWind: true,
    showPressure: true,
    enableAlerts: false,
    alertThreshold: 30
  };

  let settings = loadSettings();
  let weather = readJSON(WEATHER_KEY, null);
  let freshThisPage = false;

  document.documentElement.dataset.theme = settings.theme;

  document.addEventListener("DOMContentLoaded", () => {
    updateConnection();
    setupSearch();
    setupSettings();
    setupApiKey();
    setupComments();
    setupRefresh();
    renderWeather();
    registerOfflineSupport();

    window.addEventListener("online", updateConnection);

    window.addEventListener("offline", () => {
      freshThisPage = false;
      updateConnection();
      renderWeather();
    });
  });

  /* =====================================================
     GENERAL HELPERS
     ===================================================== */

  function $(selector) {
    return document.querySelector(selector);
  }

  function node(tag, text, className) {
    const element = document.createElement(tag);

    if (text !== undefined) {
      element.textContent = text;
    }

    if (className) {
      element.className = className;
    }

    return element;
  }

  function message(selector, text, isError = false) {
    const element = $(selector);

    if (!element) return;

    element.textContent = text;
    element.classList.toggle("error", isError);
  }

  function readJSON(key, fallback) {
    try {
      const stored = localStorage.getItem(key);

      return stored ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function loadSettings() {
    const stored = readJSON(SETTINGS_KEY, {});

    const result = {
      ...DEFAULT_SETTINGS,
      ...(stored && typeof stored === "object" ? stored : {})
    };

    result.units =
      result.units === "imperial" ? "imperial" : "metric";

    result.theme =
      result.theme === "dark" ? "dark" : "light";

    const threshold = Number(result.alertThreshold);

    result.alertThreshold =
      Number.isFinite(threshold) &&
      threshold >= -80 &&
      threshold <= 65
        ? threshold
        : 30;

    return result;
  }

  function getApiKey() {
    try {
      return sessionStorage.getItem(API_KEY) || "";
    } catch {
      return "";
    }
  }

  function updateConnection() {
    message(
      "#connection-status",
      navigator.onLine
        ? "Network connection detected. Refresh weather for the latest available data."
        : "You are offline. Only previously saved weather is available."
    );
  }

  /* =====================================================
     WEATHER FORMATTING AND EMOJIS
     ===================================================== */

  function temperature(celsius) {
    if (celsius === undefined || celsius === null) {
      return "Unavailable";
    }

    const value = Number(celsius);

    if (!Number.isFinite(value)) {
      return "Unavailable";
    }

    if (settings.units === "imperial") {
      return `${Math.round(value * 9 / 5 + 32)}°F`;
    }

    return `${Math.round(value)}°C`;
  }

  function windSpeed(metresPerSecond) {
    if (metresPerSecond === undefined || metresPerSecond === null) {
      return "Unavailable";
    }

    const value = Number(metresPerSecond);

    if (!Number.isFinite(value)) {
      return "Unavailable";
    }

    return settings.units === "imperial"
      ? `${(value * 2.23694).toFixed(1)} mph`
      : `${value.toFixed(1)} m/s`;
  }

  function locationTime(unixSeconds, offsetSeconds = 0) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC"
    }).format(
      new Date(
        (Number(unixSeconds) + Number(offsetSeconds)) * 1000
      )
    );
  }

  function weatherEmoji(condition = {}) {
    const id = Number(condition.id);
    const isNight = String(condition.icon || "").endsWith("n");

    if (id >= 200 && id < 300) return "⛈️";
    if (id >= 300 && id < 400) return "🌦️";
    if (id >= 500 && id < 600) return "🌧️";
    if (id >= 600 && id < 700) return "❄️";
    if (id >= 700 && id < 800) return "🌫️";

    if (id === 800) {
      return isNight ? "🌙" : "☀️";
    }

    if (id === 801) {
      return isNight ? "☁️" : "🌤️";
    }

    if (id === 802) return "⛅";
    if (id === 803 || id === 804) return "☁️";

    return "🌡️";
  }

  function createWeatherEmoji(
    condition,
    className = "weather-emoji"
  ) {
    const icon = node(
      "span",
      weatherEmoji(condition),
      className
    );

    icon.setAttribute("aria-hidden", "true");

    return icon;
  }

  function addMetric(container, label, value) {
    const group = node("div", undefined, "metric");

    group.append(
      node("dt", label),
      node("dd", value)
    );

    container.append(group);
  }

  /* =====================================================
     OPENWEATHER REQUESTS
     ===================================================== */

  async function requestApi(path, parameters = {}) {
    const key = getApiKey();

    if (!key) {
      throw new Error(
        "Add your OpenWeather API key on the Settings page first."
      );
    }

    const url = new URL(
      path,
      "https://api.openweathermap.org"
    );

    Object.entries({
      ...parameters,
      appid: key
    }).forEach(([name, value]) => {
      url.searchParams.set(name, value);
    });

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer"
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            "The API key was rejected. Check your key and account activation."
          );
        }

        if (response.status === 429) {
          throw new Error(
            "The API request limit has been reached. Try again later."
          );
        }

        if (response.status === 404) {
          throw new Error(
            "Weather data could not be found."
          );
        }

        throw new Error(
          `The weather service returned an error (${response.status}).`
        );
      }

      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(
          "The request took too long. Please try again."
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          "Unable to reach OpenWeather. Check your connection."
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchWeather(location) {
    const parameters = {
      lat: location.lat,
      lon: location.lon,
      units: "metric"
    };

    const [current, forecast] = await Promise.all([
      requestApi("/data/2.5/weather", parameters),
      requestApi("/data/2.5/forecast", parameters)
    ]);

    if (
      !current.main ||
      !Array.isArray(current.weather) ||
      !Array.isArray(forecast.list)
    ) {
      throw new Error(
        "The weather service returned incomplete information."
      );
    }

    weather = {
      location: {
        name: location.name,
        state: location.state || "",
        country:
          location.country ||
          current.sys?.country ||
          "",
        lat: location.lat,
        lon: location.lon
      },
      current,
      forecast,
      fetchedAt: Date.now()
    };

    freshThisPage = true;

    const saved = writeJSON(WEATHER_KEY, weather);

    renderWeather();

    return saved;
  }

  /* =====================================================
     LOCATION SEARCH
     ===================================================== */

  function setupSearch() {
    const form = $("#search-form");

    if (!form) return;

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const city = $("#city").value.trim();
      const results = $("#location-results");
      const button = $("#search-button");

      results.replaceChildren();

      if (city.length < 2) {
        message(
          "#search-status",
          "Enter a city name with at least two characters.",
          true
        );

        return;
      }

      button.disabled = true;

      message(
        "#search-status",
        "Looking for matching locations..."
      );

      try {
        const locations = await requestApi("/geo/1.0/direct", {
          q: city,
          limit: 5
        });

        if (
          !Array.isArray(locations) ||
          locations.length === 0
        ) {
          message(
            "#search-status",
            "No locations found. Check the spelling or add a country code.",
            true
          );

          return;
        }

        message(
          "#search-status",
          "Choose the correct location below."
        );

        locations.forEach(location => {
          const label = [
            location.name,
            location.state,
            location.country
          ].filter(Boolean).join(", ");

          const choice = node(
            "button",
            label,
            "secondary"
          );

          choice.type = "button";

          choice.addEventListener("click", () => {
            chooseLocation(location, results);
          });

          results.append(choice);
        });
      } catch (error) {
        message(
          "#search-status",
          error.message,
          true
        );
      } finally {
        button.disabled = false;
      }
    });
  }

  async function chooseLocation(location, container) {
    const choices = container.querySelectorAll("button");
    const searchButton = $("#search-button");
    const cityInput = $("#city");

    choices.forEach(button => {
      button.disabled = true;
    });

    if (searchButton) searchButton.disabled = true;
    if (cityInput) cityInput.disabled = true;

    message(
      "#search-status",
      `Loading weather for ${location.name}...`
    );

    try {
      const saved = await fetchWeather(location);

      container.replaceChildren();

      message(
        "#search-status",
        saved
          ? `Weather for ${location.name} has been updated and saved.`
          : `Weather for ${location.name} loaded, but browser storage was unavailable.`
      );
    } catch (error) {
      freshThisPage = false;
      renderWeather();

      message(
        "#search-status",
        error.message +
          (weather
            ? " Previously saved weather remains visible; check its location."
            : ""),
        true
      );

      choices.forEach(button => {
        button.disabled = false;
      });
    } finally {
      if (searchButton) searchButton.disabled = false;
      if (cityInput) cityInput.disabled = false;
    }
  }

  /* =====================================================
     CURRENT WEATHER DISPLAY
     ===================================================== */

  function renderWeather() {
    const targets = [
      $("#weather-summary"),
      $("#weather-details")
    ].filter(Boolean);

    const refreshButton = $("#refresh-weather");

    if (refreshButton) {
      refreshButton.disabled = !weather?.location;
    }

    targets.forEach(target => {
      target.replaceChildren();

      if (!weather?.current?.main || !weather?.location) {
        target.append(
          node(
            "p",
            "No weather saved yet. Search for a city on the Home page."
          )
        );

        const link = node(
          "a",
          "Go to location search"
        );

        link.href = "index.html";
        target.append(link);

        return;
      }

      const current = weather.current;
      const location = weather.location;

      const locationName = [
        location.name,
        location.state,
        location.country
      ].filter(Boolean).join(", ");

      target.append(
        node("h3", locationName)
      );

      const main = node(
        "div",
        undefined,
        "weather-main"
      );

      main.append(
        createWeatherEmoji(current.weather?.[0]),
        node(
          "p",
          temperature(current.main.temp),
          "temperature"
        ),
        node(
          "p",
          current.weather?.[0]?.description ||
            "Description unavailable",
          "description"
        )
      );

      target.append(main);

      target.append(
        node(
          "p",
          `Feels like ${temperature(current.main.feels_like)}`
        )
      );

      const metrics = node(
        "dl",
        undefined,
        "metrics"
      );

      if (settings.showHumidity) {
        addMetric(
          metrics,
          "Humidity",
          `${current.main.humidity}%`
        );
      }

      if (settings.showWind) {
        addMetric(
          metrics,
          "Wind speed",
          windSpeed(current.wind?.speed)
        );
      }

      if (settings.showPressure) {
        addMetric(
          metrics,
          "Pressure",
          `${current.main.pressure} hPa`
        );
      }

      target.append(metrics);

      const offset = current.timezone || 0;

      target.append(
        node(
          "p",
          `Observation time: ${
            locationTime(current.dt, offset)
          } (location time).`,
          "timestamp"
        )
      );

      target.append(
        node(
          "p",
          `Retrieved: ${
            new Date(weather.fetchedAt).toLocaleString()
          } (your device time).`,
          "timestamp"
        )
      );

      if (!freshThisPage || !navigator.onLine) {
        target.append(
          node(
            "p",
            "Saved weather — this is the last stored result, not a fresh live update.",
            "notice"
          )
        );
      }

      if (
        settings.enableAlerts &&
        current.main.temp >= settings.alertThreshold
      ) {
        const alertLabel =
          freshThisPage && navigator.onLine
            ? "Temperature alert"
            : "Saved-data temperature alert";

        target.append(
          node(
            "p",
            `${alertLabel}: ${
              temperature(current.main.temp)
            } meets or exceeds your threshold of ${
              temperature(settings.alertThreshold)
            }. This is not an official weather warning.`,
            "notice"
          )
        );
      }

      if (target.id === "weather-summary") {
        const link = node(
          "a",
          "View weather details",
          "button"
        );

        link.href = "weather.html";
        target.append(link);
      }
    });

    renderForecast();
  }

  /* =====================================================
     FIVE DAILY FORECAST CARDS
     ===================================================== */

  function forecastDateKey(unixSeconds, offsetSeconds) {
    return new Date(
      (Number(unixSeconds) + Number(offsetSeconds)) * 1000
    ).toISOString().slice(0, 10);
  }

  function forecastDateLabel(dateKey) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(
      new Date(`${dateKey}T12:00:00Z`)
    );
  }

  function representativeInterval(entries, offsetSeconds) {
    function distanceFromMidday(entry) {
      const localDate = new Date(
        (Number(entry.dt) + Number(offsetSeconds)) * 1000
      );

      return Math.abs(
        localDate.getUTCHours() +
        localDate.getUTCMinutes() / 60 -
        12
      );
    }

    return entries.reduce((closest, entry) => {
      return distanceFromMidday(entry) <
        distanceFromMidday(closest)
          ? entry
          : closest;
    });
  }

  function renderForecast() {
    const container = $("#forecast-list");

    if (!container) return;

    container.replaceChildren();

    /*
      These elements are created automatically if you still
      have the older weather.html forecast section.
    */
    let locationLabel = $("#forecast-location");

    if (!locationLabel) {
      locationLabel = node(
        "p",
        "",
        "forecast-location"
      );

      locationLabel.id = "forecast-location";
      container.before(locationLabel);
    }

    let savedNotice = $("#forecast-saved-notice");

    if (!savedNotice) {
      savedNotice = node("p", "", "notice");
      savedNotice.id = "forecast-saved-notice";
      container.before(savedNotice);
    }

    savedNotice.hidden = true;
    savedNotice.textContent = "";

    const heading = $("#forecast-heading");

    if (heading) {
      heading.textContent = "Five-day forecast";
    }

    const entries = weather?.forecast?.list;

    if (
      !weather?.location ||
      !Array.isArray(entries) ||
      entries.length === 0
    ) {
      locationLabel.textContent = "";

      container.append(
        node(
          "p",
          "Search for a city on the Home page to see its forecast."
        )
      );

      return;
    }

    const locationName = [
      weather.location.name,
      weather.location.state,
      weather.location.country
    ].filter(Boolean).join(", ");

    locationLabel.textContent =
      `Forecast for ${locationName}`;

    const offset = Number(
      weather.forecast.city?.timezone ??
      weather.current?.timezone ??
      0
    );

    const sortedEntries = [...entries]
      .filter(entry =>
        Number.isFinite(entry.dt) &&
        Number.isFinite(entry.main?.temp)
      )
      .sort((a, b) => a.dt - b.dt);

    const groupedDays = new Map();

    sortedEntries.forEach(entry => {
      const dateKey = forecastDateKey(
        entry.dt,
        offset
      );

      if (!groupedDays.has(dateKey)) {
        groupedDays.set(dateKey, []);
      }

      groupedDays.get(dateKey).push(entry);
    });

    /*
      Show up to five available calendar dates.
      The first date may be today.
      First/last days can contain only partial-day data.
    */
    const fiveDays = [...groupedDays.entries()]
      .slice(0, 5);

    if (fiveDays.length === 0) {
      container.append(
        node(
          "p",
          "No usable forecast information was returned. Try refreshing."
        )
      );

      return;
    }

    fiveDays.forEach(([dateKey, dayEntries]) => {
      const representative = representativeInterval(
        dayEntries,
        offset
      );

      const condition =
        representative.weather?.[0] || {};

      const minimums = dayEntries.map(entry =>
        Number(
          entry.main.temp_min ??
          entry.main.temp
        )
      );

      const maximums = dayEntries.map(entry =>
        Number(
          entry.main.temp_max ??
          entry.main.temp
        )
      );

      const low = Math.min(...minimums);
      const high = Math.max(...maximums);

      const card = node(
        "article",
        undefined,
        "forecast-card"
      );

      card.append(
        node("h3", forecastDateLabel(dateKey)),
        createWeatherEmoji(
          condition,
          "forecast-emoji"
        ),
        node(
          "p",
          condition.description ||
            "Description unavailable",
          "description"
        ),
        node(
          "p",
          `${temperature(low)} – ${temperature(high)}`,
          "forecast-temp"
        ),
        node(
          "p",
          "Low / high across available intervals",
          "hint"
        )
      );

      if (settings.showHumidity) {
        const values = dayEntries
          .map(entry => entry.main.humidity)
          .filter(Number.isFinite);

        if (values.length) {
          const average = Math.round(
            values.reduce((sum, value) => sum + value, 0) /
            values.length
          );

          card.append(
            node(
              "p",
              `Average humidity: ${average}%`
            )
          );
        }
      }

      if (settings.showWind) {
        const values = dayEntries
          .map(entry => entry.wind?.speed)
          .filter(Number.isFinite);

        if (values.length) {
          card.append(
            node(
              "p",
              `Highest forecast wind: ${
                windSpeed(Math.max(...values))
              }`
            )
          );
        }
      }

      if (settings.showPressure) {
        const values = dayEntries
          .map(entry => entry.main.pressure)
          .filter(Number.isFinite);

        if (values.length) {
          const average = Math.round(
            values.reduce((sum, value) => sum + value, 0) /
            values.length
          );

          card.append(
            node(
              "p",
              `Average pressure: ${average} hPa`
            )
          );
        }
      }

      const precipitationValues = dayEntries
        .map(entry => entry.pop)
        .filter(Number.isFinite);

      if (precipitationValues.length) {
        const highestChance = Math.round(
          Math.max(...precipitationValues) * 100
        );

        card.append(
          node(
            "p",
            `Highest interval precipitation chance: ${highestChance}%`
          )
        );
      }

      card.append(
        node(
          "p",
          `${dayEntries.length} available forecast intervals`,
          "hint"
        )
      );

      container.append(card);
    });

    if (!freshThisPage || !navigator.onLine) {
      savedNotice.hidden = false;

      savedNotice.textContent =
        "Saved forecast — these are previously retrieved predictions. " +
        "Some dates may already have passed. Refresh when online.";
    }
  }

  /* =====================================================
     REFRESH WEATHER
     ===================================================== */

  function setupRefresh() {
    const button = $("#refresh-weather");

    if (!button) return;

    button.addEventListener("click", async () => {
      if (!weather?.location) return;

      button.disabled = true;

      message(
        "#refresh-status",
        "Refreshing weather..."
      );

      try {
        const saved = await fetchWeather(
          weather.location
        );

        message(
          "#refresh-status",
          saved
            ? "Weather refreshed and saved."
            : "Weather refreshed, but browser storage was unavailable."
        );
      } catch (error) {
        freshThisPage = false;
        renderWeather();

        message(
          "#refresh-status",
          `${error.message} Previously saved data remains visible.`,
          true
        );
      } finally {
        button.disabled = false;
      }
    });
  }

  /* =====================================================
     DISPLAY AND ALERT SETTINGS
     ===================================================== */

  function setupSettings() {
    const form = $("#settings-form");

    if (form) {
      $("#units").value = settings.units;
      $("#theme").value = settings.theme;

      $("#show-humidity").checked =
        settings.showHumidity;

      $("#show-wind").checked =
        settings.showWind;

      $("#show-pressure").checked =
        settings.showPressure;

      $("#enable-alerts").checked =
        settings.enableAlerts;

      $("#alert-threshold").value =
        settings.alertThreshold;

      form.addEventListener("submit", event => {
        event.preventDefault();

        if (!form.reportValidity()) return;

        settings = {
          units: $("#units").value,
          theme: $("#theme").value,
          showHumidity: $("#show-humidity").checked,
          showWind: $("#show-wind").checked,
          showPressure: $("#show-pressure").checked,
          enableAlerts: $("#enable-alerts").checked,
          alertThreshold: Number(
            $("#alert-threshold").value
          )
        };

        document.documentElement.dataset.theme =
          settings.theme;

        const saved = writeJSON(
          SETTINGS_KEY,
          settings
        );

        message(
          "#settings-status",
          saved
            ? "Your preferences have been saved."
            : "Preferences applied for this page, but browser storage is unavailable.",
          !saved
        );
      });
    }

    $("#clear-weather")?.addEventListener("click", () => {
      try {
        localStorage.removeItem(WEATHER_KEY);

        weather = null;
        freshThisPage = false;

        renderWeather();

        message(
          "#storage-status",
          "Saved weather has been cleared."
        );
      } catch {
        message(
          "#storage-status",
          "Browser storage could not be accessed.",
          true
        );
      }
    });
  }

  /* =====================================================
     API KEY SETTINGS
     ===================================================== */

  function setupApiKey() {
    const form = $("#api-form");

    if (!form) return;

    if (getApiKey()) {
      message(
        "#api-status",
        "An API key is available for this tab's session."
      );
    }

    form.addEventListener("submit", event => {
      event.preventDefault();

      const key = $("#api-key").value.trim();

      if (!key) {
        message(
          "#api-status",
          "Enter an API key.",
          true
        );

        return;
      }

      try {
        sessionStorage.setItem(API_KEY, key);
        $("#api-key").value = "";

        message(
          "#api-status",
          "Key saved for this session. Return to Home to search. The key has not yet been verified."
        );
      } catch {
        message(
          "#api-status",
          "Session storage is blocked. Allow browser storage to use this demonstration.",
          true
        );
      }
    });

    $("#remove-key")?.addEventListener("click", () => {
      try {
        sessionStorage.removeItem(API_KEY);
        $("#api-key").value = "";

        message(
          "#api-status",
          "API key removed from this session."
        );
      } catch {
        message(
          "#api-status",
          "Unable to access session storage.",
          true
        );
      }
    });
  }

  /* =====================================================
     COMMENT FORM
     ===================================================== */

  function setupComments() {
    const form = $("#comment-form");

    if (!form) return;

    form.addEventListener("submit", event => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const name = $("#comment-name").value.trim();
      const comment = $("#comment-message").value.trim();

      if (name.length < 2 || comment.length < 5) {
        message(
          "#comment-status",
          "Enter a name of at least two characters and a comment of at least five characters.",
          true
        );

        return;
      }

      message(
        "#comment-status",
        `Thank you, ${name}. Your form is valid. ` +
        "This demonstration has not sent or stored your comment."
      );

      form.reset();
    });
  }

  /* =====================================================
     REGISTER OFFLINE SUPPORT
     ===================================================== */

  async function registerOfflineSupport() {
    if (
      !("serviceWorker" in navigator) ||
      !window.isSecureContext
    ) {
      message(
        "#offline-status",
        "Offline page caching requires a supported browser and HTTPS or localhost."
      );

      return;
    }

    try {
      await navigator.serviceWorker.register(
        "./script.js",
        {
          scope: "./",
          updateViaCache: "none"
        }
      );

      await navigator.serviceWorker.ready;

      message(
        "#offline-status",
        "Offline page support is ready. Your latest successfully saved weather can be viewed offline."
      );
    } catch {
      message(
        "#offline-status",
        "Offline page caching could not be installed. Check your server configuration."
      );
    }
  }
}