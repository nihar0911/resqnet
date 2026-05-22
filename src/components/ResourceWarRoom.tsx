import React, { useState } from 'react';
import { useDisasterStore } from '../store/useDisasterStore';
import type { Volunteer } from '../store/useDisasterStore';
import {
  Users, UserCheck, UserMinus, Shield, MapPin, Truck,
  AlertTriangle, CheckCircle, Radio, Zap, Activity,
  Target, Navigation, Package, Clock, Siren
} from 'lucide-react';

export const ResourceWarRoom: React.FC = () => {
  const { volunteers, sosRequests, assignVolunteer, selectedCity, rescueTeams, shelters } = useDisasterStore();
  const [selectedSosForVol, setSelectedSosForVol] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<'volunteers' | 'squads' | 'shelters' | 'sos'>('volunteers');

  const getDistanceKM = (p1: [number, number], p2: [number, number]): number => {
    const dLat = p1[0] - p2[0];
    const dLng = p1[1] - p2[1];
    return Math.sqrt(dLat * dLat + dLng * dLng) * 111;
  };

  const pendingSosRequests = sosRequests.filter(s => s.status === 'pending');
  const totalVolunteers = volunteers.length;
  const availableVolunteers = volunteers.filter(v => v.status === 'available').length;
  const dispatchedVolunteers = volunteers.filter(v => v.status === 'dispatched').length;
  const totalCapacity = shelters.reduce((a, s) => a + s.capacity, 0);
  const totalOccupants = shelters.reduce((a, s) => a + s.occupants, 0);
  const activeMissions = rescueTeams.filter(t => t.status !== 'idle').length;

  const handleSelectSos = (volunteerId: string, sosId: string) => {
    setSelectedSosForVol(prev => ({ ...prev, [volunteerId]: sosId }));
  };

  const handleDispatch = (volunteerId: string) => {
    const sosId = selectedSosForVol[volunteerId];
    if (!sosId) return;
    assignVolunteer(volunteerId, sosId);
    setSelectedSosForVol(prev => {
      const updated = { ...prev };
      delete updated[volunteerId];
      return updated;
    });
  };

  const handleRecall = (volunteerId: string) => {
    assignVolunteer(volunteerId, null);
  };

  const getSkillLabel = (skill: Volunteer['skill']) => skill.replace(/_/g, ' ').toUpperCase();
  const getVehicleLabel = (vehicle: Volunteer['vehicle']) => {
    if (vehicle === 'none') return 'On Foot';
    return vehicle.replace(/_/g, ' ').toUpperCase();
  };

  const getSkillColor = (skill: Volunteer['skill']) => {
    const map: Record<string, string> = {
      first_aid: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
      boat_pilot: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
      debris_clearing: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
      ham_radio: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
      driver: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    };
    return map[skill] || 'border-slate-700 bg-slate-800/50 text-slate-400';
  };

  const sections = [
    { id: 'volunteers', label: 'Volunteers', icon: Users, count: totalVolunteers, color: 'sky' },
    { id: 'squads', label: 'Tactical Squads', icon: Radio, count: rescueTeams.length, color: 'amber' },
    { id: 'shelters', label: 'Safe Shelters', icon: Shield, count: shelters.length, color: 'emerald' },
    { id: 'sos', label: 'SOS Queue', icon: Siren, count: pendingSosRequests.length, color: 'red' },
  ] as const;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none" style={{ fontFamily: "'Outfit', sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 pb-4 border-b border-slate-800 flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <Target className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">Resource War Room</h2>
              <p className="text-xs text-slate-500 -mt-0.5">Active sector: <span className="text-sky-400 font-semibold">{selectedCity}</span></p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2 mt-1">
          <span className="flex items-center space-x-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>MESH ACTIVE</span>
          </span>
          <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* ── KPI Stat Cards ─────────────────────────────────────── */}
      <div className="flex-shrink-0 grid grid-cols-6 gap-3 py-4">
        {[
          { label: 'Total Responders', val: totalVolunteers, icon: Users, color: 'sky', sub: 'Volunteers' },
          { label: 'On Mission', val: dispatchedVolunteers, icon: Navigation, color: 'amber', sub: 'Dispatched' },
          { label: 'On Standby', val: availableVolunteers, icon: CheckCircle, color: 'emerald', sub: 'Available' },
          { label: 'Active Squads', val: activeMissions, icon: Radio, color: 'purple', sub: 'NDRF / Military' },
          { label: 'Pending SOS', val: pendingSosRequests.length, icon: AlertTriangle, color: 'red', sub: 'Unresolved' },
          { label: 'Shelter Load', val: `${totalOccupants}/${totalCapacity}`, icon: Package, color: 'teal', sub: 'Occupancy' },
        ].map(({ label, val, icon: Icon, color, sub }) => {
          const colors: Record<string, { border: string; bg: string; text: string; glow: string }> = {
            sky:     { border: 'border-sky-500/25',     bg: 'bg-sky-500/8',     text: 'text-sky-300',     glow: 'shadow-sky-500/10' },
            amber:   { border: 'border-amber-500/25',   bg: 'bg-amber-500/8',   text: 'text-amber-300',   glow: 'shadow-amber-500/10' },
            emerald: { border: 'border-emerald-500/25', bg: 'bg-emerald-500/8', text: 'text-emerald-300', glow: 'shadow-emerald-500/10' },
            purple:  { border: 'border-purple-500/25',  bg: 'bg-purple-500/8',  text: 'text-purple-300',  glow: 'shadow-purple-500/10' },
            red:     { border: 'border-red-500/25',     bg: 'bg-red-500/8',     text: 'text-red-300',     glow: 'shadow-red-500/10' },
            teal:    { border: 'border-teal-500/25',    bg: 'bg-teal-500/8',    text: 'text-teal-300',    glow: 'shadow-teal-500/10' },
          };
          const c = colors[color];
          return (
            <div key={label} className={`relative rounded-xl border ${c.border} ${c.bg} p-3.5 flex flex-col justify-between shadow-lg ${c.glow} overflow-hidden group hover:scale-[1.015] transition-transform`}>
              <div className={`absolute top-0 right-0 w-16 h-16 rounded-full ${c.bg} blur-xl opacity-60`} />
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
                <Icon className={`w-3.5 h-3.5 ${c.text} opacity-70`} />
              </div>
              <span className={`text-2xl font-black ${c.text} leading-none`}>{val}</span>
              <span className="text-[9px] text-slate-600 font-semibold mt-1 uppercase tracking-wide">{sub}</span>
            </div>
          );
        })}
      </div>

      {/* ── Section Tabs ───────────────────────────────────────── */}
      <div className="flex-shrink-0 flex space-x-1.5 mb-4 p-1 bg-slate-950/60 border border-slate-800 rounded-lg">
        {sections.map(({ id, label, icon: Icon, count, color }) => {
          const isActive = activeSection === id;
          const colorMap: Record<string, string> = {
            sky: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
            amber: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
            emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
            red: 'bg-red-500/15 border-red-500/30 text-red-400',
          };
          return (
            <button
              key={id}
              onClick={() => setActiveSection(id as any)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-md text-xs font-bold transition-all duration-200 border ${
                isActive
                  ? colorMap[color]
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                isActive ? 'bg-current/20 text-current' : 'bg-slate-800 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Section Content ────────────────────────────────────── */}
      <div className="flex-grow overflow-y-auto pr-1 min-h-0">

        {/* VOLUNTEERS */}
        {activeSection === 'volunteers' && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-slate-100 text-sm">Civilian Volunteer Fleet</span>
              </div>
              <div className="flex items-center space-x-3 text-[10px] font-bold">
                <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  {availableVolunteers} Available
                </span>
                <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  {dispatchedVolunteers} On Mission
                </span>
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/60 text-[9px] font-black uppercase tracking-widest text-slate-500">
              <div className="col-span-3">Volunteer</div>
              <div className="col-span-2">Skill</div>
              <div className="col-span-2">Transport</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-3 text-right">Command</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-800/50">
              {volunteers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                  <Shield className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm font-semibold">No volunteers registered in this sector</p>
                </div>
              ) : (
                volunteers.map(vol => {
                  const isDispatched = vol.status === 'dispatched';
                  const assignedSos = isDispatched && vol.assignedSosId
                    ? sosRequests.find(s => s.id === vol.assignedSosId)
                    : null;
                  const selectedSosId = selectedSosForVol[vol.id] || '';

                  return (
                    <div
                      key={vol.id}
                      className={`grid grid-cols-12 gap-2 px-5 py-3.5 items-center text-xs transition-all duration-150 ${
                        isDispatched
                          ? 'bg-amber-500/3 hover:bg-amber-500/6'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      {/* Name & GPS */}
                      <div className="col-span-3">
                        <span className="font-bold text-slate-100 text-sm block">{vol.name}</span>
                        <span className="flex items-center text-[9px] text-slate-600 font-mono mt-0.5">
                          <MapPin className="w-2.5 h-2.5 mr-1 flex-shrink-0" />
                          {vol.location[0].toFixed(3)}, {vol.location[1].toFixed(3)}
                        </span>
                      </div>

                      {/* Skill */}
                      <div className="col-span-2">
                        <span className={`text-[9px] px-2 py-1 rounded-md border font-black inline-block ${getSkillColor(vol.skill)}`}>
                          {getSkillLabel(vol.skill)}
                        </span>
                      </div>

                      {/* Transport */}
                      <div className="col-span-2 flex items-center space-x-1.5 text-slate-400">
                        <Truck className="w-3 h-3 text-slate-600 flex-shrink-0" />
                        <span className="font-semibold text-[10px]">{getVehicleLabel(vol.vehicle)}</span>
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        {isDispatched ? (
                          <span className="flex items-center space-x-1.5 text-amber-400 font-black text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span>DEPLOYED</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-1.5 text-emerald-400 font-black text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>STANDBY</span>
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-3 flex justify-end">
                        {isDispatched ? (
                          <div className="flex flex-col items-end space-y-1 text-right">
                            {assignedSos ? (
                              <>
                                <span className="text-[9px] text-slate-500 font-semibold">
                                  {assignedSos.isFake ? '⚠️ SUSPICIOUS · ' : ''}Target: <span className="text-slate-300">{assignedSos.name}</span>
                                </span>
                                <span className="text-[9px] text-amber-500 font-mono">
                                  {getDistanceKM(vol.location, assignedSos.location).toFixed(2)} km away
                                </span>
                              </>
                            ) : (
                              <span className="text-[9px] text-slate-600 italic">SOS resolved</span>
                            )}
                            <button
                              onClick={() => handleRecall(vol.id)}
                              className="flex items-center space-x-1 px-2.5 py-1 rounded-md border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition font-bold text-[9px] mt-1"
                            >
                              <UserMinus className="w-3 h-3" />
                              <span>Recall Unit</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <select
                              value={selectedSosId}
                              onChange={(e) => handleSelectSos(vol.id, e.target.value)}
                              className="px-2 py-1.5 rounded-md border border-slate-700 bg-slate-950 text-slate-300 focus:border-sky-500 focus:outline-none text-[10px] font-medium w-40"
                            >
                              <option value="">— Assign SOS —</option>
                              {pendingSosRequests.map(sos => (
                                <option key={sos.id} value={sos.id}>
                                  {sos.isFake ? '⚠️ ' : ''}{sos.name} · {getDistanceKM(vol.location, sos.location).toFixed(1)} km
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleDispatch(vol.id)}
                              disabled={!selectedSosId}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md font-black text-[10px] transition-all ${
                                selectedSosId
                                  ? 'border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 cursor-pointer'
                                  : 'border border-slate-800 bg-slate-900/50 text-slate-700 cursor-not-allowed'
                              }`}
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Dispatch</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TACTICAL SQUADS */}
        {activeSection === 'squads' && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Radio className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-slate-100 text-sm">NDRF & Military Emergency Squads</span>
              </div>
              <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                {activeMissions} MISSIONS ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/60 text-[9px] font-black uppercase tracking-widest text-slate-500">
              <div className="col-span-4">Squad / Base</div>
              <div className="col-span-2">Unit Type</div>
              <div className="col-span-2">Coordinates</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2 text-right">Directive</div>
            </div>

            <div className="divide-y divide-slate-800/50">
              {rescueTeams.map(team => {
                const baseShelter = shelters.find(sh => sh.id === team.baseShelterId);
                const targetSos = team.targetSosId ? sosRequests.find(s => s.id === team.targetSosId) : null;
                const typeColors: Record<string, string> = {
                  air: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-400',
                  medical: 'border-rose-500/25 bg-rose-500/10 text-rose-400',
                  ground: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
                };
                const statusConfig: Record<string, { color: string; dot: string }> = {
                  idle: { color: 'text-sky-400', dot: 'bg-sky-400' },
                  en_route: { color: 'text-amber-400', dot: 'bg-amber-400' },
                  rescuing: { color: 'text-red-400', dot: 'bg-red-400' },
                  returning: { color: 'text-emerald-400', dot: 'bg-emerald-400' },
                };
                const sc = statusConfig[team.status];

                return (
                  <div key={team.id} className="grid grid-cols-12 gap-2 px-5 py-4 items-center text-xs hover:bg-slate-800/20 transition-colors">
                    <div className="col-span-4">
                      <span className="font-bold text-slate-100 text-sm block">{team.name}</span>
                      <span className="text-[9px] text-slate-600 mt-0.5 block">
                        Base: {baseShelter ? baseShelter.name.split(' (')[0] : 'Relief Base'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className={`text-[9px] px-2 py-0.5 rounded border font-black inline-block ${typeColors[team.type]}`}>
                        {team.type === 'air' ? '✈ AIR' : team.type === 'medical' ? '⚕ MEDICAL' : '⚙ GROUND'}
                      </span>
                    </div>
                    <div className="col-span-2 font-mono text-[9px] text-slate-500">
                      {team.location[0].toFixed(3)}<br />{team.location[1].toFixed(3)}
                    </div>
                    <div className="col-span-2">
                      <span className={`flex items-center space-x-1.5 font-black text-[10px] ${sc.color} ${team.status !== 'idle' ? 'animate-pulse' : ''}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        <span className="capitalize">{team.status.replace('_', ' ')}</span>
                      </span>
                    </div>
                    <div className="col-span-2 text-right text-[10px]">
                      {team.status === 'idle' && <span className="text-slate-600 italic font-medium">Holding</span>}
                      {team.status === 'en_route' && targetSos && (
                        <div>
                          <span className="font-black text-amber-400 block">INTERCEPT</span>
                          <span className="text-slate-500 truncate block text-[9px]">{targetSos.name}</span>
                        </div>
                      )}
                      {team.status === 'rescuing' && targetSos && (
                        <div>
                          <span className="font-black text-red-400 block">EXTRACTING</span>
                          <span className="text-slate-500 text-[9px]">{targetSos.occupants} civilians</span>
                        </div>
                      )}
                      {team.status === 'returning' && (
                        <div>
                          <span className="font-black text-emerald-400 block">MISSION ✓</span>
                          <span className="text-slate-500 text-[9px]">Returning</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SHELTERS */}
        {activeSection === 'shelters' && (
          <div className="space-y-3">
            {shelters.map(shelter => {
              const pct = shelter.capacity > 0 ? Math.round((shelter.occupants / shelter.capacity) * 100) : 0;
              const barColor = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
              const statusColor = shelter.status === 'full' ? 'text-red-400 border-red-500/25 bg-red-500/10' : 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10';
              const powerColor = shelter.powerStatus === 'stable' ? 'text-emerald-400' : shelter.powerStatus === 'backup' ? 'text-amber-400' : 'text-red-400';

              return (
                <div key={shelter.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-100 text-sm block">{shelter.name}</span>
                        <span className="text-[9px] text-slate-600 font-mono">
                          {shelter.location[0].toFixed(4)}, {shelter.location[1].toFixed(4)}
                        </span>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${statusColor}`}>
                      {shelter.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Capacity bar */}
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Occupancy</span>
                      <span className="text-[10px] font-black text-slate-300">{shelter.occupants} / {shelter.capacity} <span className="text-slate-600 font-normal">pax</span></span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-slate-600">{pct}% capacity used</span>
                      <span className="text-[9px] text-slate-600">{shelter.capacity - shelter.occupants} spaces free</span>
                    </div>
                  </div>

                  {/* Status chips */}
                  <div className="flex items-center space-x-2">
                    <span className="flex items-center space-x-1 text-[9px] bg-slate-800 border border-slate-700 rounded px-2 py-1 font-semibold">
                      <Zap className={`w-2.5 h-2.5 ${powerColor}`} />
                      <span className={powerColor}>Power: {shelter.powerStatus}</span>
                    </span>
                    <span className="flex items-center space-x-1 text-[9px] bg-slate-800 border border-slate-700 rounded px-2 py-1 font-semibold">
                      <Activity className="w-2.5 h-2.5 text-sky-400" />
                      <span className="text-sky-400">Water: {shelter.waterLevel}%</span>
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full ml-1 overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full" style={{ width: `${shelter.waterLevel}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {shelters.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                <Package className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-semibold">No shelters active in this sector</p>
              </div>
            )}
          </div>
        )}

        {/* SOS QUEUE */}
        {activeSection === 'sos' && (
          <div className="space-y-3">
            {pendingSosRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                <CheckCircle className="w-10 h-10 mb-3 opacity-40 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-700">All SOS cases resolved</p>
                <p className="text-xs text-slate-600 mt-1">No pending emergency beacons in {selectedCity}</p>
              </div>
            ) : (
              pendingSosRequests.map((sos, idx) => {
                const sevColor = sos.severity === 'critical' ? 'border-red-500/30 bg-red-500/8' : sos.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/8' : 'border-slate-700 bg-slate-900/40';
                const textCol = sos.severity === 'critical' ? 'text-red-400' : sos.severity === 'medium' ? 'text-amber-400' : 'text-slate-400';
                const nearestShelter = shelters.reduce<typeof shelters[0] | null>((nearest, s) => {
                  if (!nearest) return s;
                  return getDistanceKM(sos.location, s.location) < getDistanceKM(sos.location, nearest.location) ? s : nearest;
                }, null);

                return (
                  <div key={sos.id} className={`border rounded-xl p-4 ${sevColor} hover:border-opacity-60 transition-all`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${textCol} border ${sevColor}`}>
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-100 text-sm">{sos.name}</span>
                            {sos.isFake && (
                              <span className="text-[8px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                                ⚠ AI SUSPICIOUS
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-wider ${textCol}`}>
                            {sos.severity} PRIORITY · {sos.type.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-400">
                        <Users className="w-3 h-3" />
                        <span>{sos.occupants} trapped</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 mb-3 leading-relaxed bg-slate-950/40 rounded-lg px-3 py-2 border border-slate-800/50">
                      "{sos.message}"
                    </p>

                    <div className="flex items-center justify-between text-[9px]">
                      <div className="flex items-center space-x-3 text-slate-600">
                        <span className="flex items-center space-x-1">
                          <MapPin className="w-2.5 h-2.5" />
                          <span className="font-mono">{sos.location[0].toFixed(4)}, {sos.location[1].toFixed(4)}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{sos.timestamp}</span>
                        </span>
                      </div>
                      {nearestShelter && (
                        <span className="flex items-center space-x-1 text-emerald-600 font-semibold">
                          <Shield className="w-2.5 h-2.5" />
                          <span>Shelter: {getDistanceKM(sos.location, nearestShelter.location).toFixed(1)} km</span>
                        </span>
                      )}
                    </div>

                    {sos.isOfflineQueued && (
                      <div className="mt-2 text-[9px] text-amber-500 font-bold bg-amber-500/5 border border-amber-500/15 rounded px-2.5 py-1 flex items-center space-x-1.5">
                        <Radio className="w-2.5 h-2.5" />
                        <span>Queued via offline mesh — will sync on reconnect</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
