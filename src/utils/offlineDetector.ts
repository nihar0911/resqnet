// ══════════════════════════════════════════════════════════════════
// ResqNet AI — Local Rules-Based Detection Engine
// Runs 100% in-browser. Zero network dependencies.
// ══════════════════════════════════════════════════════════════════

export interface CachedWeatherData {
  temp: number;        // °C
  humidity: number;    // %
  windSpeed: number;   // km/h
  description: string;
  aqi: number;         // PM2.5 AQI index
}

export interface DetectionResult {
  type: string;
  severity: number;      // 1-10
  confidence: number;    // 0-1
  message: string;
  suggestedAction: string;
  ruleId: string;
}

export interface IncidentPattern {
  id: string;
  location: [number, number];
  timestamp: number;  // ms epoch
  type: string;
}

export interface ShelterData {
  id: string;
  name: string;
  capacity: number;
  occupants: number;
}

export type ThreatLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface OfflineAssessment {
  threatLevel: ThreatLevel;
  summary: string;
  detections: DetectionResult[];
  timestamp: number;
  isOffline: boolean;
}

export interface OfflineAssessmentInput {
  weather: CachedWeatherData | null;
  incidents: IncidentPattern[];
  shelters: ShelterData[];
  isOffline: boolean;
  offlineDurationSec: number;
  stateName: string;
}

// ── Haversine distance (km) ─────────────────────────────────────
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Rules Engine ────────────────────────────────────────────────
export class RuleBasedDetector {

  // ── Weather threshold analysis ──────────────────────────────
  analyzeWeather(data: CachedWeatherData): DetectionResult[] {
    const results: DetectionResult[] = [];

    // Cyclone detection
    if (data.windSpeed > 120) {
      results.push({
        type: 'cyclone', severity: 10, confidence: 0.92,
        message: `CRITICAL CYCLONE: Wind speed ${data.windSpeed.toFixed(1)} km/h exceeds 120 km/h threshold. Category 3+ storm conditions.`,
        suggestedAction: 'Evacuate coastal zones immediately. Activate all emergency shelters. Deploy NDRF teams.',
        ruleId: 'WIND_CYCLONE_CRIT'
      });
    } else if (data.windSpeed > 80) {
      results.push({
        type: 'cyclone', severity: 7, confidence: 0.78,
        message: `CYCLONE WARNING: Wind speed ${data.windSpeed.toFixed(1)} km/h exceeds 80 km/h threshold. Storm conditions developing.`,
        suggestedAction: 'Issue pre-evacuation advisory. Secure loose infrastructure. Stage rescue assets.',
        ruleId: 'WIND_CYCLONE_WARN'
      });
    }

    // Heatwave detection
    if (data.temp > 48) {
      results.push({
        type: 'heatwave', severity: 9, confidence: 0.95,
        message: `EXTREME HEATWAVE: Temperature ${data.temp.toFixed(1)}°C exceeds 48°C. Life-threatening conditions.`,
        suggestedAction: 'Activate cooling shelters. Suspend outdoor activity. Deploy medical teams for heat stroke.',
        ruleId: 'TEMP_HEAT_CRIT'
      });
    } else if (data.temp > 45) {
      results.push({
        type: 'heatwave', severity: 7, confidence: 0.85,
        message: `HEATWAVE ALERT: Temperature ${data.temp.toFixed(1)}°C exceeds 45°C. High risk for vulnerable populations.`,
        suggestedAction: 'Open public cooling centers. Distribute water supplies. Issue heat advisory.',
        ruleId: 'TEMP_HEAT_WARN'
      });
    }

    // Flood detection
    if (data.humidity > 95) {
      results.push({
        type: 'flood', severity: 8, confidence: 0.82,
        message: `FLASH FLOOD CRITICAL: Humidity at ${data.humidity}% with saturated conditions. Immediate flood risk.`,
        suggestedAction: 'Activate flood barriers. Evacuate low-lying areas. Deploy boat rescue teams.',
        ruleId: 'HUMID_FLOOD_CRIT'
      });
    } else if (data.humidity > 90 && data.description.toLowerCase().includes('rain')) {
      results.push({
        type: 'flood', severity: 6, confidence: 0.7,
        message: `FLOOD RISK: Humidity ${data.humidity}% with active rainfall. Urban waterlogging probable.`,
        suggestedAction: 'Monitor drainage systems. Pre-position pumps. Alert low-lying residents.',
        ruleId: 'HUMID_FLOOD_WARN'
      });
    }

    // Air quality / chemical spill detection
    if (data.aqi > 400) {
      results.push({
        type: 'chemical_spill', severity: 9, confidence: 0.75,
        message: `HAZARDOUS AIR QUALITY: AQI ${data.aqi} exceeds 400. Toxic exposure risk. Possible industrial leak.`,
        suggestedAction: 'Issue shelter-in-place order. Distribute N95 masks. Deploy hazmat assessment teams.',
        ruleId: 'AQI_HAZARD_CRIT'
      });
    } else if (data.aqi > 200) {
      results.push({
        type: 'chemical_spill', severity: 6, confidence: 0.6,
        message: `AIR QUALITY ALERT: AQI ${data.aqi} exceeds 200. Unhealthy for all groups.`,
        suggestedAction: 'Advise indoor shelter. Cancel outdoor events. Monitor industrial zones.',
        ruleId: 'AQI_HAZARD_WARN'
      });
    }

    return results;
  }

  // ── SOS pattern clustering analysis ─────────────────────────
  analyzePatterns(incidents: IncidentPattern[]): DetectionResult[] {
    const results: DetectionResult[] = [];
    const now = Date.now();
    const recentWindow = 10 * 60 * 1000; // 10 minutes
    const clusterRadiusKm = 5;

    const recent = incidents.filter(i => now - i.timestamp < recentWindow);

    // For each incident, count how many others are within 5km
    const visited = new Set<string>();
    for (const incident of recent) {
      if (visited.has(incident.id)) continue;
      const cluster = recent.filter(
        other => haversineKm(incident.location, other.location) <= clusterRadiusKm
      );
      if (cluster.length >= 3) {
        cluster.forEach(c => visited.add(c.id));
        results.push({
          type: 'sos_cluster',
          severity: Math.min(10, 5 + cluster.length),
          confidence: 0.88,
          message: `SOS CLUSTER DETECTED: ${cluster.length} distress signals within ${clusterRadiusKm}km radius in last 10 minutes. Mass-casualty event probable.`,
          suggestedAction: `Escalate to NDRF. Deploy multi-team response to coordinates [${incident.location[0].toFixed(4)}, ${incident.location[1].toFixed(4)}].`,
          ruleId: 'PATTERN_SOS_CLUSTER'
        });
      }
    }

    return results;
  }

  // ── Shelter stress analysis ─────────────────────────────────
  analyzeShelterStress(shelters: ShelterData[]): DetectionResult[] {
    const results: DetectionResult[] = [];

    for (const shelter of shelters) {
      const occupancyPct = (shelter.occupants / shelter.capacity) * 100;

      if (occupancyPct >= 100) {
        results.push({
          type: 'shelter_overflow',
          severity: 8,
          confidence: 1.0,
          message: `SHELTER OVERFLOW: "${shelter.name}" at ${occupancyPct.toFixed(0)}% capacity (${shelter.occupants}/${shelter.capacity}). Turning away civilians.`,
          suggestedAction: 'Activate overflow facility. Redirect incoming evacuees. Request additional supplies.',
          ruleId: 'SHELTER_OVERFLOW_CRIT'
        });
      } else if (occupancyPct >= 90) {
        results.push({
          type: 'shelter_overflow',
          severity: 5,
          confidence: 0.95,
          message: `SHELTER STRESS: "${shelter.name}" at ${occupancyPct.toFixed(0)}% capacity. Approaching limits.`,
          suggestedAction: 'Prepare overflow zones. Redirect non-critical arrivals to alternate shelters.',
          ruleId: 'SHELTER_OVERFLOW_WARN'
        });
      }
    }

    return results;
  }

  // ── Full offline assessment ─────────────────────────────────
  getOfflineAssessment(input: OfflineAssessmentInput): OfflineAssessment {
    const allDetections: DetectionResult[] = [];

    if (input.weather) {
      allDetections.push(...this.analyzeWeather(input.weather));
    }
    allDetections.push(...this.analyzePatterns(input.incidents));
    allDetections.push(...this.analyzeShelterStress(input.shelters));

    // Determine overall threat level
    const maxSeverity = allDetections.length > 0
      ? Math.max(...allDetections.map(d => d.severity))
      : 0;

    let threatLevel: ThreatLevel = 'GREEN';
    if (maxSeverity >= 8) threatLevel = 'RED';
    else if (maxSeverity >= 6) threatLevel = 'ORANGE';
    else if (maxSeverity >= 4) threatLevel = 'YELLOW';

    // Generate military-style briefing
    const timestamp = new Date().toLocaleTimeString();
    const lines: string[] = [];

    lines.push(`══ RESQNET LOCAL DETECTION ENGINE ══`);
    lines.push(`SECTOR: ${input.stateName}`);
    lines.push(`TIMESTAMP: ${timestamp}`);
    lines.push(`MODE: ${input.isOffline ? 'OFFLINE — LOCAL RULES ONLY' : 'ONLINE — HYBRID DETECTION'}`);

    if (input.isOffline && input.offlineDurationSec > 0) {
      const mins = Math.floor(input.offlineDurationSec / 60);
      lines.push(`OFFLINE DURATION: ${mins}m ${Math.floor(input.offlineDurationSec % 60)}s`);
    }

    lines.push(`THREAT LEVEL: ${threatLevel}`);
    lines.push(`ACTIVE DETECTIONS: ${allDetections.length}`);
    lines.push('');

    if (input.weather) {
      lines.push('── ENVIRONMENTAL TELEMETRY ──');
      lines.push(`  Temperature: ${input.weather.temp.toFixed(1)}°C`);
      lines.push(`  Humidity:    ${input.weather.humidity}%`);
      lines.push(`  Wind Speed:  ${input.weather.windSpeed.toFixed(1)} km/h`);
      lines.push(`  AQI:         ${input.weather.aqi}`);
      lines.push(`  Conditions:  ${input.weather.description}`);
      lines.push('');
    } else {
      lines.push('── ENVIRONMENTAL TELEMETRY ──');
      lines.push('  ⚠ NO CACHED WEATHER DATA AVAILABLE');
      lines.push('  Detection limited to pattern & shelter analysis.');
      lines.push('');
    }

    if (allDetections.length > 0) {
      lines.push('── ACTIVE THREATS ──');
      allDetections.forEach((d, i) => {
        lines.push(`  [${i + 1}] ${d.message}`);
        lines.push(`      Severity: ${d.severity}/10 | Confidence: ${(d.confidence * 100).toFixed(0)}%`);
        lines.push(`      Action: ${d.suggestedAction}`);
        lines.push('');
      });
    } else {
      lines.push('── STATUS ──');
      lines.push('  All detection rules within normal parameters.');
      lines.push('  No immediate threats identified in current telemetry window.');
      lines.push('');
    }

    lines.push(`── END BRIEFING ══`);

    return {
      threatLevel,
      summary: lines.join('\n'),
      detections: allDetections,
      timestamp: Date.now(),
      isOffline: input.isOffline
    };
  }
}
