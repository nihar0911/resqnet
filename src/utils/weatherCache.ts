// ══════════════════════════════════════════════════════════════════
// ResqNet AI — Weather Data Cache for Offline Use
// Stores last-known weather in localStorage for offline fallback.
// ══════════════════════════════════════════════════════════════════

export interface WeatherDataPayload {
  temp: number;
  humidity: number;
  windSpeed: number;
  description: string;
  aqi: number;
}

export interface CachedEntry {
  lat: number;
  lon: number;
  data: WeatherDataPayload;
  timestamp: number;  // ms epoch
  city?: string;
}

const STORAGE_KEY = 'resqnet_weather_cache';
const FRESH_TTL = 30 * 60 * 1000;   // 30 minutes
const EXPIRE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function loadCache(): CachedEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCache(entries: CachedEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('[WeatherCache] Failed to save:', e);
  }
}

/** Round coords to 2 decimal places for matching */
function roundCoord(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Cache fresh weather data for a location */
export function cacheWeatherData(
  lat: number, lon: number, data: WeatherDataPayload, city?: string
): void {
  const entries = loadCache();
  const rLat = roundCoord(lat);
  const rLon = roundCoord(lon);

  // Remove existing entry for same location
  const filtered = entries.filter(
    e => !(roundCoord(e.lat) === rLat && roundCoord(e.lon) === rLon)
  );

  filtered.push({ lat, lon, data, timestamp: Date.now(), city });
  saveCache(filtered);
}

/** Get cached weather if still fresh (< 30 min old) */
export function getCachedWeather(lat: number, lon: number): CachedEntry | null {
  const entries = loadCache();
  const rLat = roundCoord(lat);
  const rLon = roundCoord(lon);
  const now = Date.now();

  const match = entries.find(
    e => roundCoord(e.lat) === rLat && roundCoord(e.lon) === rLon
      && (now - e.timestamp) < FRESH_TTL
  );
  return match ?? null;
}

/** Get last known weather regardless of freshness — used as offline fallback */
export function getLastKnownWeather(): CachedEntry | null {
  const entries = loadCache();
  if (entries.length === 0) return null;

  // Return the most recently cached entry
  return entries.reduce((latest, entry) =>
    entry.timestamp > latest.timestamp ? entry : latest
  );
}

/** Get cache age in seconds for a specific entry */
export function getCacheAge(entry: CachedEntry): number {
  return Math.floor((Date.now() - entry.timestamp) / 1000);
}

/** Check if a cached entry is still fresh */
export function isCacheFresh(entry: CachedEntry): boolean {
  return (Date.now() - entry.timestamp) < FRESH_TTL;
}

/** Remove entries older than 24 hours */
export function clearExpiredCache(): void {
  const entries = loadCache();
  const now = Date.now();
  const valid = entries.filter(e => (now - e.timestamp) < EXPIRE_TTL);
  saveCache(valid);
}

/** Get count of cached entries */
export function getCacheSize(): number {
  return loadCache().length;
}
