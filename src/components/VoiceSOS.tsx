import React, { useState, useEffect, useRef } from 'react';
import { useDisasterStore } from '../store/useDisasterStore';
import { motion } from 'framer-motion';
import { Mic, MicOff, Send, AlertCircle, Info, Loader2 } from 'lucide-react';
import { classifyVoiceTranscription } from '../services/geminiService';

export const VoiceSOS: React.FC = () => {
  const { createCustomSOS, internetStatus, isCloudReachable } = useDisasterStore();

  const [type, setType] = useState<'flood' | 'trapped' | 'medical' | 'blackout' | 'road_block' | 'other'>('flood');
  const [occupants, setOccupants] = useState<number>(1);
  const [message, setMessage] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isClassifying, setIsClassifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const recognitionRef = useRef<any>(null);
  const waveIntervalRef = useRef<any>(null);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(10).fill(5));

  // Synthesize a confirmation radio beep
  const playSynthesizedBeep = (_freq = 900, _duration = 0.05) => {
    // Silenced for a professional, non-gamified experience
  };

  useEffect(() => {
    // Setup Web Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        setErrorMessage('');
        playSynthesizedBeep(1100, 0.08);
        
        // Start waveform visualizer animation loop
        waveIntervalRef.current = setInterval(() => {
          setWaveHeights(Array(12).fill(0).map(() => 4 + Math.floor(Math.random() * 24)));
        }, 100);
      };

      rec.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        setMessage(transcript);
        setIsClassifying(true);

        try {
          const result = await classifyVoiceTranscription(transcript);
          setType(result.type);
          setOccupants(result.occupants);
          setMessage(result.message);
        } catch (err) {
          console.error('Gemini Voice Classification failed, fallback applied.', err);
        } finally {
          setIsClassifying(false);
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech Recognition Error:', event.error);
        if (event.error === 'network') {
          setErrorMessage('Voice dictation requires cloud connectivity, which is unavailable on the local mesh network. Please type your emergency description manually below.');
        } else {
          setErrorMessage(`Voice recognition error: ${event.error}`);
        }
        setIsListening(false);
        clearInterval(waveIntervalRef.current);
      };

      rec.onend = () => {
        setIsListening(false);
        clearInterval(waveIntervalRef.current);
        setWaveHeights(Array(10).fill(5));
        playSynthesizedBeep(650, 0.1);
      };

      recognitionRef.current = rec;
    } else {
      setErrorMessage('Browser speech recognition not supported. Please type in your description manually.');
    }

    return () => {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleListen = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setMessage('');
      recognitionRef.current.start();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    createCustomSOS(type, message, occupants);
    setMessage('');
    setOccupants(1);
    playSynthesizedBeep(1200, 0.12);
  };

  return (
    <div className="glass-panel bg-slate-900/60 border border-slate-800 p-6 rounded-xl flex flex-col h-full relative overflow-hidden select-none">
      {/* Title */}
      <div className="flex items-center space-x-2.5 mb-5 border-b border-slate-800 pb-3">
        <Mic className="w-5 h-5 text-sky-400" />
        <h2 className="font-bold text-base text-slate-100">Report an Emergency Situation</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 flex-grow flex flex-col justify-between">
        <div className="space-y-4">
          {/* Emergency type and occupants selector */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-300 block mb-1.5">Emergency Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors"
              >
                <option value="flood">💧 Flood Emergency</option>
                <option value="trapped">🏢 Trapped / Collapse</option>
                <option value="medical">❤️ Medical Emergency</option>
                <option value="blackout">🔌 Power Outage</option>
                <option value="road_block">🚧 Blocked Road</option>
                <option value="other">⚠️ Other Hazard</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-300 block mb-1.5">People Affected</label>
              <input
                type="number"
                min="1"
                max="50"
                value={occupants}
                onChange={(e) => setOccupants(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>
          </div>

          {/* Voice Input Trigger block */}
          <div className="border border-slate-800 p-4 rounded-xl bg-slate-950/40 relative flex flex-col items-center">
            <label className="text-xs font-semibold text-slate-400 block mb-3 text-center w-full">Voice Recording Assist</label>
            
            <div className="flex items-center justify-center space-x-8 py-2 w-full">
              {/* Waveform Visualizer */}
              <div className="flex items-end justify-center space-x-0.5 h-8 w-24">
                {waveHeights.map((h, i) => (
                  <div 
                    key={i} 
                    style={{ height: `${h}px` }} 
                    className={`w-1 rounded-sm transition-all duration-100 ${
                      isListening ? 'bg-red-500' : 'bg-slate-700/50'
                    }`} 
                  />
                ))}
              </div>

              {/* Mic button */}
              <motion.button
                type="button"
                whileHover={isCloudReachable ? { scale: 1.05 } : {}}
                whileTap={isCloudReachable ? { scale: 0.95 } : {}}
                onClick={handleListen}
                disabled={!isCloudReachable}
                className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-300 relative ${
                  !isCloudReachable
                    ? 'border-slate-800 bg-slate-900/40 text-slate-600 cursor-not-allowed'
                    : isListening 
                    ? 'border-red-500 bg-red-500/10 text-red-500 animate-pulse' 
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-sky-400'
                }`}
              >
                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </motion.button>
            </div>

            <div className="text-xs text-slate-400 text-center mt-2.5 font-medium flex items-center justify-center space-x-1.5 h-5">
              {isClassifying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                  <span className="text-sky-400">AI Council triaging distress signal...</span>
                </>
              ) : !isCloudReachable ? (
                <span>Voice dictation is offline (local mesh active). Please type description below.</span>
              ) : isListening ? (
                <span className="text-red-500 animate-pulse">Recording voice report... Speak clearly.</span>
              ) : (
                <span>Tap microphone to dictate details</span>
              )}
            </div>
          </div>

          {/* Transcribed Description input */}
          <div>
            <label className="text-sm font-semibold text-slate-300 block mb-1.5">Description details</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Say your emergency details or type them manually here..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none"
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-3 mt-4">
          {errorMessage && (
            <div className="flex items-center space-x-2 text-amber-500 border border-amber-500/20 p-2.5 rounded-lg bg-amber-500/5 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {internetStatus === 'offline' && (
            <div className="flex items-center space-x-2 text-amber-500 border border-amber-500/20 p-2.5 rounded-lg bg-amber-500/5 text-xs font-semibold">
              <Info className="w-4 h-4" />
              <span>Offline mode active: Message will queue locally and sync once network resolves.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!message.trim()}
            className={`w-full py-3.5 rounded-xl border font-semibold text-sm flex items-center justify-center space-x-2 transition-all duration-200 ${
              message.trim() 
                ? 'border-sky-500 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 shadow-sm'
                : 'border-slate-800 text-slate-500 bg-slate-900/40 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Submit Emergency Report</span>
          </button>
        </div>
      </form>
    </div>
  );
};
