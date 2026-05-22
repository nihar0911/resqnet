import React, { useState } from 'react';
import { useDisasterStore, CITIES } from '../store/useDisasterStore';
import { Shield, ShieldAlert, Volume2, VolumeX, Key, Wifi, WifiOff, Sun, Moon, MapPin } from 'lucide-react';

interface NavbarProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isDark, onToggleTheme }) => {
  const {
    internetStatus,
    simulateInternetBlackout,
    soundMuted,
    toggleSound,
    apiKey,
    setApiKey,
    sosRequests,
    disasters,
    selectedCity,
    selectCity
  } = useDisasterStore();

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);

  const activeEmergencies = disasters.filter(d => d.status === 'active').length +
    sosRequests.filter(s => s.status !== 'rescued').length;

  const handleSaveKey = () => {
    setApiKey(tempKey);
    setShowKeyModal(false);
  };

  // ─── Shared style helpers ────────────────────────────
  const navBg = isDark
    ? 'bg-slate-950/90 border-slate-800'
    : 'border-blue-700/40';

  const navStyle = isDark
    ? {}
    : {
        background: 'linear-gradient(135deg, #1a3a8f 0%, #1e4fc2 40%, #2563eb 70%, #1d4ed8 100%)',
        boxShadow: '0 4px 32px rgba(37, 99, 235, 0.35)',
      };

  // Light-mode specific styles
  const L = {
    brand:     'text-white drop-shadow-sm',
    badge:     'bg-white/15 border-white/25 text-blue-100',
    sub:       'text-blue-200',
    sectorLbl: 'text-blue-100',
    select:    'bg-white/10 border-white/20 text-white placeholder-blue-200 focus:border-white/50 focus:bg-white/20',
    selectOpt: '',
    statusOnline:
               'border-white/25 text-white bg-white/10 hover:bg-white/20',
    statusOff: 'border-red-400/60 text-red-200 bg-red-400/10 hover:bg-red-400/20',
    iconBtn:   'bg-white/10 border-white/20 text-blue-100 hover:bg-white/20 hover:text-white',
    iconBtnOrange: 'bg-orange-400/15 border-orange-300/40 text-orange-200 hover:bg-orange-400/25',
    sunIcon:   'text-yellow-300',
    moonIcon:  'text-blue-200',
    statusDot: 'text-emerald-300',
    emergBadge:
               'border-red-300/50 text-red-200 bg-red-400/15 animate-pulse',
    emergBadgeOk:
               'border-emerald-300/40 text-emerald-200 bg-emerald-400/10',
    shieldBorder:
               'border-white/40 text-white',
    syncText:  'text-blue-200',
  };

  // Dark-mode specific styles
  const D = {
    brand:     'text-white',
    badge:     'bg-slate-900 border-slate-800 text-sky-400',
    sub:       'text-slate-400',
    sectorLbl: 'text-slate-400',
    select:    'bg-slate-950 border-slate-800 text-sky-400 focus:border-sky-500',
    selectOpt: '',
    statusOnline:
               'border-sky-500 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10',
    statusOff: 'border-red-500 text-red-400 bg-red-500/5 hover:bg-red-500/10',
    iconBtn:   'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-sky-400',
    iconBtnOrange: 'bg-slate-900 border-orange-500 text-orange-400',
    sunIcon:   'text-slate-600',
    moonIcon:  'text-sky-400',
    statusDot: '',
    emergBadge:
               'border-red-500 text-red-400 bg-red-500/5 animate-pulse',
    emergBadgeOk:
               'border-emerald-500 text-emerald-400 bg-emerald-500/5',
    shieldBorder:
               '',
    syncText:  'text-slate-400',
  };

  const T = isDark ? D : L;

  return (
    <>
      <nav
        className={`h-16 w-full border-b flex items-center justify-between px-6 select-none relative z-[1001] backdrop-blur-md ${navBg}`}
        style={navStyle}
      >
        {/* ── Brand ─────────────────────────────── */}
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center">
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
              internetStatus === 'offline'
                ? 'border-red-400 text-red-400'
                : isDark
                  ? 'border-sky-500 text-sky-400'
                  : T.shieldBorder
            }`}>
              {internetStatus === 'offline'
                ? <ShieldAlert className="w-4 h-4 animate-pulse" />
                : <Shield className="w-4 h-4" />
              }
            </div>
            {internetStatus === 'offline' && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className={`font-extrabold text-lg tracking-tight ${T.brand}`}>ResqNet AI</span>
              <span className={`text-[10px] px-2 py-0.5 border rounded-full font-bold tracking-wide ${T.badge}`}>
                v1.2 · LIVE
              </span>
            </div>
            <span className={`text-[10px] block -mt-0.5 font-medium ${T.sub}`}>
              Emergency response platform
            </span>
          </div>
        </div>

        {/* ── Centre telemetry ──────────────────── */}
        <div className="hidden md:flex items-center space-x-8">
          {/* Connectivity indicator */}
          <div className="flex items-center space-x-2.5">
            <div className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                internetStatus === 'offline' ? 'bg-red-400' : 'bg-emerald-400'
              }`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                internetStatus === 'offline' ? 'bg-red-400' : 'bg-emerald-400'
              }`} />
            </div>
            <div>
              <div className={`text-xs font-bold tracking-wide ${
                internetStatus === 'offline'
                  ? 'text-red-400'
                  : isDark ? 'text-emerald-400' : 'text-emerald-300'
              }`}>
                {internetStatus === 'offline' ? 'Offline Mesh Active' : 'Connected to Cloud'}
              </div>
              <span className={`text-[10px] block -mt-0.5 ${T.syncText}`}>Sync complete</span>
            </div>
          </div>

          {/* Emergency count badge */}
          <div className={`px-3 py-1 rounded-full border text-xs font-bold flex items-center space-x-1.5 ${
            activeEmergencies > 0 ? T.emergBadge : T.emergBadgeOk
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span>Active alerts: {activeEmergencies}</span>
          </div>
        </div>

        {/* ── Controls ─────────────────────────── */}
        <div className="flex items-center space-x-3">

          {/* Sector selector */}
          <div className="flex items-center space-x-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider hidden lg:inline ${T.sectorLbl}`}>
              Sector:
            </span>
            <div className="relative">
              <MapPin className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none ${
                isDark ? 'text-sky-400' : 'text-blue-200'
              }`} />
              <select
                value={selectedCity}
                onChange={(e) => selectCity(e.target.value)}
                className={`pl-7 pr-3 py-1.5 rounded-lg border text-xs font-bold focus:outline-none cursor-pointer max-w-[160px] transition-all ${T.select}`}
                style={!isDark ? { background: 'rgba(255,255,255,0.12)', color: 'white' } : {}}
              >
                {Object.keys(CITIES).map(cityKey => (
                  <option
                    key={cityKey}
                    value={cityKey}
                    style={!isDark ? { background: '#1e40af', color: 'white' } : {}}
                  >
                    {cityKey}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Online / Offline toggle */}
          <button
            onClick={simulateInternetBlackout}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
              internetStatus === 'offline' ? T.statusOff : T.statusOnline
            }`}
          >
            {internetStatus === 'offline'
              ? <><WifiOff className="w-3.5 h-3.5" /><span>Offline</span></>
              : <><Wifi className="w-3.5 h-3.5" /><span>Online</span></>
            }
          </button>

          {/* Theme toggle */}
          <div className="flex items-center space-x-1.5">
            <Sun className={`w-3.5 h-3.5 transition-colors ${T.sunIcon}`} />
            <button
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              className={`theme-toggle-btn ${isDark ? 'dark-mode' : 'light-mode'}`}
            >
              <span className="theme-toggle-knob">
                {isDark ? '🌙' : '☀️'}
              </span>
            </button>
            <Moon className={`w-3.5 h-3.5 transition-colors ${T.moonIcon}`} />
          </div>

          {/* API Key button */}
          <button
            onClick={() => setShowKeyModal(true)}
            className={`p-2 rounded-lg border transition-all relative group ${T.iconBtn}`}
            title="Configure Gemini API Key"
          >
            <Key className="w-4 h-4" />
            {apiKey && (
              <span className={`absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 border ${
                isDark ? 'border-slate-900' : 'border-blue-700'
              }`} />
            )}
          </button>

          {/* Mute button */}
          <button
            onClick={toggleSound}
            className={`p-2 rounded-lg border transition-all ${
              soundMuted ? T.iconBtnOrange : T.iconBtn
            }`}
            title={soundMuted ? 'Unmute alerts' : 'Mute alerts'}
          >
            {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* ── API Key Modal ──────────────────────── */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2000] p-4 select-text">
          <div className={`w-full max-w-md rounded-2xl relative overflow-hidden shadow-2xl border ${
            isDark
              ? 'bg-slate-900 border-slate-700'
              : 'bg-white border-blue-100'
          }`}
          style={!isDark ? { boxShadow: '0 20px 60px rgba(37,99,235,0.18)' } : {}}>

            {/* Modal header */}
            <div className={`px-6 py-5 border-b flex items-center space-x-3 ${
              isDark
                ? 'border-slate-800'
                : 'border-blue-50'
            }`}
            style={!isDark ? {
              background: 'linear-gradient(135deg, #1e40af, #2563eb)',
            } : {}}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isDark ? 'bg-sky-500/15 border border-sky-500/30' : 'bg-white/15 border border-white/30'
              }`}>
                <Key className={`w-5 h-5 ${isDark ? 'text-sky-400' : 'text-white'}`} />
              </div>
              <div>
                <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-white'}`}>
                  Configure AI Assistant
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-blue-200'}`}>
                  Gemini API · ResqNet Intelligence
                </p>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className={`text-sm mb-5 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Enter your Gemini API key to enable real-time AI emergency summaries. Without a key, the built-in local simulator runs automatically.
              </p>

              <div className="space-y-2 mb-6">
                <label className={`text-xs font-bold uppercase tracking-wider block ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className={`w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 border transition-all ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus:ring-sky-500/40 focus:border-sky-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-blue-500/30 focus:border-blue-400'
                  }`}
                />
                <span className={`text-xs block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Stored securely in your browser's local storage.
                </span>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowKeyModal(false)}
                  className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    isDark
                      ? 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveKey}
                  className={`px-5 py-2.5 rounded-xl text-white font-bold text-sm transition-all shadow-lg ${
                    isDark
                      ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20'
                      : 'shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-[1.02]'
                  }`}
                  style={!isDark ? { background: 'linear-gradient(135deg, #1e40af, #2563eb)' } : {}}
                >
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
