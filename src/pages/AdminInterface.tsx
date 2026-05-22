import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { socket } from '../services/socketClient';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, MapPin, Truck, CheckCircle, Navigation } from 'lucide-react';

// Leaflet icons
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});
const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});

// Helper: pan map to coordinates when selectedReport changes
function MapController({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 14, { duration: 1 }); }, [center]);
  return null;
}

export default function AdminInterface() {
  const [reports, setReports] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);

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

    return () => {
      socket.off('new_disaster_alert');
      socket.off('status_updated');
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
  };

  const handleResolve = (reportId: string) => {
    socket.emit('resolve_issue', { reportId });
    toast.success('Issue marked as resolved.');
    setSelectedReport(null);
  };

  const activeReports = reports.filter(r => r.status !== 'resolved');
  const resolvedReports = reports.filter(r => r.status === 'resolved');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans h-screen overflow-hidden">
      <header className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center z-10 shadow-lg">
        <div>
          <h1 className="text-xl font-bold text-sky-400">National Disaster Dashboard</h1>
          <p className="text-xs text-slate-500">Live Administration & Dispatch Console</p>
        </div>
        <div className="flex space-x-4 items-center">
          <div className="bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg flex items-center">
            <AlertTriangle className="w-4 h-4 text-red-500 mr-2 animate-pulse" />
            <span className="text-sm font-bold text-red-400">{activeReports.length} Active Alerts</span>
          </div>
          <span className="text-sm bg-sky-500/20 text-sky-400 px-3 py-1.5 rounded-lg flex items-center border border-sky-500/20">
            <span className="w-2 h-2 bg-sky-500 rounded-full mr-2"></span>
            Socket.IO Synced
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-1/3 bg-slate-950 border-r border-slate-800 flex flex-col h-full z-10 shadow-xl overflow-y-auto">
          <div className="p-4 border-b border-slate-800 sticky top-0 bg-slate-950">
            <h2 className="font-bold text-slate-300">Live Incident Feed</h2>
          </div>
          
          <div className="p-2 space-y-2">
            {reports.length === 0 ? (
              <p className="text-slate-500 text-center py-8 text-sm">No incidents reported yet.</p>
            ) : (
              reports.map((report) => (
                <div 
                  key={report._id} 
                  onClick={() => {
                    setSelectedReport(report);
                    setFlyTarget([report.coordinates.lat, report.coordinates.lng]);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition ${selectedReport?._id === report._id ? 'bg-slate-800 border-sky-500/50 shadow-lg' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-sky-400">{report.disasterType}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${
                      report.status === 'pending' ? 'bg-red-500/20 text-red-400' : 
                      report.status === 'assigned' ? 'bg-amber-500/20 text-amber-400' : 
                      'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {report.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-start mb-2">
                    <MapPin className="w-3.5 h-3.5 mr-1 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{report.address}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Reported: {new Date(report.timestamp).toLocaleTimeString()} by {report.userName}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Map Area */}
        <div className="w-2/3 flex flex-col relative h-full bg-slate-900">
          <div className="flex-1 relative z-0">
            <MapContainer
              center={[15.4909, 73.8278]}
              zoom={10}
              style={{ width: '100%', height: '100%' }}
              zoomControl={true}
              scrollWheelZoom={true}
            >
              <TileLayer
                url="http://localhost:8082/data/goa/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | ResqNet Offline Maps'
                errorTileUrl="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={16}
                minZoom={8}
              />
              <MapController center={flyTarget} />

              {/* Active Disaster Markers */}
              {activeReports.map(report => (
                <React.Fragment key={report._id}>
                  <Marker
                    position={[report.coordinates.lat, report.coordinates.lng]}
                    icon={redIcon}
                    eventHandlers={{ click: () => { setSelectedReport(report); setFlyTarget([report.coordinates.lat, report.coordinates.lng]); } }}
                  >
                    <Popup>
                      <div style={{ minWidth: 160 }}>
                        <p style={{ fontWeight: 'bold', marginBottom: 4 }}>🚨 {report.disasterType}</p>
                        <p style={{ fontSize: 11, color: '#555' }}>{report.address}</p>
                        {report.media && <img src={report.media} alt="Evidence" style={{ width: '100%', marginTop: 6, borderRadius: 4 }} />}
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[report.coordinates.lat, report.coordinates.lng]}
                    radius={3000}
                    pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 2 }}
                  />
                </React.Fragment>
              ))}

              {/* Rescue Team Markers */}
              {teams.map(team => (
                <Marker
                  key={team._id}
                  position={[team.coordinates.lat, team.coordinates.lng]}
                  icon={greenIcon}
                >
                  <Popup>🚑 {team.teamName} — {team.available ? 'Available' : 'Deployed'}</Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Bottom Dispatch Panel */}
          {selectedReport && selectedReport.status !== 'resolved' && (
            <div className="absolute bottom-6 left-6 right-6 bg-slate-900/95 border border-slate-700 p-5 rounded-2xl shadow-2xl backdrop-blur-md z-[500] animate-fadeIn">
              <div className="flex justify-between items-start">
                <div className="w-2/3 pr-6 border-r border-slate-700">
                  <div className="flex items-center space-x-3 mb-3">
                    <span className="text-xl font-bold text-white">{selectedReport.disasterType} Emergency</span>
                    <span className="bg-red-500/20 border border-red-500/50 text-red-400 text-xs px-2 py-0.5 rounded uppercase font-bold">Severity: {selectedReport.severity}</span>
                  </div>
                  <p className="text-sm text-slate-300 mb-4">{selectedReport.address}</p>
                  
                  {selectedReport.status === 'pending' ? (
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center">
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
                              <div key={team._id} className="flex justify-between items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800">
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
                    </div>
                  ) : (
                    <div className="bg-emerald-900/20 border border-emerald-500/30 p-4 rounded-xl">
                      <div className="text-emerald-400 font-bold mb-1 flex items-center">
                        <Truck className="w-5 h-5 mr-2" /> Team Dispatched Successfully
                      </div>
                      <p className="text-sm text-emerald-200">
                        {selectedReport.assignedTeam?.teamName} is currently en route to the location. Live tracking enabled for user.
                      </p>
                    </div>
                  )}
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
                         <img src={selectedReport.media} alt="Evidence" className="w-full rounded-lg shadow-xl border border-slate-700 max-h-40 object-cover" />
                      ) : (
                         <span className="text-sm text-sky-400 underline cursor-pointer">{selectedReport.media}</span>
                      )}
                      
                      {selectedReport.aiAnalysis && (
                        <div className="mt-3 bg-slate-900 border border-indigo-500/30 p-3 rounded-lg text-left">
                          <div className="text-[10px] font-mono text-indigo-400 mb-1 flex items-center uppercase tracking-widest"><ShieldAlert className="w-3 h-3 mr-1" /> AI Vision Assessment</div>
                          <div className="text-xs text-slate-300 mb-1"><strong>Severity:</strong> {selectedReport.aiAnalysis.severity}</div>
                          <div className="text-xs text-slate-300 mb-1"><strong>Casualties:</strong> {selectedReport.aiAnalysis.casualties}</div>
                          <div className="text-xs text-slate-400 italic">"{selectedReport.aiAnalysis.analysis}"</div>
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
