import React, { useState } from 'react';
import { useDisasterStore } from '../store/useDisasterStore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  MapPin, 
  AlertOctagon, 
  BookOpen, 
  CheckCircle, 
  HelpCircle,
  Activity,
  Plus
} from 'lucide-react';

interface HazardReport {
  id: string;
  type: string;
  description: string;
  locationName: string;
  verified: boolean;
  intensity: number; // 1-5
  timestamp: string;
  count: number; // For duplicate merging/clustering simulation
}

export const SurvivalEngine: React.FC = () => {
  const { blockRoad, addTimelineEvent, internetStatus, soundMuted } = useDisasterStore();

  const [activeView, setActiveView] = useState<'hazard_feed' | 'manual'>('hazard_feed');
  const [hazardType, setHazardType] = useState<string>('water');
  const [description, setDescription] = useState<string>('');
  const [locName, setLocName] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // Pre-populated community hazard reports
  const [hazards, setHazards] = useState<HazardReport[]>([
    { id: 'hz-1', type: 'debris', description: 'Power lines down and blocked street lamp poles near Sector 4.', locationName: '8th Ave Crossing', verified: true, intensity: 3, timestamp: '12:04 PM', count: 3 },
    { id: 'hz-2', type: 'structural', description: 'Cracks expanding across flyover support columns.', locationName: 'BART Link Overpass', verified: true, intensity: 5, timestamp: '12:15 PM', count: 7 },
    { id: 'hz-3', type: 'water', description: 'Deep water levels over sidewalks, water moving fast.', locationName: 'Folsom Street Basin', verified: false, intensity: 4, timestamp: '12:28 PM', count: 1 }
  ]);

  const playChirp = () => {
    if (soundMuted) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch(e) {}
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !locName.trim()) return;

    playChirp();

    // Check for clustering duplicate reports
    const isDuplicate = hazards.some(hz => 
      hz.locationName.toLowerCase().trim() === locName.toLowerCase().trim() ||
      hz.description.toLowerCase().includes(description.substring(0, 10).toLowerCase())
    );

    if (isDuplicate) {
      // Cluster/merge duplicate report & escalate risk level!
      setHazards(prev => prev.map(hz => {
        if (
          hz.locationName.toLowerCase().trim() === locName.toLowerCase().trim() ||
          hz.description.toLowerCase().includes(description.substring(0, 10).toLowerCase())
        ) {
          const nextCount = hz.count + 1;
          const nextIntensity = Math.min(5, hz.intensity + 1);
          
          addTimelineEvent(
            `COGNITIVE CLUSTER DETECTED: Report "${description.substring(0, 20)}..." merged with active hazard ${hz.locationName}. Risk escalated.`,
            'system',
            nextIntensity > 4 ? 'critical' : 'medium'
          );

          // If intensity reaches maximum, automatically block a road on map!
          if (nextIntensity >= 5) {
            blockRoad();
          }

          return {
            ...hz,
            count: nextCount,
            intensity: nextIntensity,
            verified: true,
            timestamp: new Date().toLocaleTimeString()
          };
        }
        return hz;
      }));
    } else {
      // Add new hazard report
      const newHz: HazardReport = {
        id: `hz-${Date.now()}`,
        type: hazardType,
        description,
        locationName: locName,
        verified: false,
        intensity: Math.floor(Math.random() * 3) + 2,
        timestamp: new Date().toLocaleTimeString(),
        count: 1
      };

      setHazards(prev => [newHz, ...prev]);
      addTimelineEvent(
        `COMMUNITY ALERT RECEIVED: Civilian reported ${hazardType.toUpperCase()} hazard at ${locName}.`,
        'sos',
        'low'
      );
    }

    setDescription('');
    setLocName('');
    setShowAddForm(false);
  };

  return (
    <div className="glass-panel bg-slate-900/60 border border-slate-800 p-6 rounded-xl flex flex-col h-full relative overflow-hidden select-none">
      {/* Title & Tabs */}
      <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <Users className="w-5 h-5 text-sky-400" />
          <h2 className="font-bold text-base text-slate-100">Survival Center</h2>
        </div>

        {/* Dynamic Tab Toggles */}
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveView('hazard_feed')}
            className={`px-3 py-1.5 rounded-md transition-all duration-200 ${
              activeView === 'hazard_feed'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Hazard Reports
          </button>
          <button
            onClick={() => setActiveView('manual')}
            className={`px-3 py-1.5 rounded-md transition-all duration-200 flex items-center space-x-1.5 ${
              activeView === 'manual'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : internetStatus === 'offline'
                ? 'bg-amber-500/5 text-amber-500 border border-amber-500/10 animate-pulse'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Survival Guides {internetStatus === 'offline' && '(Offline)'}</span>
          </button>
        </div>
      </div>

      {activeView === 'hazard_feed' ? (
        /* HAZARD FEED TAB */
        <div className="flex-grow flex flex-col justify-between max-h-[360px]">
          <div className="flex-grow overflow-y-auto space-y-3 pr-1">
            {/* Show Add Form Button */}
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full py-3.5 rounded-xl border border-dashed border-sky-500/40 hover:border-solid hover:bg-sky-500/10 text-sky-400 text-sm font-semibold flex items-center justify-center space-x-2 transition duration-200 mb-4"
              >
                <Plus className="w-4 h-4" />
                <span>Report Hazard Situation</span>
              </button>
            )}

            {/* Micro-form overlay */}
            <AnimatePresence>
              {showAddForm && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleReportSubmit}
                  className="border border-slate-800 bg-slate-950 p-5 rounded-xl space-y-4 mb-4"
                >
                  <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                    <div>
                      <label className="text-slate-350 block mb-1.5">Hazard Category</label>
                      <select
                        value={hazardType}
                        onChange={(e) => setHazardType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 transition-colors"
                      >
                        <option value="water">💧 Flood Area</option>
                        <option value="debris">🚧 Blocked Road</option>
                        <option value="structural">🏢 Broken Structure</option>
                        <option value="fire">🔥 Fire Outbreak</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-350 block mb-1.5">Location / Intersection</label>
                      <input
                        type="text"
                        required
                        value={locName}
                        onChange={(e) => setLocName(e.target.value)}
                        placeholder="e.g. 5th and Main St"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 transition-colors placeholder-slate-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-355 block mb-1.5">Details of Hazard</label>
                    <input
                      type="text"
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. fallen tree blocking traffic..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 transition-colors placeholder-slate-600"
                    />
                  </div>

                  <div className="flex justify-end space-x-3 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition duration-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-white font-bold transition duration-200"
                    >
                      Submit Hazard
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Live Hazard List */}
            <div className="space-y-3">
              {hazards.map((hz) => (
                <div 
                  key={hz.id}
                  className={`p-4 rounded-xl border border-slate-800 bg-slate-955/40 relative overflow-hidden flex items-start space-x-3.5 transition-colors ${
                    hz.intensity >= 4 ? 'border-l-4 border-l-red-500 animate-pulse' : 'border-l-4 border-l-sky-500'
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <AlertOctagon className={`w-5 h-5 ${hz.intensity >= 4 ? 'text-red-500' : 'text-sky-500'}`} />
                  </div>

                  <div className="flex-grow space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center text-slate-100">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-sky-400" />
                        {hz.locationName}
                      </span>
                      <span className="text-slate-500 font-normal">{hz.timestamp}</span>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed font-normal">
                      {hz.description}
                    </p>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/60 mt-1">
                      <span className="flex items-center font-medium">
                        {hz.verified ? (
                          <span className="text-emerald-400 flex items-center">
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />
                            Verified by AI
                          </span>
                        ) : (
                          <span className="text-amber-500 flex items-center">
                            <HelpCircle className="w-3.5 h-3.5 mr-1" />
                            Unverified Report
                          </span>
                        )}
                      </span>
                      
                      {hz.count > 1 && (
                        <span className="bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
                          {hz.count} Reports Merged
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* GUIDES TAB (OFFLINE SURVIVAL REFERENCE MANUAL) */
        <div className="flex-grow overflow-y-auto space-y-4 pr-1 text-xs max-h-[360px]">
          {internetStatus === 'offline' && (
            <div className="flex items-center space-x-3 border border-amber-500/20 bg-amber-500/5 p-4 rounded-xl text-amber-400 leading-relaxed animate-pulse">
              <Activity className="w-5 h-5 flex-shrink-0" />
              <span>Offline mode active: Communications networks are down. Reference guidelines are loaded locally.</span>
            </div>
          )}

          {/* Guide item 1 */}
          <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-4 space-y-2">
            <span className="text-sm font-bold text-sky-400">1. Flood Survival Guidelines</span>
            <p className="text-slate-305 text-xs leading-relaxed font-normal">
              • Move to higher ground (roofs or high floors). Avoid basement areas.<br />
              • Do not walk, swim, or drive through moving flood waters.<br />
              • Use the voice SOS reporting tool to transmit your coordinates.<br />
              • Signal rescue teams using flashlights or high-visibility materials.
            </p>
          </div>

          {/* Guide item 2 */}
          <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-4 space-y-2">
            <span className="text-sm font-bold text-sky-400">2. Earthquake Survival Guidelines</span>
            <p className="text-slate-305 text-xs leading-relaxed font-normal">
              • Drop, Cover, and Hold On. Protect your head under sturdy structures.<br />
              • Stay away from glass, outer walls, and tall furniture.<br />
              • Avoid elevators. If trapped in a structure, stay calm and signal rescuers.
            </p>
          </div>

          {/* Guide item 3 */}
          <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-4 space-y-2">
            <span className="text-sm font-bold text-sky-400">3. Offline Data & Mesh Syncing</span>
            <p className="text-slate-305 text-xs leading-relaxed font-normal">
              ResqNet stores emergency reports locally in browser cache when disconnected. They are synchronized with the central response map automatically once a network node or mesh connection is established.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
