import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { socket } from '../services/socketClient';
import { GoogleMap, useJsApiLoader, Marker as GoogleMarker, Circle as GoogleCircle, InfoWindow as GoogleInfoWindow } from '@react-google-maps/api';
import { AlertTriangle, MapPin, Truck, CheckCircle, Navigation, ExternalLink, Droplet, Moon, Sun } from 'lucide-react';
import { ref, get } from 'firebase/database';
import { database } from '../services/firebase';
import { useTheme } from '../context/ThemeContext';

const getDisasterEmoji = (type: string) => {
  const m: Record<string, string> = {
    'Flood': '🌊', 'Coastal Flooding': '🌊', 'Cyclone': '🌪️', 'Tree Fall': '🌳', 'Landslide': '🪨',
    'Fire Accident': '🔥', 'Boat Accident': '🚢', 'Beach Drowning': '🏊',
    'Building Collapse': '🏢', 'Earthquake': '🏚️'
  };
  return m[type] || '⚠️';
};

export default function AdminInterface() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });
  const mapRef = useRef<google.maps.Map | null>(null);

  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [firebaseUserProfile, setFirebaseUserProfile] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isDeployingBounty, setIsDeployingBounty] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const { theme, toggleTheme } = useTheme();

  const handleDeployBounty = (reportId: string) => {
    setIsDeployingBounty(true);
    // Simulate MetaMask/Web3 Loading Delay
    setTimeout(() => {
      socket.emit('deploy_bounty', { reportId, bountyAmount: 500 });
      setIsDeployingBounty(false);
      toast.success('Smart Contract Escrow Locked: 500 USDC', { icon: '💎' });
    }, 2500);
  };

  useEffect(() => {
    if (selectedReport && selectedReport.userId) {
      const userRef = ref(database, 'users/' + selectedReport.userId);
      get(userRef).then((snapshot) => {
        if (snapshot.exists()) {
          setFirebaseUserProfile(snapshot.val());
        } else {
          setFirebaseUserProfile(null);
        }
      }).catch((err) => console.error("Firebase fetch error:", err));
    } else {
      setFirebaseUserProfile(null);
    }

    // Join the chat room for this report so admin can see messages
    if (selectedReport?._id) {
      setChatMessages([]);
      socket.emit('join_chat_room', `chat_${selectedReport._id}`);
    }
  }, [selectedReport?._id]);

  useEffect(() => {
    if (mapRef.current && flyTarget) {
      mapRef.current.panTo({ lat: flyTarget[0], lng: flyTarget[1] });
      mapRef.current.setZoom(14);
    }
  }, [flyTarget]);

  useEffect(() => {
    fetchData();

    socket.on('new_disaster_alert', (report) => {
      setReports((prev) => [report, ...prev]);
      toast.error(`NEW ALERT: ${report.disasterType} reported at ${report.address}`, { duration: 5000 });
      setFlyTarget([report.coordinates.lat, report.coordinates.lng]);
    });

    socket.on('status_updated', (updatedReport) => {
      setReports((prev) => prev.map(r => r._id === updatedReport._id ? updatedReport : r));
      if (selectedReport?._id === updatedReport._id) {
        setSelectedReport(updatedReport);
      }
      fetchData(); // Refresh teams availability
    });

    socket.on('new_message', (msg: any) => {
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return () => {
      socket.off('new_disaster_alert');
      socket.off('status_updated');
      socket.off('new_message');
    };
  }, [selectedReport]);

  const fetchData = async () => {
    try {
      const [reportsRes, teamsRes] = await Promise.all([
        axios.get('http://localhost:5000/api/reports'),
        axios.get('http://localhost:5000/api/teams')
      ]);
      setReports(reportsRes.data);
      setTeams(teamsRes.data);
    } catch (err) {
      toast.error('Failed to connect to backend database.');
    }
  };

  const getDistance = (p1: any, p2: any) => {
    const dLat = p1.lat - p2.lat;
    const dLng = p1.lng - p2.lng;
    return Math.sqrt(dLat * dLat + dLng * dLng) * 111; 
  };

  const handleAssignTeam = (reportId: string, teamId: string) => {
    socket.emit('assign_team', { reportId, teamId });
    toast.loading('Assigning team...', { id: 'assign' });
    setTimeout(() => toast.success('Team successfully dispatched!', { id: 'assign' }), 500);
    // Clear old chat and join new room
    setChatMessages([]);
    socket.emit('join_chat_room', `chat_${reportId}`);
  };

  const handleResolve = (reportId: string) => {
    socket.emit('resolve_issue', { reportId });
    toast.success('Issue marked as resolved.');
    setSelectedReport(null);
  };

  const activeReports = reports.filter(r => r.status !== 'resolved');
  const resolvedReports = reports.filter(r => r.status === 'resolved');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans h-screen overflow-hidden transition-colors duration-500">
      <header className="bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center z-10 shadow-lg transition-colors duration-500">
        <div>
          <h1 className="text-xl font-bold text-sky-500 dark:text-sky-400">National Disaster Dashboard</h1>
          <p className="text-xs text-slate-500 dark:text-slate-500">Live Administration & Dispatch Console</p>
        </div>
        <div className="flex space-x-4 items-center">
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition shadow-inner border border-slate-200 dark:border-slate-700"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <div className="bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg flex items-center shadow-inner">
            <AlertTriangle className="w-4 h-4 text-red-500 mr-2 animate-pulse" />
            <span className="text-sm font-bold text-red-400">{activeReports.length} Active Alerts</span>
          </div>
          <span className="text-sm bg-sky-500/20 text-sky-400 px-3 py-1.5 rounded-lg items-center border border-sky-500/20 hidden sm:flex">
            <span className="w-2 h-2 bg-sky-500 rounded-full mr-2"></span>
            Socket.IO Synced
          </span>
          <button onClick={() => navigate('/user')} className="text-sm font-bold text-emerald-400 hover:text-emerald-300 flex items-center transition-colors border border-emerald-500/30 px-3 py-1.5 rounded-lg bg-emerald-500/10">
            User Portal <ExternalLink className="w-4 h-4 ml-2" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Cinematic Sidebar Glow */}
        <div className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-b from-sky-900/10 via-transparent to-emerald-900/10 pointer-events-none z-0"></div>

        {/* Left Sidebar */}
        <div className="w-1/3 bg-white/60 dark:bg-[#070b1a]/80 backdrop-blur-3xl border-r border-slate-200 dark:border-white/5 flex flex-col h-full z-10 shadow-[20px_0_40px_-15px_rgba(0,0,0,0.3)] overflow-y-auto custom-scrollbar">
          
          <div className="p-5 border-b border-slate-200 dark:border-white/5 sticky top-0 bg-white/90 dark:bg-[#070b1a]/90 backdrop-blur-xl z-20 shadow-sm">
            <h2 className="font-black text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-blue-600 dark:from-sky-400 dark:to-blue-500 flex items-center">
              <span className="w-2 h-2 bg-sky-500 rounded-full mr-3 animate-ping"></span>
              LIVE INCIDENT FEED
            </h2>
          </div>
          
          <div className="p-4 space-y-3">
            {activeReports.length === 0 ? (
              <div className="text-center py-10 bg-slate-100/50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                <CheckCircle className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2 opacity-50" />
                <p className="text-slate-500 dark:text-slate-500 text-sm font-bold tracking-wider uppercase">No active incidents</p>
              </div>
            ) : (
              activeReports.map((report) => (
                <div 
                  key={report._id} 
                  onClick={() => {
                    setSelectedReport(report);
                    setFlyTarget([report.coordinates.lat, report.coordinates.lng]);
                  }}
                  className={`group relative p-4 rounded-2xl cursor-pointer transition-all duration-300 ${
                    selectedReport?._id === report._id 
                      ? 'bg-white dark:bg-slate-800/80 border-sky-400 dark:border-sky-500/50 shadow-[0_10px_30px_rgba(56,189,248,0.15)] transform scale-[1.02]' 
                      : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-white/5 hover:border-sky-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800/50 hover:shadow-xl'
                  } border`}
                >
                  {/* Selection Indicator Glow */}
                  {selectedReport?._id === report._id && (
                    <div className="absolute inset-0 bg-sky-500/5 rounded-2xl pointer-events-none"></div>
                  )}

                  <div className="flex justify-between items-start mb-3 relative z-10">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{getDisasterEmoji(report.disasterType)}</span>
                      <span className="font-black text-slate-800 dark:text-slate-200 tracking-tight">{report.disasterType}</span>
                    </div>
                    <span className={`text-[9px] px-2.5 py-1 rounded-full uppercase font-black tracking-widest border ${
                      report.status === 'pending' 
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                    }`}>
                      {report.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex items-start mb-3 relative z-10 font-medium">
                    <MapPin className="w-4 h-4 mr-1.5 text-rose-500 flex-shrink-0" />
                    <span className="line-clamp-2 leading-relaxed">{report.address}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-500 font-mono flex items-center justify-between border-t border-slate-200 dark:border-slate-800/50 pt-3 relative z-10">
                    <span>{new Date(report.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded font-bold text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                      {report.userName}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-5 border-b border-t border-slate-200 dark:border-white/5 sticky top-0 bg-white/90 dark:bg-[#070b1a]/90 backdrop-blur-xl z-20 shadow-sm mt-2">
            <h2 className="font-black text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500 flex items-center">
              <CheckCircle className="w-5 h-5 text-emerald-500 mr-2" />
              RESOLVED CASES
            </h2>
          </div>

          <div className="p-4 space-y-3 mb-6">
            {resolvedReports.length === 0 ? (
              <div className="text-center py-6 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-900/30">
                <p className="text-emerald-600 dark:text-emerald-700 text-sm font-bold tracking-wider uppercase">No resolved cases yet</p>
              </div>
            ) : (
              resolvedReports.map((report) => (
                <div 
                  key={report._id} 
                  onClick={() => {
                    setSelectedReport(report);
                    setFlyTarget([report.coordinates.lat, report.coordinates.lng]);
                  }}
                  className="group relative p-4 rounded-2xl border border-slate-200 dark:border-emerald-900/30 bg-slate-50 dark:bg-slate-900/20 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all duration-300 shadow-sm hover:shadow-md"
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl opacity-80">{getDisasterEmoji(report.disasterType)}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{report.disasterType}</span>
                    </div>
                    <span className="text-[9px] px-2.5 py-1 rounded-full uppercase font-black tracking-widest bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                      Resolved
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex items-start mb-3 font-medium">
                    <MapPin className="w-3.5 h-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                    <span className="line-clamp-2">{report.address}</span>
                  </div>
                  <div className="bg-white dark:bg-black/20 p-3 rounded-xl border border-slate-200 dark:border-white/5 flex flex-col space-y-1">
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                      Handled By: {report.assignedTeam?.teamName || 'Unknown Team'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      Resolved At: {report.resolvedAt ? new Date(report.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Time Unknown'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Map Area */}
        <div className="w-2/3 flex flex-col relative h-full bg-slate-50 dark:bg-slate-900">
          <div className="flex-1 relative z-0">
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={{ lat: 15.2993, lng: 74.1240 }} /* Default to State of Goa */
                zoom={10}
                onLoad={(map) => { mapRef.current = map; }}
                options={{
                  disableDefaultUI: true,
                  zoomControl: true,
                  mapTypeId: 'hybrid'
                }}
              >
                {/* Active Disaster Markers */}
                {activeReports.map(report => {
                  // Determine special symbol based on disaster type
                  let iconUrl = 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
                  if (report.disasterType.toLowerCase().includes('fire')) iconUrl = 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png';
                  if (report.disasterType.toLowerCase().includes('flood') || report.disasterType.toLowerCase().includes('drown')) iconUrl = 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';
                  if (report.disasterType.toLowerCase().includes('tree') || report.disasterType.toLowerCase().includes('landslide')) iconUrl = 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png';

                  return (
                  <React.Fragment key={report._id}>
                    <GoogleMarker
                      position={{ lat: report.coordinates.lat, lng: report.coordinates.lng }}
                      icon={iconUrl}
                      onClick={() => { setSelectedReport(report); setFlyTarget([report.coordinates.lat, report.coordinates.lng]); }}
                    />
                    {selectedReport?._id === report._id && (
                      <GoogleInfoWindow
                        position={{ lat: report.coordinates.lat, lng: report.coordinates.lng }}
                        onCloseClick={() => setSelectedReport(null)}
                      >
                        <div style={{ minWidth: 160, color: '#000' }}>
                          <p style={{ fontWeight: 'bold', marginBottom: 4 }}>🚨 {report.disasterType}</p>
                          <p style={{ fontSize: 11, color: '#555' }}>{report.address}</p>
                          {report.media && <img src={report.media} alt="Evidence" style={{ width: '100%', marginTop: 6, borderRadius: 4 }} />}
                        </div>
                      </GoogleInfoWindow>
                    )}
                    <GoogleCircle
                      center={{ lat: report.coordinates.lat, lng: report.coordinates.lng }}
                      radius={3000}
                      options={{ strokeColor: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, strokeWeight: 2 }}
                    />
                  </React.Fragment>
                  );
                })}

                {/* Rescue Team Markers */}
                {teams.map(team => (
                  <GoogleMarker
                    key={team._id}
                    position={{ lat: team.coordinates.lat, lng: team.coordinates.lng }}
                    icon="http://maps.google.com/mapfiles/ms/icons/green-dot.png"
                  />
                ))}
              </GoogleMap>
            ) : (
              <div className="w-full h-full bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center">
                <span className="w-12 h-12 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mb-4"></span>
                <span className="text-sky-500 font-mono tracking-widest text-xs uppercase animate-pulse">Establishing Satellite Uplink...</span>
              </div>
            )}
          </div>

          {/* Bottom Dispatch Panel */}
          {selectedReport && selectedReport.status !== 'resolved' && (
            <div className="absolute bottom-6 left-6 right-6 bg-slate-50 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 p-5 rounded-2xl shadow-2xl backdrop-blur-md z-[500] animate-fadeIn">
              <div className="flex justify-between items-start">
                <div className="w-2/3 pr-6 border-r border-slate-300 dark:border-slate-700">
                  <div className="flex items-center space-x-3 mb-3">
                    <span className="text-xl font-bold text-white">{selectedReport.disasterType} Emergency</span>
                    <span className="bg-red-500/20 border border-red-500/50 text-red-400 text-xs px-2 py-0.5 rounded uppercase font-bold">Severity: {selectedReport.severity}</span>
                    {selectedReport.bountyActive && (
                      <span className="bg-indigo-500/20 border border-indigo-500/50 text-indigo-300 text-xs px-2 py-0.5 rounded uppercase font-bold animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                        💎 {selectedReport.bountyAmount} USDC BOUNTY ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">{selectedReport.address}</p>

                  {(() => {
                    const displayProfile = firebaseUserProfile || selectedReport.userProfile;
                    return displayProfile ? (
                    <div className="mb-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 rounded-lg flex flex-wrap gap-4 items-center shadow-inner">
                      <div><span className="text-[10px] text-slate-500 block uppercase tracking-wider">Victim</span><span className="text-sm font-bold text-sky-400">{displayProfile.fullName} ({displayProfile.age}y)</span></div>
                      <div><span className="text-[10px] text-slate-500 block uppercase tracking-wider">Contact</span><span className="text-sm font-bold text-slate-700 dark:text-slate-300">{displayProfile.phone}</span></div>
                    </div>
                  ) : null;
                  })()}
                  
                  {selectedReport.status === 'pending' ? (
                    <div>
                      <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center">
                        <Navigation className="w-3.5 h-3.5 mr-1.5" /> Nearest Compatible Rescue Teams
                      </h4>
                      <div className="space-y-2">
                        {(() => {
                          const getCompatibleTeamTypes = (disaster: string) => {
                            const map: Record<string, string[]> = {
                              'Flood': ['Water Rescue', 'Heavy Rescue'],
                              'Coastal Flooding': ['Water Rescue', 'Heavy Rescue'],
                              'Boat Accident': ['Water Rescue'],
                              'Beach Drowning': ['Water Rescue'],
                              'Fire Accident': ['Fire Rescue', 'Medical Rescue'],
                              'Building Collapse': ['Heavy Rescue', 'Fire Rescue', 'Medical Rescue'],
                              'Road Collapse': ['Heavy Rescue'],
                              'Landslide': ['Heavy Rescue'],
                              'Tree Fall': ['Heavy Rescue', 'Fire Rescue'],
                              'Power Failure': ['Power Maintenance'],
                              'Heatwave': ['Medical Rescue'],
                              'Oil Spill': ['Water Rescue', 'Heavy Rescue']
                            };
                            return map[disaster] || ['Heavy Rescue', 'Medical Rescue', 'General Rescue'];
                          };

                          const compatibleTypes = getCompatibleTeamTypes(selectedReport.disasterType);
                          
                          // Filter for available, SAME STATE, AND compatible teams. Fallback to all available in that state if none found.
                          let validTeams = teams.filter(t => t.available && t.state === selectedReport.state && compatibleTypes.includes(t.teamType));
                          if (validTeams.length === 0) validTeams = teams.filter(t => t.available && t.state === selectedReport.state);
                          
                          // Extreme fallback if NO teams in the state are available at all
                          if (validTeams.length === 0) validTeams = teams.filter(t => t.available && compatibleTypes.includes(t.teamType));

                          return validTeams.sort((a, b) => getDistance(a.coordinates, selectedReport.coordinates) - getDistance(b.coordinates, selectedReport.coordinates)).slice(0, 3).map((team: any) => {
                            const dist = getDistance(team.coordinates, selectedReport.coordinates).toFixed(1);
                            return (
                              <div key={team._id} className="flex justify-between items-center bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                                <div>
                                  <div className="font-bold text-emerald-400 text-sm">{team.teamName}</div>
                                  <div className="text-xs text-slate-500">{dist} km away • {team.teamType}</div>
                                </div>
                                <button 
                                  onClick={() => handleAssignTeam(selectedReport._id, team._id)}
                                  className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold py-1.5 px-4 rounded transition shadow-lg"
                                >
                                  DISPATCH
                                </button>
                              </div>
                            )
                          });
                        })()}
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-700">
                        <div className="flex justify-between items-center bg-indigo-950/40 p-3 rounded-lg border border-indigo-500/30">
                          <div>
                            <span className="block text-xs font-bold text-indigo-400 mb-0.5">Civilian Web3 Bounty</span>
                            <span className="text-[10px] text-indigo-200">Incentivize private rescuers</span>
                          </div>
                          <button 
                            onClick={() => handleDeployBounty(selectedReport._id)}
                            disabled={isDeployingBounty || selectedReport.bountyActive || selectedReport.bountyReleased}
                            className={`text-xs font-bold py-1.5 px-3 rounded flex items-center transition shadow-lg ${
                              selectedReport.bountyReleased 
                                ? 'bg-emerald-600 text-white cursor-default'
                                : selectedReport.bountyActive
                                ? 'bg-indigo-900 border border-indigo-500 text-indigo-300 cursor-default animate-pulse'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)]'
                            }`}
                          >
                            {isDeployingBounty ? (
                              <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2"></span>
                            ) : selectedReport.bountyReleased ? (
                              '✅ FUNDS RELEASED'
                            ) : selectedReport.bountyActive ? (
                              'ESCROW LOCKED'
                            ) : '💎 DEPLOY 500 USDC'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-900/20 border border-emerald-500/30 p-4 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-emerald-400 font-bold flex items-center">
                          <Truck className="w-5 h-5 mr-2" /> Team Dispatched Successfully
                        </div>
                        <button 
                          onClick={() => handleResolve(selectedReport._id)} 
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded shadow-lg border border-emerald-500/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all"
                        >
                          <CheckCircle className="w-3.5 h-3.5 inline mr-1" /> Mark Issue as Resolved
                        </button>
                      </div>
                      <p className="text-sm text-emerald-200">
                        {selectedReport.assignedTeam?.teamName} is currently en route to the location. Live tracking enabled for user.
                      </p>
                    </div>
                  )}

                  {/* ── ADMIN CHAT PANEL ────────────────────────────────── */}
                  {selectedReport.status === 'assigned' && (
                    <div className="mt-4 rounded-xl border border-sky-500/30 bg-white dark:bg-slate-950/60 overflow-hidden">
                      <div className="flex items-center p-3 bg-sky-950/40 border-b border-sky-500/20">
                        <span className="text-lg mr-2">📻</span>
                        <div>
                          <p className="text-xs font-bold text-sky-300">Victim Radio Channel</p>
                          <p className="text-[10px] text-sky-500/60">Replying as {selectedReport.assignedTeam?.teamName}</p>
                        </div>
                      </div>
                      <div className="h-44 overflow-y-auto p-3 space-y-2 bg-white dark:bg-slate-950/30">
                        {chatMessages.length === 0 && (
                          <p className="text-center text-slate-500 text-xs italic py-4">No messages yet. The victim will see your replies here.</p>
                        )}
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.sender !== 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
                              msg.sender !== 'user'
                                ? 'bg-sky-700/30 border border-sky-500/30 text-sky-100'
                                : 'bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                            }`}>
                              <p className="font-bold text-[10px] mb-0.5 opacity-70">{msg.sender === 'user' ? (msg.senderName || 'Victim') : (msg.senderName || 'Team')}</p>
                              <p>{msg.text}</p>
                            </div>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>
                      <div className="flex p-2 gap-2 border-t border-sky-500/20">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && chatInput.trim()) {
                              socket.emit('send_chat_message', {
                                room: `chat_${selectedReport._id}`,
                                message: chatInput.trim(),
                                sender: 'team',
                                senderName: selectedReport.assignedTeam?.teamName || 'Rescue Team',
                                disasterType: selectedReport.disasterType,
                                teamName: selectedReport.assignedTeam?.teamName
                              });
                              setChatInput('');
                            }
                          }}
                          placeholder="Send instruction to victim..."
                          className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                        />
                        <button
                          onClick={() => {
                            if (!chatInput.trim()) return;
                            socket.emit('send_chat_message', {
                              room: `chat_${selectedReport._id}`,
                              message: chatInput.trim(),
                              sender: 'team',
                              senderName: selectedReport.assignedTeam?.teamName || 'Rescue Team',
                              disasterType: selectedReport.disasterType,
                              teamName: selectedReport.assignedTeam?.teamName
                            });
                            setChatInput('');
                          }}
                          className="bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                        >Send</button>
                      </div>
                    </div>
                  )}
                  {/* ── END ADMIN CHAT ──────────────────────────────────── */}
                </div>

                <div className="w-1/3 pl-6 flex flex-col justify-center items-center h-full">
                  {selectedReport.status === 'assigned' && (
                    <button 
                      onClick={() => handleResolve(selectedReport._id)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-transform active:scale-95 flex items-center justify-center"
                    >
                      <CheckCircle className="w-5 h-5 mr-2" />
                      MARK RESOLVED
                    </button>
                  )}
                  {selectedReport.media && (
                    <div className="mt-4 text-center">
                      <span className="text-xs text-slate-500 block mb-2">Attached Media Evidence:</span>
                      {selectedReport.media.startsWith('data:image') ? (
                         <img src={selectedReport.media} alt="Evidence" className="w-full rounded-lg shadow-xl border border-slate-300 dark:border-slate-700 max-h-40 object-cover" />
                      ) : (
                         <span className="text-sm text-sky-400 underline cursor-pointer">{selectedReport.media}</span>
                      )}
                      
                      {selectedReport.aiAnalysis && (
                        <div className="mt-3 bg-slate-50 dark:bg-slate-900 border border-indigo-500/30 p-3 rounded-lg text-left">
                          <div className="text-[10px] font-mono text-indigo-400 mb-1 flex items-center uppercase tracking-widest"><ShieldAlert className="w-3 h-3 mr-1" /> AI Vision Assessment</div>
                          <div className="text-xs text-slate-700 dark:text-slate-300 mb-1"><strong>Severity:</strong> {selectedReport.aiAnalysis.severity}</div>
                          <div className="text-xs text-slate-700 dark:text-slate-300 mb-1"><strong>Casualties:</strong> {selectedReport.aiAnalysis.casualties}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 italic">"{selectedReport.aiAnalysis.analysis}"</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
