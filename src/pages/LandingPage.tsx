import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, User, Activity, Navigation, Radio } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#060913] text-slate-200 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-sky-900/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="z-10 w-full max-w-4xl text-center mb-16">
        <div className="inline-flex items-center justify-center p-4 bg-sky-500/10 rounded-full mb-6 border border-sky-500/30">
          <Radio className="w-10 h-10 text-sky-400 animate-pulse" />
        </div>
        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 mb-6 font-outfit tracking-tight">
          RESQNET
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          The Offline-First Disaster Management Eco-System. Select your access portal below to continue.
        </p>
      </div>

      <div className="z-10 grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        
        {/* User / Civilian Portal */}
        <Link 
          to="/user"
          className="group relative bg-slate-900/80 border border-slate-700 hover:border-sky-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_10px_40px_-10px_rgba(56,189,248,0.3)] overflow-hidden flex flex-col items-center text-center"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-600 to-sky-400 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
          <div className="w-20 h-20 bg-sky-500/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <User className="w-10 h-10 text-sky-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Civilian Portal</h2>
          <p className="text-slate-400 mb-6">
            Report a disaster, send an SOS, and track the live location of your incoming rescue team.
          </p>
          <div className="mt-auto px-6 py-2 bg-sky-500/10 text-sky-400 rounded-full text-sm font-bold flex items-center">
            Enter as User <Navigation className="w-4 h-4 ml-2" />
          </div>
        </Link>

        {/* Admin / Dashboard Portal */}
        <Link 
          to="/admin"
          className="group relative bg-slate-900/80 border border-slate-700 hover:border-emerald-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_10px_40px_-10px_rgba(52,211,153,0.3)] overflow-hidden flex flex-col items-center text-center"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-emerald-400 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
            <ShieldAlert className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Admin Command</h2>
          <p className="text-slate-400 mb-6">
            Monitor national alerts, dispatch rescue teams, and oversee the entire emergency operation.
          </p>
          <div className="mt-auto px-6 py-2 bg-emerald-500/10 text-emerald-400 rounded-full text-sm font-bold flex items-center">
            Enter as Admin <Activity className="w-4 h-4 ml-2" />
          </div>
        </Link>

      </div>
    </div>
  );
}
