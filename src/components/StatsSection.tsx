import React, { useEffect, useState } from 'react';
import { useDisasterStore } from '../store/useDisasterStore';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Activity, ShieldAlert, Navigation, Radio, Users, BrainCircuit } from 'lucide-react';

interface StatHistory {
  emergencies: { value: number }[];
  sos: { value: number }[];
  squads: { value: number }[];
}

interface PanicHistoryPoint {
  time: string;
  panic: number;
}

export const StatsSection: React.FC = () => {
  const { disasters, sosRequests, rescueTeams, internetStatus } = useDisasterStore();

  const activeDisasters = disasters.filter(d => d.status === 'active').length;
  const pendingSos = sosRequests.filter(s => s.status === 'pending').length;
  const criticalSos = sosRequests.filter(s => s.status === 'pending' && s.severity === 'critical').length;
  const activeEmergencies = activeDisasters + sosRequests.filter(s => s.status !== 'rescued').length;
  
  const mobilizedSquads = rescueTeams.filter(t => t.status !== 'idle').length;
  const blockedRoadCount = useDisasterStore(state => state.blockedRoads.length);

  // Calculate current Panic Value
  const offlinePenalty = internetStatus === 'offline' ? 15 : 0;
  const rawPanic = (activeDisasters * 20) + (criticalSos * 10) + offlinePenalty;
  const panicValue = Math.min(100, Math.max(0, rawPanic));

  // Rolling history for Sparklines
  const [history, setHistory] = useState<StatHistory>({
    emergencies: Array(8).fill(null).map(() => ({ value: 1 + Math.floor(Math.random() * 3) })),
    sos: Array(8).fill(null).map(() => ({ value: 1 + Math.floor(Math.random() * 2) })),
    squads: Array(8).fill(null).map(() => ({ value: 0 }))
  });

  // Panic history chart data (last 10 ticks)
  const [panicHistory, setPanicHistory] = useState<PanicHistoryPoint[]>(() => 
    Array(10).fill(null).map((_, i) => ({
      time: `T-${10 - i}`,
      panic: Math.max(10, Math.min(100, Math.floor(Math.random() * 15) + 15))
    }))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      // Fetch latest values at this tick
      const store = useDisasterStore.getState();
      const currentActiveDisasters = store.disasters.filter(d => d.status === 'active').length;
      const currentCriticalSos = store.sosRequests.filter(s => s.status === 'pending' && s.severity === 'critical').length;
      const currentIsOffline = store.internetStatus === 'offline';
      
      const currentRawPanic = (currentActiveDisasters * 20) + (currentCriticalSos * 10) + (currentIsOffline ? 15 : 0);
      const latestPanic = Math.min(100, Math.max(0, currentRawPanic));

      setHistory(prev => {
        const nextEmergencies = [...prev.emergencies.slice(1), { value: activeEmergencies }];
        const nextSos = [...prev.sos.slice(1), { value: pendingSos }];
        const nextSquads = [...prev.squads.slice(1), { value: mobilizedSquads }];
        return {
          emergencies: nextEmergencies,
          sos: nextSos,
          squads: nextSquads
        };
      });

      setPanicHistory(prev => {
        const nextPanic = [...prev.slice(1), { time: new Date().toLocaleTimeString().split(' ')[0], panic: latestPanic }];
        return nextPanic;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [activeEmergencies, pendingSos, mobilizedSquads, activeDisasters, criticalSos, internetStatus]);

  // UI styling helpers
  const glassStyle = "h-36 relative rounded-xl p-5 select-none overflow-hidden flex flex-col justify-between border transition-all duration-300 shadow-lg";

  return (
    <div className="space-y-6 px-6 pt-4 pb-2">
      {/* 1. Dashboard Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        {/* Card 1: Active Incidents */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className={`${glassStyle} ${
            activeEmergencies > 0 
              ? 'border-red-500 border-opacity-40 bg-red-950 bg-opacity-[0.1] shadow-md shadow-red-950/20' 
              : 'border-slate-800 bg-slate-900 bg-opacity-70 hover:bg-opacity-90'
          }`}
        >
          <div className="flex items-center justify-between z-10">
            <span className="text-sm font-semibold text-slate-400">Active Incidents</span>
            <ShieldAlert className={`w-5 h-5 ${activeEmergencies > 0 ? 'text-red-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline space-x-2.5 z-10 mt-1">
            <span className={`text-4xl font-bold tracking-tight ${activeEmergencies > 0 ? 'text-red-400' : 'text-white'}`}>
              {activeEmergencies}
            </span>
            <span className="text-xs text-slate-500 font-semibold">alerts</span>
          </div>
          <div className="h-8 w-full absolute bottom-0 left-0 right-0 z-0 opacity-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.emergencies}>
                <defs>
                  <linearGradient id="colorEmergencies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#colorEmergencies)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Card 2: Danger Zones */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className={`${glassStyle} border-slate-800 bg-slate-900 bg-opacity-70 hover:bg-opacity-90`}
        >
          <div className="flex items-center justify-between z-10">
            <span className="text-sm font-semibold text-slate-400">Danger Zones</span>
            <Activity className="w-5 h-5 text-sky-400 animate-pulse" />
          </div>
          <div className="flex items-baseline space-x-2.5 z-10 mt-1">
            <span className="text-4xl font-bold tracking-tight text-white">
              {activeDisasters}
            </span>
            <span className="text-xs text-slate-500 font-semibold">active areas</span>
          </div>
          <span className="text-xs text-slate-400 block font-medium z-10">
            {blockedRoadCount > 0 ? `⚠️ ${blockedRoadCount} road blocks` : '✅ All roads clear'}
          </span>
        </motion.div>

        {/* Card 3: Rescue Teams */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className={`${glassStyle} border-slate-800 bg-slate-900 bg-opacity-70 hover:bg-opacity-90`}
        >
          <div className="flex items-center justify-between z-10">
            <span className="text-sm font-semibold text-slate-400">Rescue Teams</span>
            <Navigation className={`w-5 h-5 ${mobilizedSquads > 0 ? 'text-sky-400 animate-bounce' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline space-x-2.5 z-10 mt-1">
            <span className="text-4xl font-bold tracking-tight text-white">
              {mobilizedSquads}<span className="text-sm text-slate-500 font-medium">/{rescueTeams.length}</span>
            </span>
            <span className="text-xs text-slate-500 font-semibold">active</span>
          </div>
          <div className="h-8 w-full absolute bottom-0 left-0 right-0 z-0 opacity-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.squads}>
                <defs>
                  <linearGradient id="colorSquads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={1.5} fillOpacity={1} fill="url(#colorSquads)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Card 4: Network Mesh */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className={`${glassStyle} ${
            internetStatus === 'offline' 
              ? 'border-amber-500 border-opacity-40 bg-amber-950 bg-opacity-[0.1] shadow-md shadow-amber-950/20' 
              : 'border-slate-800 bg-slate-900 bg-opacity-70 hover:bg-opacity-90'
          }`}
        >
          <div className="flex items-center justify-between z-10">
            <span className="text-sm font-semibold text-slate-400">Network Mesh</span>
            <Radio className={`w-5 h-5 ${internetStatus === 'offline' ? 'text-amber-400 animate-ping' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline space-x-2.5 z-10 mt-1">
            <span className={`text-4xl font-bold tracking-tight ${internetStatus === 'offline' ? 'text-amber-450' : 'text-white'}`}>
              {internetStatus === 'offline' ? 'Local' : '100%'}
            </span>
            <span className="text-xs text-slate-500 font-semibold">signal status</span>
          </div>
          <span className="text-xs text-slate-400 block font-medium z-10">
            {internetStatus === 'offline' ? '🚨 Local mesh only' : '🛰️ Satellite sync'}
          </span>
        </motion.div>

        {/* Card 5: SOS Signals */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className={`${glassStyle} ${
            pendingSos > 0 
              ? 'border-red-500 border-opacity-65 bg-red-950 bg-opacity-[0.12] shadow-lg animate-pulse' 
              : 'border-slate-800 bg-slate-900 bg-opacity-70 hover:bg-opacity-90'
          }`}
        >
          <div className="flex items-center justify-between z-10">
            <span className="text-sm font-semibold text-slate-400">SOS Signals</span>
            <Users className={`w-5 h-5 ${pendingSos > 0 ? 'text-red-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline space-x-2.5 z-10 mt-1">
            <span className={`text-4xl font-bold tracking-tight ${pendingSos > 0 ? 'text-red-400' : 'text-white'}`}>
              {pendingSos}
            </span>
            <span className="text-xs text-slate-500 font-semibold">pending</span>
          </div>
          <div className="h-8 w-full absolute bottom-0 left-0 right-0 z-0 opacity-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.sos}>
                <defs>
                  <linearGradient id="colorSos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={1.5} fillOpacity={1} fill="url(#colorSos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* 2. Community Panic Index Monitor Card (Feature 14) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3 }}
        className="bg-slate-900/60 border border-slate-850 p-6 rounded-xl flex flex-col md:flex-row gap-6 relative overflow-hidden backdrop-blur-md"
      >
        {/* Background Grid Accent */}
        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] z-0" />

        {/* Telemetry Panel */}
        <div className="md:w-2/5 flex flex-col justify-between space-y-4 z-10">
          <div>
            <h3 className="text-sm font-bold text-slate-205 uppercase tracking-wider flex items-center space-x-2">
              <BrainCircuit className="w-5 h-5 text-sky-400" />
              <span>Community Panic telemetry</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Calculates civilian panic index based on active hazards, structural trapped groups, critical medical emergencies, and local mesh communications state.
            </p>
          </div>

          <div className="flex items-baseline space-x-4">
            <span className={`text-5xl font-extrabold tracking-tight ${
              panicValue > 70 
                ? 'text-red-500 animate-pulse' 
                : panicValue > 35 
                ? 'text-amber-500' 
                : 'text-emerald-500'
            }`}>
              {panicValue}%
            </span>
            <div className="flex flex-col">
              <span className={`text-xs font-bold uppercase tracking-wider ${
                panicValue > 70 
                  ? 'text-red-400' 
                  : panicValue > 35 
                  ? 'text-amber-400' 
                  : 'text-emerald-400'
              }`}>
                {panicValue > 70 
                  ? '⚠️ EVAC EMERGENCY' 
                  : panicValue > 35 
                  ? '⚠️ ELEVATED STRESS' 
                  : '✅ SECURE RANGE'
                }
              </span>
              <span className="text-[10px] text-slate-500 font-semibold mt-0.5">Civilian Safety Multiplier</span>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Telemetry Inputs:</div>
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>Active Threats (+20% each)</span>
              <span className="font-semibold text-slate-205 text-slate-300">+{activeDisasters * 20}% ({activeDisasters})</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>Critical SOS beacons (+10% each)</span>
              <span className="font-semibold text-slate-205 text-slate-300">+{criticalSos * 10}% ({criticalSos})</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>Network Blackout status</span>
              <span className="font-semibold text-slate-205 text-slate-300">+{internetStatus === 'offline' ? 15 : 0}%</span>
            </div>
          </div>
        </div>

        {/* Dynamic Graphic Area Chart */}
        <div className="flex-grow h-48 bg-slate-950/50 border border-slate-850 rounded-xl p-4 flex flex-col justify-between z-10">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 border-b border-slate-850 pb-2">
            <span>Panic Trend Timeline</span>
            <span className="text-slate-400 font-semibold">Mesh Node Logs</span>
          </div>
          <div className="flex-grow h-32 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={panicHistory}>
                <defs>
                  <linearGradient id="colorPanic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={panicValue > 60 ? "#ef4444" : "#f59e0b"} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={panicValue > 60 ? "#ef4444" : "#f59e0b"} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area 
                  type="monotone" 
                  dataKey="panic" 
                  stroke={panicValue > 60 ? "#ef4444" : "#f59e0b"} 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#colorPanic)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
