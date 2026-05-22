import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { socket } from '../services/socketClient';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, MapPin, Camera, CheckCircle, Navigation, ShieldAlert } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initKNN, classifyBase64Image, getKNNStatus, TRAINED_DISASTERS, buildRejectionMessage } from '../services/offlineKNN';

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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

// Helper to re-center map when coordinates change
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], map.getZoom()); }, [lat, lng]);
  return null;
}

const GOA_DISASTERS = [
  'Flood', 'Coastal Flooding', 'Cyclone', 'Tree Fall', 'Landslide',
  'Fire Accident', 'Boat Accident', 'Beach Drowning',
  'Building Collapse', 'Earthquake'
];

const PRECAUTIONS: Record<string, string[]> = {
  'Flood': ['Move to higher ground immediately.', 'Avoid beach-side roads and standing water.', 'Stay away from fallen electric poles.', 'Keep your mobile device charged and dry.'],
  'Cyclone': ['Stay indoors and away from windows.', 'Secure loose objects outside.', 'Keep a battery-operated radio handy.', 'Turn off main gas and electrical supplies.'],
  'Fire Accident': ['Evacuate the building immediately.', 'Do not use elevators.', 'Cover your nose and mouth with a wet cloth.', 'Stay low to the ground to avoid smoke.'],
  'Earthquake': ['Drop, cover, and hold on.', 'Stay away from glass, windows, and outside doors.', 'If outdoors, move to an open area away from buildings.', 'Do not use matches or lighters.'],
  'Landslide': ['Evacuate immediately if cracks appear.', 'Stay away from unstable slopes.', 'Listen for falling rocks.', 'Avoid hill roads.'],
  'default': ['Stay calm and wait for the rescue team.', 'Keep your phone line free for emergency calls.', 'Follow instructions from local authorities.', 'Do not move if you are severely injured.']
};

export default function UserInterface() {

  const [step, setStep] = useState<'home' | 'report' | 'tracking'>('home');
  const [disasterType, setDisasterType] = useState('');
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [address, setAddress] = useState('Fetching address...');
  const [media, setMedia] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeReport, setActiveReport] = useState<any>(null);
  
  const [directionsResponse, setDirectionsResponse] = useState<any>(null);
  const [liveEta, setLiveEta] = useState<number | null>(null);
  const [liveTeamCoords, setLiveTeamCoords] = useState<any>(null);
  const [userState, setUserState] = useState('Goa');
  const [dynamicPrecautions, setDynamicPrecautions] = useState<string[] | null>(null);
  const [knnReady, setKnnReady] = useState(false);

  // Initialise offline KNN classifier silently on app load
  useEffect(() => {
    initKNN((msg) => console.log('[KNN]', msg))
      .then(() => {
        setKnnReady(true);
        console.log('✅ Offline KNN ready for:', TRAINED_DISASTERS);
      })
      .catch((e) => console.warn('KNN init failed (will use Gemini only):', e));
  }, []);

  // Offline-cached weather averages per state (used when internet is unavailable)
  const OFFLINE_WEATHER: Record<string, {temp: number, wind: number}> = {
    'Goa': {temp: 32, wind: 18}, 'Maharashtra': {temp: 35, wind: 22},
    'Kerala': {temp: 30, wind: 15}, 'Tamil Nadu': {temp: 38, wind: 20},
    'Karnataka': {temp: 33, wind: 17}, 'Rajasthan': {temp: 42, wind: 28},
    'Gujarat': {temp: 37, wind: 25}, 'West Bengal': {temp: 34, wind: 20},
    'Odisha': {temp: 36, wind: 24}, 'Andhra Pradesh': {temp: 37, wind: 19},
  };

  // Offline precautions database — used when Gemini API is unavailable
  const OFFLINE_PRECAUTIONS: Record<string, string[]> = {
    'Flood': ['Move to the highest floor or rooftop immediately.', 'Do NOT wade through floodwater — even 15cm can sweep you off.', 'Turn off all electrical switches at the main board.', 'Signal rescuers using a bright cloth or torch from a window.'],
    'Cyclone': ['Stay indoors away from all windows and glass doors.', 'Secure all loose objects outside that could become projectiles.', 'Turn off gas and electricity at the main supply point.', 'Keep an emergency bag ready: torch, medicines, water, phone charger.'],
    'Landslide': ['Evacuate the building immediately — do not wait.', 'Move perpendicular to the slide path, never run downhill.', 'Listen for rumbling sounds — a new slide may follow.', 'Avoid all riverbanks and drainage channels until cleared.'],
    'Fire Accident': ['Evacuate immediately — close all doors behind you to slow fire.', 'Stay low to the ground to avoid toxic smoke inhalation.', 'Touch door handles before opening — if hot, use another exit.', 'Meet at the pre-agreed assembly point outside.'],
    'Earthquake': ['Drop, cover your head, and hold on under a sturdy table.', 'Stay away from windows, heavy furniture and exterior walls.', 'If outdoors, move away from buildings, trees and power lines.', 'Expect aftershocks — stay prepared for 72 hours.'],
    'Tree Fall': ['Stay inside your vehicle or building until the tree is cleared.', 'Do not attempt to move fallen trees near power lines.', 'Check for gas leaks if the tree damaged a building.', 'Keep road clear for emergency vehicles — do not crowd.'],
    'Building Collapse': ['Do not enter the collapsed structure — risk of secondary collapse.', 'Make noise (shout, bang pipes) to help rescuers locate survivors.', 'Cover your nose with a cloth to filter dust.', 'Stay still to conserve oxygen and energy if trapped.'],
    'Beach Drowning': ['Do NOT jump in to save a drowning person unless trained.', 'Throw a rope, lifebuoy or any floating object to the victim.', 'Call 112 immediately and shout for a lifeguard.', 'Keep the victim warm and in recovery position after rescue.'],
    'default': ['Stay calm and conserve your phone battery.', 'Move away from the danger zone if it is safe to do so.', 'Call 112 (National Emergency Number).', 'Follow instructions from local authorities strictly.']
  };

  useEffect(() => {
    if (activeReport && !dynamicPrecautions) {
      const fetchAIPrecautions = async () => {
        let weatherContext = "";

        // Try live weather — fall back to cached state averages
        try {
          const lat = activeReport.coordinates.lat;
          const lng = activeReport.coordinates.lng;
          const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`, { timeout: 4000 });
          const temp = weatherRes.data?.current_weather?.temperature;
          const wind = weatherRes.data?.current_weather?.windspeed;
          if (temp !== undefined && wind !== undefined) {
            weatherContext = `The current live weather at their exact location is ${temp}°C with wind speeds of ${wind} km/h.`;
          }
        } catch {
          const cached = OFFLINE_WEATHER[activeReport.state || userState] || OFFLINE_WEATHER['Goa'];
          weatherContext = `Average weather for ${activeReport.state || userState}: ~${cached.temp}°C, wind ~${cached.wind} km/h.`;
          console.warn('Weather offline — using cached data');
        }

        // Try Gemini AI — fall back to local precautions database
        try {
          const genAI = new GoogleGenerativeAI('AIzaSyA1uhtV1BczhkTxjqzYtYbScsrdR-WcZBk');
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
          const prompt = `Act as an emergency responder. A civilian in ${activeReport.state || userState}, India has just reported a ${activeReport.disasterType} emergency. ${weatherContext} Give exactly 4 extremely short, critical safety instructions for the next 10 minutes until help arrives. Make them highly specific to the geography, climate, and environment of ${activeReport.state || userState}, strictly factoring in the current weather conditions if provided. Return strictly a JSON array of strings, nothing else.`;
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            setDynamicPrecautions(JSON.parse(match[0]));
          } else {
            throw new Error('No JSON array in response');
          }
        } catch (err) {
          console.warn('Gemini offline — using local precautions database');
          const fallback = OFFLINE_PRECAUTIONS[activeReport.disasterType] || OFFLINE_PRECAUTIONS['default'];
          setDynamicPrecautions(fallback);
        }
      };
      fetchAIPrecautions();
    }
  }, [activeReport, dynamicPrecautions, userState]);

  useEffect(() => {
    const handleStatusUpdated = (report: any) => {
      setActiveReport((prev: any) => {
        if (prev && report._id === prev._id) {
          if (report.status === 'assigned' && prev.status !== 'assigned') {
            toast.success(`Rescue Team Dispatched: ${report.assignedTeam?.teamName}`, { duration: 5000 });
            calculateRoute(report);
          } else if (report.status === 'resolved') {
            toast.success('Issue marked as Resolved by Admin!');
            setStep('home');
            setDirectionsResponse(null);
            setLiveEta(null);
            setLiveTeamCoords(null);
            return null; // Clear active report
          }
          return report;
        }
        return prev;
      });
    };

    const handleReportSuccess = (report: any) => {
      setActiveReport(report);
      setStep('tracking');
      setIsSubmitting(false);
      // We already show a toast in optimistic update, so no need here unless desired
    };

    socket.on('status_updated', handleStatusUpdated);
    socket.on('report_submitted_success', handleReportSuccess);

    return () => {
      socket.off('status_updated', handleStatusUpdated);
      socket.off('report_submitted_success', handleReportSuccess);
    };
  }, []); // Run once, no dependencies!

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (activeReport?.status === 'assigned' && activeReport.assignedTeam) {
      // 1. Calculate Initial ETA based on straight-line distance
      const lat1 = activeReport.coordinates.lat;
      const lon1 = activeReport.coordinates.lng;
      const lat2 = activeReport.assignedTeam.coordinates.lat;
      const lon2 = activeReport.assignedTeam.coordinates.lng;
      const distKm = Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2)) * 111;
      const initialMinutes = Math.max(1, Math.round((distKm / 40) * 60));
      
      if (liveEta === null) {
        setLiveEta(initialMinutes);
        setLiveTeamCoords(activeReport.assignedTeam.coordinates);
      }

      // 2. Start Live Simulation Interval (Moves the marker and ticks down time)
      interval = setInterval(() => {
        setLiveEta(prev => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(interval);
            setLiveTeamCoords(activeReport.coordinates); // Snap to exact destination
            return 0;
          }
          return prev - 1;
        });
        
        setLiveTeamCoords((prev: any) => {
          if (!prev) return prev;
          const dLat = activeReport.coordinates.lat - prev.lat;
          const dLng = activeReport.coordinates.lng - prev.lng;
          // Move 15% of the remaining distance per tick so it noticeably approaches
          return { lat: prev.lat + dLat * 0.15, lng: prev.lng + dLng * 0.15 };
        });
      }, 1500); // Tick every 1.5 seconds
    } else {
      setLiveEta(null);
      setLiveTeamCoords(null);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeReport?.status, activeReport?.assignedTeam]);

  const calculateRoute = async (report: any) => {
    if (!report.assignedTeam || !report.coordinates || !window.google) return;
    
    try {
      const directionsService = new window.google.maps.DirectionsService();
      const results = await directionsService.route({
        origin: report.assignedTeam.coordinates, // Team's location
        destination: report.coordinates, // User's location
        travelMode: window.google.maps.TravelMode.DRIVING,
      });
      setDirectionsResponse(results);
    } catch (err) {
      console.error('Error fetching directions, falling back to simulated live tracking', err);
      setDirectionsResponse('FAILED'); 
    }
  };

  const startReport = () => setStep('report');

  const handleDisasterSelect = (type: string) => {
    setDisasterType(type);
    toast.loading('Detecting live location...', { id: 'gps' });
    
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLocation({ lat, lng });
          toast.success('Location acquired', { id: 'gps' });
          
          try {
            // Primary: Nominatim (OpenStreetMap) reverse geocoding
            const res = await axios.get(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
              { timeout: 4000 }
            );
            if (res.data && res.data.display_name) {
              setAddress(res.data.display_name);
              if (res.data.address && res.data.address.state) {
                setUserState(res.data.address.state);
              }
            }
          } catch {
            // Fallback 1: BigDataCloud (different server, might work when Nominatim doesn't)
            try {
              const res2 = await axios.get(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
                { timeout: 4000 }
              );
              if (res2.data && res2.data.locality) {
                const addr = [res2.data.locality, res2.data.principalSubdivision, res2.data.countryName]
                  .filter(Boolean).join(', ');
                setAddress(addr);
                if (res2.data.principalSubdivision) setUserState(res2.data.principalSubdivision);
              } else throw new Error('no data');
            } catch {
              // Fallback 2: Offline coordinate-based area lookup for Goa
              const GOA_AREAS: { lat: number; lng: number; name: string }[] = [
                { lat: 15.5009, lng: 73.8278, name: 'Panaji, North Goa, Goa' },
                { lat: 15.5918, lng: 73.8178, name: 'Mapusa, North Goa, Goa' },
                { lat: 15.2993, lng: 74.1240, name: 'Margao, South Goa, Goa' },
                { lat: 15.5493, lng: 73.7580, name: 'Calangute, North Goa, Goa' },
                { lat: 15.6130, lng: 73.7521, name: 'Anjuna, North Goa, Goa' },
                { lat: 15.4793, lng: 73.8313, name: 'Porvorim, North Goa, Goa' },
                { lat: 15.3560, lng: 73.9780, name: 'Ponda, North Goa, Goa' },
                { lat: 15.6638, lng: 73.7910, name: 'Pernem, North Goa, Goa' },
                { lat: 15.2133, lng: 74.0230, name: 'Quepem, South Goa, Goa' },
                { lat: 15.3730, lng: 73.8310, name: 'Vasco da Gama, South Goa, Goa' },
                { lat: 15.4925, lng: 73.9225, name: 'Old Goa, North Goa, Goa' },
              ];
              // Find nearest known area using distance formula
              let nearest = GOA_AREAS[0];
              let minDist = Infinity;
              for (const area of GOA_AREAS) {
                const d = Math.sqrt(Math.pow(area.lat - lat, 2) + Math.pow(area.lng - lng, 2));
                if (d < minDist) { minDist = d; nearest = area; }
              }
              setAddress(`Near ${nearest.name} (GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)})`);
              setUserState('Goa');
            }
          }
        },
        (error) => {
          toast.error('Location access denied. Using fallback coordinates.', { id: 'gps' });
          setLocation({ lat: 15.4909, lng: 73.8278 }); // Fallback Panaji, Goa
          setAddress('Panaji, North Goa, Goa, India');
          setUserState('Goa');
        }
      );
    } else {
      toast.error('Geolocation not supported by your browser.', { id: 'gps' });
    }
  };

  const [mediaData, setMediaData] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setMedia(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!location || !disasterType) return;
    setIsSubmitting(true);

    // --- OFFLINE-FIRST AI VISION VERIFICATION ---
    let aiDecisionToPass: any = null;

    if (mediaData) {
      const knnStatus = getKNNStatus();

      if (TRAINED_DISASTERS.includes(disasterType)) {
        if (!knnStatus.isReady) {
          toast.error('⚠️ Offline AI is still loading. Please wait a few seconds and try again.', { id: 'submit', duration: 4000 });
          setIsSubmitting(false);
          return;
        }

        // ✅ KNN is ready — run classification
        toast.loading('🧠 Offline AI scanning image...', { id: 'submit' });
        try {
          const knnResult = await classifyBase64Image(mediaData);
          if (knnResult.isReady && knnResult.predictedClass !== disasterType) {
            // ❌ Wrong image — show reason and block
            toast.error(
              buildRejectionMessage(disasterType, knnResult.predictedClass, knnResult.confidence),
              { id: 'submit', duration: 10000 }
            );
            setIsSubmitting(false);
            return;
          }
          // ✅ Match — proceed
          aiDecisionToPass = {
            match: true,
            detected: disasterType,
            severity: 'High',
            casualties: 'Unknown',
            analysis: `[Offline AI] ${disasterType} confirmed — ${knnResult.confidence}% match.`,
            offline: true
          };
          toast.success(`✅ Offline AI: ${disasterType} confirmed (${knnResult.confidence}%)`, { id: 'submit', duration: 2000 });
        } catch (err) {
          console.error("Offline AI Error:", err);
          toast.error('❌ Could not verify image. Ensure it is a clear picture and try again.', { id: 'submit', duration: 4000 });
          setIsSubmitting(false);
          return;
        }

      } else {
        // Disaster not trained — allow through
        aiDecisionToPass = { match: true, detected: disasterType, severity: 'High', casualties: 'Unknown', analysis: '[Offline] Manual review required.', offline: true };
        toast.success('📡 Image accepted. Transmitting...', { id: 'submit', duration: 2000 });
      }
    } else {
      toast.loading('Transmitting alert...', { id: 'submit' });
    }

    const reportPayload = {
      _id: 'rep_' + Date.now().toString(),
      userName: 'Civilian User',
      disasterType,
      coordinates: location,
      address,
      state: userState,
      media: mediaData,
      severity: aiDecisionToPass?.severity || 'High',
      aiAnalysis: aiDecisionToPass,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    // Emit to backend — works over local Socket.io (no internet needed)
    socket.emit('submit_report', reportPayload);

    // Optimistic UI update: transition instantly!
    toast.dismiss('submit');
    toast.success('Alert sent to national dashboard!');
    setActiveReport(reportPayload);
    setStep('tracking');
    setIsSubmitting(false);
  };

  const precautionsList = PRECAUTIONS[activeReport?.disasterType] || PRECAUTIONS['default'];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
        <h1 className="text-xl font-bold text-sky-400">ResqNet Eco-System</h1>
        <span className="text-sm bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full flex items-center border border-emerald-500/20">
          <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
          User Portal
        </span>
      </header>

      <main className="flex-grow p-6 max-w-2xl mx-auto w-full">
        {step === 'home' && (
          <div className="space-y-6 text-center mt-12">
            <h2 className="text-3xl font-bold">National Disaster Response</h2>
            <p className="text-slate-400 mb-8">Fast, intelligent, and coordinated rescue platform.</p>
            
            <button 
              onClick={startReport}
              className="w-full bg-red-600 hover:bg-red-500 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center shadow-lg shadow-red-600/20 transition-transform active:scale-95"
            >
              <AlertTriangle className="mr-3 w-7 h-7" />
              REPORT ISSUE (SOS)
            </button>
            <button className="w-full bg-slate-800 hover:bg-slate-700 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center transition-transform active:scale-95">
              <Navigation className="mr-3 w-7 h-7" />
              Emergency Services
            </button>
          </div>
        )}

        {step === 'report' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold border-b border-slate-800 pb-2">Report a Disaster</h2>
            
            {!disasterType ? (
              <div>
                <p className="text-slate-400 mb-4">Select the type of emergency you are facing:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {GOA_DISASTERS.map((type) => (
                    <button
                      key={type}
                      onClick={() => handleDisasterSelect(type)}
                      className="bg-slate-800 hover:bg-sky-900 border border-slate-700 hover:border-sky-500 p-3 rounded-lg text-sm font-semibold transition"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 bg-slate-800/50 p-5 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-sky-400">{disasterType}</span>
                  <button onClick={() => setDisasterType('')} className="text-xs text-slate-400 underline">Change</button>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg flex items-start">
                  <MapPin className="text-rose-500 w-5 h-5 mr-3 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-300">Live Location Detected</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{address}</p>
                    {location && (
                      <p className="text-[10px] text-slate-500 mt-1 font-mono">
                        {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-300 mb-2 flex items-center">
                    <Camera className="w-4 h-4 mr-2" /> Upload Visual Evidence
                  </h3>
                  <input 
                    type="file" 
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-500/10 file:text-sky-400 hover:file:bg-sky-500/20"
                  />
                </div>

                <button 
                  onClick={handleSubmit}
                  disabled={!location || isSubmitting}
                  className={`w-full py-4 rounded-xl text-lg font-bold shadow-lg transition-transform ${(!location || isSubmitting) ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 shadow-emerald-600/20'}`}
                >
                  {isSubmitting ? 'Transmitting...' : 'SUBMIT REPORT'}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'tracking' && activeReport && (
          <div className="space-y-6">
            <div className="bg-sky-900/20 border border-sky-500/30 p-5 rounded-xl text-center">
              <CheckCircle className="w-12 h-12 text-sky-400 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-white mb-1">Alert Active: {activeReport.disasterType}</h2>
              <p className="text-sky-200 text-xs">National Dashboard is monitoring your location.</p>
            </div>

            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 overflow-hidden">
              <h3 className="font-bold text-slate-300 mb-4 border-b border-slate-700 pb-2">Live Rescue Tracking</h3>
              
              <div className="space-y-4 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Status</span>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${activeReport.status === 'assigned' ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400 animate-pulse' : 'bg-slate-700 text-slate-300'}`}>
                    {activeReport.status}
                  </span>
                </div>
                
                {activeReport.status === 'assigned' && activeReport.assignedTeam ? (
                  <>
                    <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                      <div>
                        <span className="block text-xs text-slate-500 mb-0.5">Dispatched Team</span>
                        <span className="font-bold text-emerald-400">{activeReport.assignedTeam.teamName}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs text-slate-500 mb-0.5">Estimated Arrival</span>
                        <span className="font-bold text-white flex items-center">
                          <Navigation className="w-3 h-3 mr-1 text-sky-400" /> 
                          {directionsResponse && directionsResponse !== 'FAILED' 
                            ? directionsResponse.routes[0]?.legs[0]?.duration?.text 
                            : liveEta !== null ? (liveEta === 0 ? 'Arrived' : `${liveEta} min`) : 'Calculating...'}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm italic bg-slate-900/30 rounded-lg">
                    <span className="block w-6 h-6 border-2 border-slate-600 border-t-sky-500 rounded-full animate-spin mx-auto mb-2"></span>
                    Waiting for Admin to assign the nearest rescue team...
                  </div>
                )}
              </div>

              {/* Leaflet OSM Live Tracking Map — Works Offline */}
              <div className="w-full h-96 relative rounded-xl overflow-hidden border-2 border-slate-700 shadow-inner">
                <div className="absolute top-2 right-2 z-[1000] bg-slate-900/80 text-sky-400 text-[10px] font-mono px-2 py-1 rounded border border-sky-500/30">
                  {activeReport.status === 'assigned' ? '🛰️ LIVE TRACKING' : '📍 YOUR LOCATION'}
                </div>
                <MapContainer
                  center={[activeReport.coordinates.lat, activeReport.coordinates.lng]}
                  zoom={15}
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
                  <MapRecenter lat={liveTeamCoords?.lat ?? activeReport.coordinates.lat} lng={liveTeamCoords?.lng ?? activeReport.coordinates.lng} />

                  {/* Disaster location — Red marker */}
                  <Marker position={[activeReport.coordinates.lat, activeReport.coordinates.lng]} icon={redIcon}>
                    <Popup>🚨 Disaster Location</Popup>
                  </Marker>

                  {/* Live rescue team — Green moving marker */}
                  {activeReport.status === 'assigned' && liveTeamCoords && (
                    <Marker position={[liveTeamCoords.lat, liveTeamCoords.lng]} icon={greenIcon}>
                      <Popup>🚑 {activeReport.assignedTeam?.teamName} — En Route</Popup>
                    </Marker>
                  )}

                  {/* Route line between team and victim */}
                  {activeReport.status === 'assigned' && liveTeamCoords && (
                    <Polyline
                      positions={[
                        [liveTeamCoords.lat, liveTeamCoords.lng],
                        [activeReport.coordinates.lat, activeReport.coordinates.lng]
                      ]}
                      pathOptions={{ color: '#0ea5e9', weight: 4, opacity: 0.8, dashArray: '8 4' }}
                    />
                  )}
                </MapContainer>
              </div>
            </div>

            <div className="bg-rose-900/20 border border-rose-500/30 p-5 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-30 pointer-events-none">
                <span className="text-[10px] font-mono tracking-widest text-rose-300">AI GENERATED FOR {activeReport.state.toUpperCase()}</span>
              </div>
              <h3 className="font-bold text-rose-400 mb-3 flex items-center">
                <ShieldAlert className="w-5 h-5 mr-2" /> 10-Minute Emergency Action Plan
              </h3>
              <p className="text-xs text-rose-300 mb-3 italic">Please follow these state-specific instructions until {activeReport.assignedTeam?.teamName || 'the rescue team'} arrives:</p>
              
              {!dynamicPrecautions ? (
                <div className="flex items-center text-xs text-rose-300/50">
                   <span className="animate-spin w-4 h-4 border-2 border-rose-500/30 border-t-rose-400 rounded-full mr-2"></span>
                   AI analyzing geographical protocols...
                </div>
              ) : (
                <ul className="list-disc pl-5 text-sm text-rose-200 space-y-2">
                  {dynamicPrecautions.map((prec, idx) => (
                    <li key={idx}>{prec}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
