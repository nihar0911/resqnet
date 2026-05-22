import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ShieldCheck, ShieldAlert, Wifi, WifiOff, RefreshCw, Send,
  AlertTriangle, Thermometer, Wind, Droplets, Activity, Clock, Zap,
  ChevronDown, ChevronUp, Radio, CheckCircle2, XCircle
} from 'lucide-react';
import { RuleBasedDetector, type DetectionResult, type OfflineAssessment, type CachedWeatherData } from '../utils/offlineDetector';
import { getLastKnownWeather, cacheWeatherData, getCacheAge, isCacheFresh } from '../utils/weatherCache';
import { getQueuedMessages, flushQueue, getQueueLength } from '../utils/offlineQueue';
import { ConnectivityManager } from '../utils/connectivityManager';
import { useDisasterStore } from '../store/useDisasterStore';

const detector = new RuleBasedDetector();

export const OfflineDetectionPanel: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const {
    sosRequests, shelters, disasters, selectedCity, selectedCityCenter,
    triggerFlood, triggerEarthquake, triggerHeatwave, triggerBuildingCollapse,
    triggerWildfire, triggerCyclone, triggerTsunami, triggerLandslide,
    triggerChemicalSpill, addTimelineEvent
  } = useDisasterStore();

  const [autoDetect, setAutoDetect] = useState(true);
  const [connectStatus, setConnectStatus] = useState(ConnectivityManager.getMode());
  const [assessment, setAssessment] = useState<OfflineAssessment | null>(null);
  const [weatherData, setWeatherData] = useState<CachedWeatherData | null>(null);
  const [cacheAgeStr, setCacheAgeStr] = useState('No data');
  const [cacheFresh, setCacheFresh] = useState(false);
  const [queueCount, setQueueCount] = useState(getQueueLength());
  const [isFlushing, setIsFlushing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  const [scanLine, setScanLine] = useState(0);

  // Scanning animation
  useEffect(() => {
    const interval = setInterval(() => setScanLine(p => (p + 1) % 100), 50);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to connectivity changes
  useEffect(() => {
    const unsub = ConnectivityManager.onStatusChange(status => {
      setConnectStatus(status);
    });
    return unsub;
  }, []);

  // Load cached weather on mount
  const loadCachedWeather = useCallback(() => {
    const cached = getLastKnownWeather();
    if (cached) {
      setWeatherData(cached.data as CachedWeatherData);
      const ageSec = getCacheAge(cached);
      setCacheFresh(isCacheFresh(cached));
      if (ageSec < 60) setCacheAgeStr(`${ageSec}s ago`);
      else if (ageSec < 3600) setCacheAgeStr(`${Math.floor(ageSec / 60)}m ago`);
      else setCacheAgeStr(`${Math.floor(ageSec / 3600)}h ${Math.floor((ageSec % 3600) / 60)}m ago`);
    }
  }, []);

  useEffect(() => {
    loadCachedWeather();
    const interval = setInterval(loadCachedWeather, 10000);
    return () => clearInterval(interval);
  }, [loadCachedWeather]);

  // Refresh weather from backend
  const refreshWeather = async () => {
    setIsRefreshing(true);
    try {
      const [lat, lon] = selectedCityCenter;
      const [wRes, aqiRes] = await Promise.all([
        fetch(`http://localhost:5000/api/weather?lat=${lat}&lon=${lon}`),
        fetch(`http://localhost:5000/api/aqi?lat=${lat}&lon=${lon}`)
      ]);
      const wData = await wRes.json();
      const aqiData = await aqiRes.json();

      const payload: CachedWeatherData = {
        temp: wData.weather?.temp ?? 0,
        humidity: wData.weather?.humidity ?? 0,
        windSpeed: wData.weather?.windSpeed ?? 0,
        description: wData.weather?.description ?? 'Unknown',
        aqi: aqiData.aqi ?? 0
      };
      cacheWeatherData(lat, lon, payload, selectedCity);
      setWeatherData(payload);
      setCacheFresh(true);
      setCacheAgeStr('Just now');
      addTimelineEvent('Weather telemetry refreshed from live API.', 'system', 'low');
    } catch {
      addTimelineEvent('Weather refresh failed — using cached data.', 'system', 'medium');
    }
    setIsRefreshing(false);
  };

  // Run detection engine
  useEffect(() => {
    if (!autoDetect) return;

    const incidents = sosRequests.map(s => ({
      id: s.id,
      location: s.location,
      timestamp: new Date(s.timestamp).getTime() || Date.now(),
      type: s.type
    }));

    const shelterData = shelters.map(s => ({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      occupants: s.occupants
    }));

    const result = detector.getOfflineAssessment({
      weather: weatherData,
      incidents,
      shelters: shelterData,
      isOffline: connectStatus !== 'online',
      offlineDurationSec: ConnectivityManager.getOfflineDuration(),
      stateName: selectedCity
    });

    setAssessment(result);
  }, [autoDetect, weatherData, sosRequests, shelters, selectedCity, connectStatus, disasters]);

  // Queue count updater
  useEffect(() => {
    const interval = setInterval(() => setQueueCount(getQueueLength()), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFlush = async () => {
    setIsFlushing(true);
    const result = await flushQueue();
    setQueueCount(result.remaining);
    if (result.sent > 0) {
      addTimelineEvent(`SMS Queue flushed: ${result.sent} messages sent.`, 'system', 'low');
    }
    setIsFlushing(false);
  };

  // Deploy auto-alert from detection
  const deployDetection = (detection: DetectionResult) => {
    const typeMap: Record<string, (() => void) | undefined> = {
      cyclone: triggerFlood, // Closest available trigger
      heatwave: triggerHeatwave,
      flood: triggerFlood,
      chemical_spill: triggerChemicalSpill,
      wildfire: triggerWildfire,
      tsunami: triggerTsunami,
      landslide: triggerLandslide,
      building_collapse: triggerBuildingCollapse,
    };
    const trigger = typeMap[detection.type];
    if (trigger) {
      trigger();
      addTimelineEvent(
        `AUTO-DETECTION DEPLOYED: ${detection.message}`,
        'disaster', 'critical'
      );
    }
  };

  // Style helpers
  const panel = isDark
    ? 'bg-slate-900/60 border-slate-700/50 backdrop-blur-md'
    : 'bg-white/80 border-slate-200 backdrop-blur-md shadow-sm';
  const subPanel = isDark
    ? 'bg-slate-800/50 border-slate-700/40'
    : 'bg-slate-50/80 border-slate-200';
  const text1 = isDark ? 'text-slate-100' : 'text-slate-900';
  const text2 = isDark ? 'text-slate-400' : 'text-slate-500';
  const text3 = isDark ? 'text-slate-500' : 'text-slate-400';

  const statusColors = {
    online: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    offline: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-400' },
    degraded: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400' }
  };
  const sc = statusColors[connectStatus];

  const threatColors: Record<string, string> = {
    GREEN: isDark ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : 'text-emerald-700 bg-emerald-100 border-emerald-300',
    YELLOW: isDark ? 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' : 'text-yellow-700 bg-yellow-100 border-yellow-300',
    ORANGE: isDark ? 'text-orange-400 bg-orange-500/15 border-orange-500/30' : 'text-orange-700 bg-orange-100 border-orange-300',
    RED: isDark ? 'text-red-400 bg-red-500/15 border-red-500/30' : 'text-red-700 bg-red-100 border-red-300'
  };

  const rules = [
    { name: 'Cyclone Detection', icon: <Wind className="w-3.5 h-3.5" />, threshold: '> 80 km/h', current: weatherData ? `${weatherData.windSpeed.toFixed(1)} km/h` : 'N/A', status: weatherData ? (weatherData.windSpeed > 120 ? 'TRIGGERED' : weatherData.windSpeed > 80 ? 'WARNING' : 'PASS') : 'N/A' },
    { name: 'Flood Risk', icon: <Droplets className="w-3.5 h-3.5" />, threshold: '> 90%', current: weatherData ? `${weatherData.humidity}%` : 'N/A', status: weatherData ? (weatherData.humidity > 95 ? 'TRIGGERED' : weatherData.humidity > 90 ? 'WARNING' : 'PASS') : 'N/A' },
    { name: 'Heatwave Alert', icon: <Thermometer className="w-3.5 h-3.5" />, threshold: '> 45°C', current: weatherData ? `${weatherData.temp.toFixed(1)}°C` : 'N/A', status: weatherData ? (weatherData.temp > 48 ? 'TRIGGERED' : weatherData.temp > 45 ? 'WARNING' : 'PASS') : 'N/A' },
    { name: 'Air Quality Crisis', icon: <Activity className="w-3.5 h-3.5" />, threshold: '> 200 AQI', current: weatherData ? `${weatherData.aqi} AQI` : 'N/A', status: weatherData ? (weatherData.aqi > 400 ? 'TRIGGERED' : weatherData.aqi > 200 ? 'WARNING' : 'PASS') : 'N/A' },
    { name: 'Shelter Overflow', icon: <AlertTriangle className="w-3.5 h-3.5" />, threshold: '> 90%', current: `${shelters.filter(s => (s.occupants / s.capacity) > 0.9).length} stressed`, status: shelters.some(s => (s.occupants / s.capacity) >= 1) ? 'TRIGGERED' : shelters.some(s => (s.occupants / s.capacity) > 0.9) ? 'WARNING' : 'PASS' },
    { name: 'SOS Cluster', icon: <Radio className="w-3.5 h-3.5" />, threshold: '≥ 3 in 5km', current: `${sosRequests.filter(s => s.status !== 'rescued').length} active`, status: sosRequests.filter(s => s.status !== 'rescued').length >= 3 ? 'WARNING' : 'PASS' },
  ];

  const ruleStatusStyle = (status: string) => {
    if (status === 'TRIGGERED') return isDark ? 'text-red-400 bg-red-500/15' : 'text-red-600 bg-red-100';
    if (status === 'WARNING') return isDark ? 'text-amber-400 bg-amber-500/15' : 'text-amber-600 bg-amber-100';
    if (status === 'PASS') return isDark ? 'text-emerald-400 bg-emerald-500/15' : 'text-emerald-600 bg-emerald-100';
    return isDark ? 'text-slate-500 bg-slate-700/50' : 'text-slate-400 bg-slate-200';
  };

  return (
    <div className="w-full h-full overflow-y-auto pr-1 space-y-4 max-w-4xl mx-auto">
      {/* ── Header ──────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 ${panel} relative overflow-hidden`}>
        {/* Scan line animation */}
        <div
          className="absolute left-0 right-0 h-[1px] pointer-events-none opacity-20"
          style={{
            top: `${scanLine}%`,
            background: isDark
              ? 'linear-gradient(90deg, transparent, #38bdf8, transparent)'
              : 'linear-gradient(90deg, transparent, #2563eb, transparent)',
            transition: 'top 0.05s linear'
          }}
        />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isDark ? 'bg-sky-500/15' : 'bg-blue-100'}`}>
              <Shield className={`w-5 h-5 ${isDark ? 'text-sky-400' : 'text-blue-600'}`} />
            </div>
            <div>
              <h2 className={`text-base font-bold tracking-wide ${text1}`}>
                Local Detection Engine
              </h2>
              <p className={`text-[10px] font-mono uppercase tracking-widest ${text3}`}>
                Rule-Based Threat Analysis • {connectStatus === 'online' ? 'Hybrid' : 'Standalone'} Mode
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Status badge */}
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${sc.bg} ${sc.border} ${sc.text}`}>
              <span className={`w-2 h-2 rounded-full ${sc.dot} animate-pulse`} />
              <span className="uppercase">{connectStatus}</span>
              {connectStatus === 'online' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            </div>

            {/* Auto-detect toggle */}
            <button
              onClick={() => setAutoDetect(!autoDetect)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                autoDetect
                  ? isDark ? 'bg-sky-500/15 border-sky-500/30 text-sky-400' : 'bg-blue-100 border-blue-300 text-blue-700'
                  : isDark ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-400'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Auto-Detect {autoDetect ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Threat Level + Weather Cache (side by side) ──── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Threat Level */}
        <motion.div
          className={`rounded-xl border p-4 ${panel}`}
          animate={assessment?.threatLevel === 'RED' ? { borderColor: ['rgba(239,68,68,0.3)', 'rgba(239,68,68,0.7)', 'rgba(239,68,68,0.3)'] } : {}}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-semibold uppercase tracking-wide ${text2}`}>Threat Level</span>
            {assessment && (
              <span className={`px-3 py-1 rounded-full border text-xs font-bold ${threatColors[assessment.threatLevel]}`}>
                {assessment.threatLevel}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {assessment?.threatLevel === 'RED' ? (
              <ShieldAlert className="w-8 h-8 text-red-400 animate-pulse" />
            ) : assessment?.threatLevel === 'ORANGE' ? (
              <ShieldAlert className="w-8 h-8 text-orange-400" />
            ) : (
              <ShieldCheck className={`w-8 h-8 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
            )}
            <div>
              <p className={`text-sm font-semibold ${text1}`}>
                {assessment?.detections.length ?? 0} Active Detection{(assessment?.detections.length ?? 0) !== 1 ? 's' : ''}
              </p>
              <p className={`text-[10px] ${text3}`}>
                {assessment?.isOffline ? 'Operating on cached data' : 'Live data + local rules'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Weather Cache */}
        <div className={`rounded-xl border p-4 ${panel}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-semibold uppercase tracking-wide ${text2}`}>Weather Cache</span>
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] font-mono ${cacheFresh ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-amber-400' : 'text-amber-600')}`}>
                {cacheFresh ? '● FRESH' : '● STALE'} {cacheAgeStr}
              </span>
              <button
                onClick={refreshWeather}
                disabled={isRefreshing}
                className={`p-1.5 rounded-lg border transition-all ${isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'}`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          {weatherData ? (
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-lg p-2 border ${subPanel}`}>
                <div className={`text-[10px] ${text3}`}>TEMP</div>
                <div className={`text-sm font-mono font-bold ${text1}`}>{weatherData.temp.toFixed(1)}°C</div>
              </div>
              <div className={`rounded-lg p-2 border ${subPanel}`}>
                <div className={`text-[10px] ${text3}`}>HUMIDITY</div>
                <div className={`text-sm font-mono font-bold ${text1}`}>{weatherData.humidity}%</div>
              </div>
              <div className={`rounded-lg p-2 border ${subPanel}`}>
                <div className={`text-[10px] ${text3}`}>WIND</div>
                <div className={`text-sm font-mono font-bold ${text1}`}>{weatherData.windSpeed.toFixed(1)} km/h</div>
              </div>
              <div className={`rounded-lg p-2 border ${subPanel}`}>
                <div className={`text-[10px] ${text3}`}>AQI</div>
                <div className={`text-sm font-mono font-bold ${text1}`}>{weatherData.aqi}</div>
              </div>
            </div>
          ) : (
            <div className={`text-center py-4 text-xs ${text3}`}>
              No cached weather data. Click refresh to fetch.
            </div>
          )}
        </div>
      </div>

      {/* ── Active Rules Monitor ────────────────────────── */}
      <div className={`rounded-xl border ${panel}`}>
        <button
          onClick={() => setShowRules(!showRules)}
          className={`w-full flex items-center justify-between p-4`}
        >
          <span className={`text-xs font-semibold uppercase tracking-wide ${text2}`}>
            Detection Rules Monitor ({rules.filter(r => r.status !== 'PASS' && r.status !== 'N/A').length} alerts)
          </span>
          {showRules ? <ChevronUp className={`w-4 h-4 ${text3}`} /> : <ChevronDown className={`w-4 h-4 ${text3}`} />}
        </button>
        <AnimatePresence>
          {showRules && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-1.5">
                {rules.map((rule, i) => (
                  <div key={i} className={`flex items-center justify-between rounded-lg p-2.5 border ${subPanel}`}>
                    <div className="flex items-center space-x-2.5">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{rule.icon}</span>
                      <div>
                        <div className={`text-xs font-semibold ${text1}`}>{rule.name}</div>
                        <div className={`text-[10px] font-mono ${text3}`}>Threshold: {rule.threshold}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`text-xs font-mono font-semibold ${text1}`}>{rule.current}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ruleStatusStyle(rule.status)}`}>
                        {rule.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Detection Results ───────────────────────────── */}
      <AnimatePresence>
        {assessment && assessment.detections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`rounded-xl border p-4 ${isDark ? 'bg-red-950/20 border-red-500/30' : 'bg-red-50 border-red-200'}`}
          >
            <div className={`text-xs font-semibold uppercase tracking-wide mb-3 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
              ⚠ Active Threat Detections ({assessment.detections.length})
            </div>
            <div className="space-y-2">
              {assessment.detections.map((det, i) => (
                <div key={i} className={`rounded-lg border p-3 ${subPanel}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className={`text-xs font-semibold ${text1}`}>{det.message}</p>
                      <p className={`text-[10px] mt-1 ${text3}`}>📋 {det.suggestedAction}</p>
                    </div>
                    <button
                      onClick={() => deployDetection(det)}
                      className={`ml-3 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all whitespace-nowrap ${
                        isDark
                          ? 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25'
                          : 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      Deploy Alert
                    </button>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <div className={`h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500"
                          style={{ width: `${(det.severity / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono ${text2}`}>
                      Sev: {det.severity}/10
                    </span>
                    <span className={`text-[10px] font-mono ${text2}`}>
                      Conf: {(det.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Offline Assessment Briefing ──────────────────── */}
      {assessment && (
        <div className={`rounded-xl border p-4 ${panel}`}>
          <div className={`text-xs font-semibold uppercase tracking-wide mb-3 ${text2}`}>
            Assessment Briefing
          </div>
          <pre className={`text-[10px] font-mono leading-relaxed whitespace-pre-wrap p-3 rounded-lg border max-h-48 overflow-y-auto ${
            isDark ? 'bg-slate-950/80 border-slate-700 text-green-400' : 'bg-slate-900 border-slate-300 text-green-400'
          }`}>
            {assessment.summary}
          </pre>
        </div>
      )}

      {/* ── SMS Queue ───────────────────────────────────── */}
      <div className={`rounded-xl border ${panel}`}>
        <button
          onClick={() => setShowQueue(!showQueue)}
          className={`w-full flex items-center justify-between p-4`}
        >
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-semibold uppercase tracking-wide ${text2}`}>
              SMS Queue
            </span>
            {queueCount > 0 && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                {queueCount} pending
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {queueCount > 0 && connectStatus === 'online' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleFlush(); }}
                disabled={isFlushing}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                  isDark
                    ? 'bg-sky-500/15 border-sky-500/30 text-sky-400 hover:bg-sky-500/25'
                    : 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200'
                }`}
              >
                <Send className={`w-3 h-3 ${isFlushing ? 'animate-pulse' : ''}`} />
                <span>{isFlushing ? 'Sending...' : 'Flush Queue'}</span>
              </button>
            )}
            {showQueue ? <ChevronUp className={`w-4 h-4 ${text3}`} /> : <ChevronDown className={`w-4 h-4 ${text3}`} />}
          </div>
        </button>
        <AnimatePresence>
          {showQueue && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4">
                {queueCount === 0 ? (
                  <div className={`text-center py-3 text-xs ${text3}`}>
                    <CheckCircle2 className={`w-5 h-5 mx-auto mb-1 ${isDark ? 'text-emerald-500' : 'text-emerald-600'}`} />
                    Queue empty — all messages sent
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {getQueuedMessages().slice(0, 5).map((sms, i) => (
                      <div key={i} className={`flex items-center justify-between rounded-lg p-2 border ${subPanel}`}>
                        <div className="flex-1 mr-3">
                          <div className={`text-[10px] font-mono truncate ${text1}`}>{sms.message.slice(0, 60)}...</div>
                          <div className={`text-[10px] ${text3}`}>{sms.phone} • {new Date(sms.timestamp).toLocaleTimeString()}</div>
                        </div>
                        <Clock className={`w-3.5 h-3.5 ${text3}`} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
