import React, { useState, useEffect } from 'react';
import { useDisasterStore } from '../store/useDisasterStore';
import { getMultiAgentBriefing } from '../services/geminiService';
import type { CouncilBriefs } from '../services/geminiService';
import { Shield, Heart, Truck, RefreshCw, BrainCircuit, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export const MultiAgentCouncil: React.FC = () => {
  const { disasters, sosRequests, blockedRoads, dangerEscalation, internetStatus } = useDisasterStore();

  const [briefs, setBriefs] = useState<CouncilBriefs | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const fetchCouncilData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMultiAgentBriefing();
      setBriefs(data);
    } catch (err) {
      console.error(err);
      setError('Neural channel error: Failed to sync with AI council members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCouncilData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disasters.length, sosRequests.length, blockedRoads.length, dangerEscalation, internetStatus]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  return (
    <div className="w-full h-full flex flex-col p-6 glass-panel bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden select-none">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2.5">
            <BrainCircuit className="w-6 h-6 text-sky-400" />
            <span>Multi-Agent AI Council</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Three expert AI models conducting real-time coordination, medical assessment, and logistics planning.
          </p>
        </div>

        <button
          onClick={fetchCouncilData}
          disabled={loading}
          className={`self-start sm:self-auto px-4 py-2 rounded-lg border font-semibold text-xs flex items-center space-x-1.5 transition-all duration-200 ${
            loading
              ? 'border-slate-800 text-slate-600 bg-transparent cursor-not-allowed'
              : 'border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Convene Council</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-center space-x-2 text-red-400 border border-red-500/20 p-3 rounded-lg bg-red-500/5 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex-grow flex flex-col items-center justify-center space-y-4 py-12">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-sky-500/10 border-t-sky-500 animate-spin" />
            <BrainCircuit className="w-6 h-6 text-sky-400 absolute animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-sky-400 animate-pulse">Running Parallel Analysis...</p>
            <p className="text-xs text-slate-500 mt-1">Requesting consensus from Coordinator, Medical and Logistics specialists.</p>
          </div>
        </div>
      ) : briefs ? (
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto pr-1">
          {/* Coordinator Card */}
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col bg-slate-950/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-[3px] bg-sky-500" />
            <div className="flex items-center space-x-3 mb-4 text-sky-400">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
                <Shield className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider">Triage Coordinator</h3>
                <span className="text-[10px] text-sky-400 font-semibold uppercase tracking-wider">Operational Lead</span>
              </div>
            </div>
            <div className="flex-grow text-sm text-slate-300 leading-relaxed space-y-3 whitespace-pre-line font-normal pr-1 max-h-[300px] overflow-y-auto">
              {briefs.coordinator}
            </div>
          </motion.div>

          {/* Medical Advisor Card */}
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col bg-slate-950/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden"
            transition={{ delay: 0.1 }}
          >
            <div className="absolute top-0 left-0 w-full h-[3px] bg-red-500" />
            <div className="flex items-center space-x-3 mb-4 text-red-400">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
                <Heart className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider">Medical Advisor</h3>
                <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Health & Sanitation</span>
              </div>
            </div>
            <div className="flex-grow text-sm text-slate-300 leading-relaxed space-y-3 whitespace-pre-line font-normal pr-1 max-h-[300px] overflow-y-auto">
              {briefs.medical}
            </div>
          </motion.div>

          {/* Logistics Planner Card */}
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col bg-slate-950/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden"
            transition={{ delay: 0.2 }}
          >
            <div className="absolute top-0 left-0 w-full h-[3px] bg-amber-500" />
            <div className="flex items-center space-x-3 mb-4 text-amber-400">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Truck className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider">Logistics Planner</h3>
                <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Routing & Support</span>
              </div>
            </div>
            <div className="flex-grow text-sm text-slate-300 leading-relaxed space-y-3 whitespace-pre-line font-normal pr-1 max-h-[300px] overflow-y-auto">
              {briefs.logistics}
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="flex-grow flex items-center justify-center text-slate-400 text-sm py-12">
          No telemetry analyzed. convening council required.
        </div>
      )}
    </div>
  );
};
