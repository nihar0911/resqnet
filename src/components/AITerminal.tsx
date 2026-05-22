import React, { useEffect, useState } from 'react';
import { useDisasterStore } from '../store/useDisasterStore';
import { getRealtimeBriefing } from '../services/geminiService';
import { Cpu, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

export const AITerminal: React.FC = () => {
  const { 
    disasters, 
    sosRequests, 
    blockedRoads, 
    dangerEscalation, 
    internetStatus,
    apiKey,
    isCloudReachable
  } = useDisasterStore();

  const [briefing, setBriefing] = useState<string>('');
  const [displayText, setDisplayText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'sitrep' | 'diagnostics'>('sitrep');

  const handleSynthesizeSitrep = async () => {
    setLoading(true);
    setDisplayText('');
    try {
      const sitrep = await getRealtimeBriefing();
      setBriefing(sitrep);
    } catch (err) {
      console.error(err);
      setBriefing('Cognitive link status offline. Please try refreshing again.');
    } finally {
      setLoading(false);
    }
  };

  // Re-run sitrep synthesis whenever crucial store statistics change
  useEffect(() => {
    handleSynthesizeSitrep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disasters.length, sosRequests.length, blockedRoads.length, dangerEscalation, internetStatus]);

  // High-fidelity typewriter rendering effect without click sounds
  useEffect(() => {
    if (!briefing) return;
    
    let currentIndex = 0;
    const intervalTime = briefing.length > 500 ? 5 : 12; // Type faster for longer sitreps
    
    const interval = setInterval(() => {
      setDisplayText(briefing.substring(0, currentIndex + 1));
      currentIndex++;

      if (currentIndex >= briefing.length) {
        clearInterval(interval);
      }
    }, intervalTime);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefing]);

  return (
    <div className="glass-panel bg-slate-900/60 border border-slate-800 p-6 rounded-xl flex flex-col h-full relative overflow-hidden select-none">
      {/* Terminal Title */}
      <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <Cpu className="w-5 h-5 text-sky-400" />
          <h2 className="font-bold text-base text-slate-100">AI Assistant Briefings</h2>
        </div>

        {/* Tab Selectors */}
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
          <button 
            onClick={() => setActiveTab('sitrep')}
            className={`px-3 py-1.5 rounded-md transition-all duration-200 ${
              activeTab === 'sitrep' 
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            AI Brief
          </button>
          <button 
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3 py-1.5 rounded-md transition-all duration-200 ${
              activeTab === 'diagnostics' 
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            System Diagnostics
          </button>
        </div>
      </div>

      {activeTab === 'sitrep' ? (
        <>
          {/* Main Briefing Log */}
          <div className="flex-grow overflow-y-auto bg-slate-955/40 border border-slate-800 rounded-xl p-4 select-text max-h-[300px] lg:max-h-[360px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3">
                <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
                <span className="text-sm text-slate-400 font-semibold animate-pulse">Consulting AI assistant...</span>
              </div>
            ) : (
              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line font-normal">
                {displayText || 'Waiting for emergency analysis...'}
                <span className="w-2 h-4 bg-slate-400 inline-block animate-pulse ml-1 align-middle" />
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-400 flex items-center font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mr-2" />
              AI Status: Analysis complete
            </span>

            <button
              onClick={handleSynthesizeSitrep}
              disabled={loading}
              className={`px-4 py-2 rounded-lg border font-semibold text-xs flex items-center space-x-1.5 transition-all duration-200 ${
                loading 
                  ? 'border-slate-800 text-slate-600 bg-transparent cursor-not-allowed'
                  : 'border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh AI</span>
            </button>
          </div>
        </>
      ) : (
        /* Diagnostics Panel */
        <div className="flex-grow flex flex-col justify-between text-sm text-slate-350 space-y-4">
          <div className="space-y-3.5 border border-slate-800 p-4 rounded-xl bg-slate-950">
            <div className="flex justify-between border-b border-slate-800/60 pb-2.5">
              <span className="text-slate-400 font-medium">AI Source</span>
              <span className="text-sky-400 font-bold">
                {(apiKey && isCloudReachable && internetStatus === 'online') ? 'Gemini API (Online)' : 'Local Heuristic Engine (Offline)'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2.5">
              <span className="text-slate-400 font-medium">Response Time</span>
              <span className="text-emerald-400 font-bold">Fast (0.15s)</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2.5">
              <span className="text-slate-400 font-medium">Connection Status</span>
              <span className="text-amber-500 font-bold">Local Backup Active</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2.5">
              <span className="text-slate-400 font-medium">Active Map Overlays</span>
              <span className="text-sky-400 font-bold">12 Active Layers</span>
            </div>
            <div className="flex justify-between pb-0.5">
              <span className="text-slate-400 font-medium">System Load</span>
              <span className="text-emerald-400 font-bold">Normal / Healthy</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 border border-amber-500/20 bg-amber-500/5 p-4 rounded-xl text-amber-400 leading-relaxed text-xs">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>Note: The AI assistant is running locally on your device because of the simulated network outage.</span>
          </div>
        </div>
      )}
    </div>
  );
};
