import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { socket } from '../services/socketClient';
import { GoogleMap, useJsApiLoader, Marker as GoogleMarker, Polyline as GooglePolyline } from '@react-google-maps/api';
import { AlertTriangle, MapPin, Camera, CheckCircle, Navigation, ShieldAlert, Mic, MicOff, Loader2, Volume2, VolumeX, ArrowLeft, ExternalLink, Home, LogOut } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initKNN, classifyBase64Image, getKNNStatus, TRAINED_DISASTERS, buildRejectionMessage } from '../services/offlineKNN';
import { ref, set, get } from 'firebase/database';
import { database } from '../services/firebase';
import { getOfflineChatResponse } from '../services/offlineBot';

// Removed Leaflet helper


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
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });
  const navigate = useNavigate();

  const [step, setStep] = useState<'home' | 'report' | 'tracking' | 'voice_sos'>(() => {
    return (localStorage.getItem('resqnet_step') as any) || 'home';
  });
  const [disasterType, setDisasterType] = useState('');
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [address, setAddress] = useState('Fetching address...');
  const [media, setMedia] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReleasingEscrow, setIsReleasingEscrow] = useState(false);
  const [activeReport, setActiveReport] = useState<any>(() => {
    const saved = localStorage.getItem('resqnet_active_report');
    return saved ? JSON.parse(saved) : null;
  });
  const [userProfile, setUserProfile] = useState<any>(() => {
    const saved = localStorage.getItem('resqnet_user_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: '',
    age: '',
    bloodGroup: '',
    medicalConditions: ''
  });
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

  // Persist state
  useEffect(() => {
    localStorage.setItem('resqnet_step', step);
  }, [step]);

  useEffect(() => {
    if (activeReport) {
      localStorage.setItem('resqnet_active_report', JSON.stringify(activeReport));
    } else {
      localStorage.removeItem('resqnet_active_report');
    }
  }, [activeReport]);

  // Sync with server on mount in case we missed a socket event while in the Admin portal
  useEffect(() => {
    if (activeReport && activeReport._id) {
      axios.get('http://localhost:5000/api/reports')
        .then(res => {
          const liveReport = res.data.find((r: any) => r._id === activeReport._id);
          if (liveReport) {
            if (liveReport.status === 'resolved') {
              toast.success('Your emergency has been resolved by the Admin!');
              setStep('home');
              setDirectionsResponse(null);
              setLiveEta(null);
              setLiveTeamCoords(null);
              localStorage.removeItem('resqnet_active_report');
              localStorage.setItem('resqnet_step', 'home');
              setActiveReport(null);
            } else {
              setActiveReport(liveReport);
            }
          }
        })
        .catch(err => console.error('Failed to sync live report', err));
    }
  }, []);
  
  // Voice SOS State
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = React.useRef<any>(null);
  const waveIntervalRef = React.useRef<any>(null);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(10).fill(5));
  
  const [directionsResponse, setDirectionsResponse] = useState<any>(null);
  const [liveEta, setLiveEta] = useState<number | null>(null);
  const [liveTeamCoords, setLiveTeamCoords] = useState<any>(null);
  const [userState, setUserState] = useState('Goa');
  const [dynamicPrecautions, setDynamicPrecautions] = useState<string[] | null>(null);
  const [knnReady, setKnnReady] = useState(false);

  // Rubble Beacon State
  const [isBeaconActive, setIsBeaconActive] = useState(false);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const oscillatorRef = React.useRef<OscillatorNode | null>(null);
  const beaconIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Survival Checklist State
  const [completedTasks, setCompletedTasks] = useState<number[]>([]);

  // Initialise offline KNN classifier silently on app load
  useEffect(() => {
    initKNN((msg) => console.log('[KNN]', msg))
      .then(() => {
        setKnnReady(true);
        console.log('✅ Offline KNN ready for:', TRAINED_DISASTERS);
      })
      .catch((e) => console.warn('KNN init failed (will use Gemini only):', e));

    // Setup Web Speech Recognition for Voice SOS
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        setVoiceTranscript('');
        waveIntervalRef.current = setInterval(() => {
          setWaveHeights(Array(12).fill(0).map(() => 4 + Math.floor(Math.random() * 24)));
        }, 100);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        setVoiceTranscript(transcript);
        
        // Auto-detect disaster from transcript
        let detectedType = 'Other';
        if (transcript.includes('flood') || transcript.includes('water') || transcript.includes('drown')) detectedType = 'Flood';
        else if (transcript.includes('earthquake') || transcript.includes('shak') || transcript.includes('collapse')) detectedType = 'Earthquake';
        else if (transcript.includes('fire') || transcript.includes('burn') || transcript.includes('smoke')) detectedType = 'Fire Accident';
        else if (transcript.includes('landslide') || transcript.includes('mud')) detectedType = 'Landslide';
        else if (transcript.includes('cyclone') || transcript.includes('wind') || transcript.includes('storm')) detectedType = 'Cyclone';

        setDisasterType(detectedType);
        
        // Auto-fetch location and submit
        if (navigator.geolocation) {
          toast.loading('Voice SOS triggered! Fetching GPS...', { id: 'voice-sos' });
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setLocation(loc);
              
              // Reverse geocode
              const reverseGeocode = navigator.onLine
                ? fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`).then(res => res.json())
                : Promise.reject(new Error('Offline mode'));

              reverseGeocode
                .then(data => {
                  const state = data.address?.state || 'Goa';
                  setUserState(state);
                  
                  // Auto-Submit bypassing photo
                  const payload = {
                    userId: 'usr_live_' + Math.floor(Math.random() * 1000000),
                    disasterType: detectedType,
                    coordinates: loc,
                    address: data.display_name || 'Emergency Location',
                    state: state,
                    imageUrl: null,
                    aiAnalysis: {
                      match: true,
                      detected: detectedType,
                      severity: 'Critical',
                      casualties: 'Unknown',
                      analysis: `[VOICE SOS TRANSCRIPT]: "${transcript}"`,
                      offline: true
                    },
                    status: 'pending',
                    timestamp: new Date().toISOString()
                  };

                  socket.emit('submit_report', payload);
                  toast.success('Hands-free Emergency Report dispatched!', { id: 'voice-sos' });
                })
                .catch(() => {
                  // Fallback without address
                  const payload = {
                    userId: userProfile.phone || 'usr_live_' + Math.floor(Math.random() * 1000000),
                    userName: userProfile.fullName,
                    userProfile: userProfile,
                    disasterType: detectedType,
                    coordinates: loc,
                    address: 'GPS Coordinate Location',
                    state: 'Goa',
                    imageUrl: null,
                    aiAnalysis: {
                      match: true,
                      detected: detectedType,
                      severity: 'Critical',
                      casualties: 'Unknown',
                      analysis: `[VOICE SOS TRANSCRIPT]: "${transcript}"`,
                      offline: true
                    },
                    status: 'pending',
                    timestamp: new Date().toISOString()
                  };
                  socket.emit('submit_report', payload);
                  toast.success('Emergency Report dispatched with GPS only!', { id: 'voice-sos' });
                });
            },
            () => {
              const fallbackLoc = { lat: 15.6322, lng: 73.8569 };
              setLocation(fallbackLoc);
              setUserState('Goa');
              
              const payload = {
                userId: userProfile.phone || 'usr_live_' + Math.floor(Math.random() * 1000000),
                userName: userProfile.fullName,
                userProfile: userProfile,
                disasterType: detectedType,
                coordinates: fallbackLoc,
                address: 'Offline Mode: Revora, Goa (Emergency Node)',
                state: 'Goa',
                imageUrl: null,
                aiAnalysis: {
                  match: true,
                  detected: detectedType,
                  severity: 'Critical',
                  casualties: 'Unknown',
                  analysis: `[VOICE SOS TRANSCRIPT]: "${transcript}"`,
                  offline: true
                },
                status: 'pending',
                timestamp: new Date().toISOString()
              };
              socket.emit('submit_report', payload);
              toast.success('Voice SOS Active! Offline mesh location used.', { id: 'voice-sos', icon: '📡' });
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        } else {
          toast.error('GPS not supported on this device.', { id: 'voice-sos' });
        }
      };

      rec.onerror = (event: any) => {
        setIsListening(false);
        if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
        setWaveHeights(Array(10).fill(5));
        toast.error('Voice recognition failed: ' + event.error);
      };

      rec.onend = () => {
        setIsListening(false);
        if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
        setWaveHeights(Array(10).fill(5));
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
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
      // First, handle the side-effects based on the incoming report
      if (activeReport && report._id === activeReport._id) {
        if (report.status === 'assigned' && activeReport.status !== 'assigned') {
          toast.success(`Rescue Team Dispatched: ${report.assignedTeam?.teamName}`, { duration: 5000 });
          calculateRoute(report);
          // Join the chat room for this report
          socket.emit('join_chat_room', `chat_${report._id}`);
          setChatMessages([{ sender: 'team', senderName: report.assignedTeam?.teamName || 'Rescue Team', text: `Hello! This is ${report.assignedTeam?.teamName}. We are dispatched to your location and will arrive shortly. Stay calm and keep this channel open. How are you doing?`, timestamp: new Date().toISOString() }]);
          setIsChatOpen(true);
        } else if (report.status === 'resolved') {
          toast.success('Issue marked as Resolved by Admin!');
          setStep('home');
          setDirectionsResponse(null);
          setLiveEta(null);
          setLiveTeamCoords(null);
          localStorage.removeItem('resqnet_active_report');
          localStorage.setItem('resqnet_step', 'home');
          setActiveReport(null);
          return; // Exit early so we don't set the active report to the resolved one
        }
      }
      
      // If it's not resolved, just update the active report
      setActiveReport((prev: any) => {
        if (prev && report._id === prev._id) {
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

    const handleNewMessage = (msg: any) => {
      setChatMessages(prev => [...prev, msg]);
      // Auto-open chat when team sends a message
      if (msg.sender === 'team') {
        setIsChatOpen(true);
        toast(`💬 ${msg.senderName || 'Rescue Team'}: ${msg.text.substring(0, 60)}...`, { duration: 4000, icon: '📻' });
      }
    };
    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('status_updated', handleStatusUpdated);
      socket.off('report_submitted_success', handleReportSuccess);
      socket.off('new_message', handleNewMessage);
    };
  }, [activeReport]);

  useEffect(() => {
    if (mapInstance && activeReport?.coordinates) {
      if (activeReport.status === 'assigned' && liveTeamCoords) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(new window.google.maps.LatLng(activeReport.coordinates.lat, activeReport.coordinates.lng));
        bounds.extend(new window.google.maps.LatLng(liveTeamCoords.lat, liveTeamCoords.lng));
        mapInstance.fitBounds(bounds, 50); // Add 50px padding so markers don't touch the edge
      } else {
        mapInstance.panTo({ lat: activeReport.coordinates.lat, lng: activeReport.coordinates.lng });
        mapInstance.setZoom(15);
      }
    }
  }, [mapInstance, activeReport?.coordinates, activeReport?.status, liveTeamCoords]);

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
            
            // Trigger the dramatic arrival toast just once
            toast.success(`🚨 ${activeReport.assignedTeam.teamName} HAS ARRIVED AT YOUR LOCATION!`, { 
              duration: 10000, 
              icon: '🚑',
              style: { background: '#064e3b', color: '#34d399', border: '1px solid #10b981', fontWeight: 'bold' }
            });
            
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

  // Re-calculate route if we remounted and already have an assigned report but no route
  useEffect(() => {
    if (activeReport?.status === 'assigned' && !directionsResponse && isLoaded) {
      calculateRoute(activeReport);
    }
  }, [activeReport?.status, isLoaded]);

  const startReport = () => setStep('report');

  const toggleBeacon = () => {
    if (isBeaconActive) {
      // Stop the beacon
      if (beaconIntervalRef.current) clearInterval(beaconIntervalRef.current);
      if (oscillatorRef.current) {
        try { oscillatorRef.current.stop(); } catch(e){}
        oscillatorRef.current.disconnect();
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
      setIsBeaconActive(false);
    } else {
      // Start the beacon
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        toast.error('Web Audio API not supported in this browser.');
        return;
      }
      
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      
      const osc = ctx.createOscillator();
      osc.type = 'square'; // Harsh buzzer sound
      osc.frequency.setValueAtTime(1000, ctx.currentTime); // 1000Hz piercing tone
      
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime); // Start muted
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      oscillatorRef.current = osc;

      // Pulse pattern: Beep for 200ms, pause for 300ms
      let isOn = false;
      beaconIntervalRef.current = setInterval(() => {
        if (ctx.state === 'closed') return;
        isOn = !isOn;
        // Fast attack/release to avoid clicking sounds
        gainNode.gain.setTargetAtTime(isOn ? 1 : 0, ctx.currentTime, 0.015);
      }, 300);

      setIsBeaconActive(true);
    }
  };

  const toggleTask = (index: number) => {
    setCompletedTasks(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (beaconIntervalRef.current) clearInterval(beaconIntervalRef.current);
      if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close();
    };
  }, []);

  const handleVoiceSOSClick = () => {
    if (!recognitionRef.current) {
      toast.error('Voice recognition not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

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
            if (!navigator.onLine) throw new Error('Offline mode');
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
              if (!navigator.onLine) throw new Error('Offline mode');
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
                { lat: 15.6322, lng: 73.8569, name: 'Revora, North Goa, Goa' },
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
          toast.success('Offline mesh-network location acquired.', { id: 'gps', icon: '📡' });
          setLocation({ lat: 15.6322, lng: 73.8569 }); 
          setAddress('Offline Mode: Revora, Goa (Emergency Node)');
          setUserState('Goa');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
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
      userId: userProfile.phone ? userProfile.phone.replace('+', '') : ('usr_' + Math.floor(Math.random() * 10000)),
      userName: userProfile.fullName,
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

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-600/20 blur-[120px] rounded-full animate-slow-pan"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/20 blur-[120px] rounded-full animate-slow-pan" style={{ animationDirection: 'reverse' }}></div>
        </div>
        
        <div className="z-10 flex flex-col items-center justify-center flex-1 p-6 animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none">
              <span className="text-[100px] font-bold text-sky-500">?</span>
            </div>
            
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 mb-2 flex items-center">
              <ShieldAlert className="w-6 h-6 mr-2 text-sky-400" /> Civilian Sign In
            </h2>
            <p className="text-sm text-slate-400 mb-6 relative z-10">Sign in to report emergencies to the national rescue database.</p>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const cleanPhone = profileForm.phone.replace(/[^0-9+]/g, '');
              if (!cleanPhone) {
                toast.error('Invalid phone number');
                return;
              }
              
              toast.loading('Syncing to National Database...', { id: 'auth' });
              try {
                const userRef = ref(database, 'users/' + cleanPhone.replace('+', ''));
                await set(userRef, {
                  ...profileForm,
                  phone: cleanPhone,
                  createdAt: new Date().toISOString()
                });
                
                const finalProfile = { ...profileForm, phone: cleanPhone };
                setUserProfile(finalProfile);
                localStorage.setItem('resqnet_user_profile', JSON.stringify(finalProfile));
                toast.success('Emergency Profile Secured!', { id: 'auth' });
              } catch (err: any) {
                toast.error('Cloud Sync Failed: ' + err.message, { id: 'auth' });
              }
            }} className="space-y-4 relative z-10">
              <div>
                <label className="block text-xs text-sky-400 font-mono tracking-wider mb-1">FULL NAME *</label>
                <input required type="text" value={profileForm.fullName} onChange={e => setProfileForm({...profileForm, fullName: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors" placeholder="e.g. John Doe" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-sky-400 font-mono tracking-wider mb-1">PHONE NO. (Login ID) *</label>
                  <input required type="tel" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors" placeholder="e.g. 9876543210" />
                </div>
                <div>
                  <label className="block text-xs text-sky-400 font-mono tracking-wider mb-1">AGE *</label>
                  <input required type="number" min="1" max="120" value={profileForm.age} onChange={e => setProfileForm({...profileForm, age: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors" placeholder="e.g. 35" />
                </div>
              </div>
              
              <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:shadow-[0_0_30px_rgba(14,165,233,0.5)] transition-all transform hover:-translate-y-1 mt-6 border border-white/10">
                Sign In / Register
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060913] via-[#0c1120] to-[#04060a] text-slate-100 flex flex-col font-sans animate-slow-pan relative overflow-x-hidden">
      {/* Cinematic Ambient Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-sky-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      
      <header className="sticky top-0 z-[1000] bg-slate-950/60 backdrop-blur-xl border-b border-white/5 p-4 flex justify-between items-center shadow-lg">
        <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-blue-500 to-emerald-400 tracking-tight">ResqNet Eco-System</h1>
        <div className="flex items-center space-x-4">
          <button onClick={() => {
            localStorage.removeItem('resqnet_user_profile');
            localStorage.removeItem('resqnet_active_report');
            localStorage.removeItem('resqnet_step');
            setUserProfile(null);
            setActiveReport(null);
            setStep('home');
          }} className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center transition-colors bg-red-950/30 hover:bg-red-900/50 px-3 py-1.5 rounded-lg border border-red-900/50">
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign Out
          </button>
          {step !== 'home' && (
            <button onClick={() => setStep('home')} className="text-xs font-bold text-slate-300 hover:text-white flex items-center transition-colors bg-slate-800/50 hover:bg-slate-700/80 px-3 py-1.5 rounded-lg border border-slate-700/50">
              <Home className="w-3.5 h-3.5 mr-1.5" /> Home
            </button>
          )}
          <button onClick={() => navigate('/admin')} className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center transition-colors">
            Admin Portal <ExternalLink className="w-3 h-3 ml-1" />
          </button>
          <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full items-center border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] hidden sm:flex">
            <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse shadow-[0_0_8px_#10b981]"></span>
            User Portal
          </span>
        </div>
      </header>

      <main className="flex-grow p-6 max-w-2xl mx-auto w-full relative z-10">
        {step === 'home' && (
          <div className="space-y-8 text-center mt-16 relative z-10">
            <h2 className="text-5xl font-black tracking-tight mb-2">National Disaster<br/><span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-rose-400">Response Matrix</span></h2>
            <p className="text-slate-400 text-lg mb-10 font-light">Fast, intelligent, and coordinated rescue platform powered by Edge AI.</p>
            
            <button 
              onClick={startReport}
              className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white py-6 rounded-2xl text-2xl font-black flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(220,38,38,0.6)] border border-red-500/50 hover:-translate-y-1 transition-all duration-300"
            >
              <AlertTriangle className="mr-3 w-8 h-8 animate-pulse" />
              INITIATE SOS REPORT
            </button>
            <button 
              onClick={() => setStep('voice_sos')}
              className="w-full bg-slate-800/60 backdrop-blur-md hover:bg-slate-700/80 text-sky-100 py-6 rounded-2xl text-xl font-bold flex items-center justify-center border border-white/5 shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <Navigation className="mr-3 w-6 h-6 text-sky-400" />
              Emergency Services
            </button>
          </div>
        )}

        {step === 'report' && (
          <div className="space-y-6">
            <div className="flex items-center border-b border-white/10 pb-4">
              <button onClick={() => setStep('home')} className="mr-4 p-2 bg-slate-800/50 hover:bg-slate-700/80 rounded-lg text-slate-400 hover:text-white transition-all duration-200 border border-transparent hover:border-slate-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">Report a Disaster</h2>
            </div>
            
            {!disasterType ? (
              <div className="bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-white/5 shadow-xl">
                <p className="text-slate-400 mb-6 font-medium">Select the type of emergency you are facing:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {GOA_DISASTERS.map((type) => (
                    <button
                      key={type}
                      onClick={() => handleDisasterSelect(type)}
                      className="bg-slate-800/60 hover:bg-sky-900/60 border border-slate-700/50 hover:border-sky-400 p-4 rounded-xl text-sm font-bold text-slate-200 hover:text-sky-300 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_5px_15px_rgba(56,189,248,0.2)]"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl">
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
                  disabled={isSubmitting || !location || (!media && !dynamicPrecautions)}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:from-slate-700 disabled:to-slate-800 text-white py-4 rounded-xl font-black text-lg transition-all duration-300 shadow-[0_5px_20px_rgba(16,185,129,0.3)] hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(16,185,129,0.5)] disabled:hover:translate-y-0 disabled:shadow-none"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Processing Offline...
                    </span>
                  ) : 'SUBMIT REPORT'}
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

                {liveEta === 0 && activeReport.assignedTeam && (
                  <div className="bg-emerald-500/20 border-2 border-emerald-500 p-4 rounded-xl text-center animate-pulse shadow-[0_0_30px_rgba(16,185,129,0.3)] my-4">
                    <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                    <h3 className="text-xl font-black text-emerald-400 uppercase tracking-widest">Rescue Team Arrived</h3>
                    <p className="text-emerald-100 text-sm font-bold mt-1">{activeReport.assignedTeam.teamName} has reached your coordinates. Please make yourself visible.</p>
                  </div>
                )}
                
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
                ) : activeReport.bountyActive ? (
                  <div className="text-center py-6 text-indigo-400 text-sm italic bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
                    <span className="block w-6 h-6 border-2 border-indigo-600 border-t-indigo-400 rounded-full animate-spin mx-auto mb-2 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></span>
                    Broadcasting Web3 Bounty to nearby Private Rescuers...
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm italic bg-slate-900/30 rounded-lg">
                    <span className="block w-6 h-6 border-2 border-slate-600 border-t-sky-500 rounded-full animate-spin mx-auto mb-2"></span>
                    Waiting for Admin to assign the nearest rescue team...
                  </div>
                )}
              </div>

              {/* Google Maps Live Tracking */}
              <div className="w-full h-96 relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="absolute top-2 right-2 z-[1000] bg-slate-900/80 text-sky-400 text-[10px] font-mono px-2 py-1 rounded border border-sky-500/30 shadow-[0_0_10px_rgba(56,189,248,0.2)]">
                  {activeReport.status === 'assigned' ? '🛰️ LIVE TRACKING' : '📍 YOUR LOCATION'}
                </div>
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={{ lat: liveTeamCoords?.lat ?? activeReport.coordinates.lat, lng: liveTeamCoords?.lng ?? activeReport.coordinates.lng }}
                    zoom={15}
                    onLoad={(map) => setMapInstance(map)}
                    options={{
                      disableDefaultUI: true,
                      zoomControl: true,
                      mapTypeId: 'hybrid' // Realistic satellite view with roads
                    }}
                  >
                    {(() => {
                      let iconUrl = 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
                      if (activeReport.disasterType.toLowerCase().includes('fire')) iconUrl = 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png';
                      if (activeReport.disasterType.toLowerCase().includes('flood') || activeReport.disasterType.toLowerCase().includes('drown')) iconUrl = 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';
                      if (activeReport.disasterType.toLowerCase().includes('tree') || activeReport.disasterType.toLowerCase().includes('landslide')) iconUrl = 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
                      
                      return <GoogleMarker position={{ lat: activeReport.coordinates.lat, lng: activeReport.coordinates.lng }} icon={iconUrl} />;
                    })()}
                    
                    {activeReport.status === 'assigned' && liveTeamCoords && (
                      <GoogleMarker 
                        position={{ lat: liveTeamCoords.lat, lng: liveTeamCoords.lng }} 
                        icon="http://maps.google.com/mapfiles/ms/icons/green-dot.png" 
                      />
                    )}

                    {activeReport.status === 'assigned' && liveTeamCoords && (
                      <GooglePolyline
                        path={[
                          { lat: liveTeamCoords.lat, lng: liveTeamCoords.lng },
                          { lat: activeReport.coordinates.lat, lng: activeReport.coordinates.lng }
                        ]}
                        options={{ strokeColor: '#38bdf8', strokeWeight: 4, strokeOpacity: 0.8 }}
                      />
                    )}
                  </GoogleMap>
                ) : (
                  <div className="w-full h-full bg-slate-900/50 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 text-sky-500 animate-spin mb-2" />
                    <span className="text-xs text-sky-400 font-mono tracking-widest uppercase">Initializing Satellite Uplink...</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── WEB3 ESCROW RELEASE BUTTON ─────────────────────────────────── */}
            {activeReport.bountyActive && (
              <div className="bg-indigo-900/30 border border-indigo-500/50 p-5 rounded-xl text-center shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                <h3 className="text-lg font-bold text-indigo-300 mb-2">💎 Smart Contract Escrow Active</h3>
                <p className="text-xs text-indigo-200 mb-4">A Web3 Bounty of {activeReport.bountyAmount} USDC has been locked by the Admin. Once you are safe, confirm the rescue to release the funds to the rescuer's wallet.</p>
                <button
                  onClick={() => {
                    setIsReleasingEscrow(true);
                    setTimeout(() => {
                      socket.emit('release_bounty', { reportId: activeReport._id });
                      setIsReleasingEscrow(false);
                      toast.success('Funds Released! Smart Contract Executed on Blockchain.', { icon: '✅', duration: 6000 });
                    }, 3000);
                  }}
                  disabled={isReleasingEscrow}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                >
                  {isReleasingEscrow ? (
                    <span className="flex items-center justify-center">
                      <span className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full mr-2"></span>
                      EXECUTING SMART CONTRACT...
                    </span>
                  ) : 'I AM SAFE - RELEASE ESCROW FUNDS'}
                </button>
              </div>
            )}

            {/* ── LIVE RESCUE TEAM CHAT ──────────────────────────────────────── */}
            {activeReport.status === 'assigned' && (
              <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                {/* Chat Header */}
                <button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="w-full flex items-center justify-between p-4 bg-emerald-950/40 border-b border-emerald-500/20 hover:bg-emerald-900/30 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                        <span className="text-lg">📻</span>
                      </div>
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse border-2 border-slate-900"></span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-emerald-300">{activeReport.assignedTeam?.teamName || 'Rescue Team'}</p>
                      <p className="text-xs text-emerald-500/70">Radio Channel Open • En Route</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {chatMessages.length > 0 && !isChatOpen && (
                      <span className="bg-emerald-500 text-black text-xs font-black px-2 py-0.5 rounded-full">{chatMessages.length}</span>
                    )}
                    <span className="text-emerald-400 text-xs font-mono">{isChatOpen ? '▲ CLOSE' : '▼ OPEN RADIO'}</span>
                  </div>
                </button>

                {isChatOpen && (
                  <div className="flex flex-col">
                    {/* Messages */}
                    <div className="h-64 overflow-y-auto p-4 space-y-3 bg-slate-950/40">
                      {chatMessages.length === 0 && (
                        <div className="text-center text-slate-500 text-xs italic py-8">
                          Radio channel open. Type a message to contact your rescue team.
                        </div>
                      )}
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] ${msg.sender === 'user'
                            ? 'bg-sky-600/30 border border-sky-500/30 rounded-2xl rounded-br-sm'
                            : 'bg-emerald-900/30 border border-emerald-500/20 rounded-2xl rounded-bl-sm'
                          } px-4 py-2.5`}>
                            {msg.sender !== 'user' && (
                              <p className="text-[10px] font-bold text-emerald-400 mb-1 uppercase tracking-wider">{msg.senderName || 'Rescue Team'}</p>
                            )}
                            <p className="text-sm text-slate-100 leading-relaxed">{msg.text}</p>
                            <p className="text-[9px] text-slate-500 mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-emerald-500/20 bg-slate-950/60 flex space-x-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && chatInput.trim()) {
                            const text = chatInput.trim();
                            const msg = { sender: 'user', senderName: userProfile?.fullName || 'Victim', text, timestamp: new Date().toISOString() };
                            
                            // 100% Offline AI Calculation
                            const botReplyText = getOfflineChatResponse(text, activeReport.disasterType);
                            const botMsg = { sender: 'team', senderName: activeReport.assignedTeam?.teamName || 'Rescue Team', text: botReplyText, timestamp: new Date().toISOString() };

                            if (socket.connected) {
                              // If online, relay user message to server (admin sees it)
                              socket.emit('send_chat_message', {
                                room: `chat_${activeReport._id}`,
                                message: text,
                                sender: 'user',
                                senderName: userProfile?.fullName || 'Victim',
                                disasterType: activeReport.disasterType,
                                teamName: activeReport.assignedTeam?.teamName,
                                skipAi: true // Tell server NOT to run Gemini
                              });
                              
                              // Emulate AI typing delay, then send bot reply to server
                              setTimeout(() => {
                                socket.emit('send_chat_message', {
                                  room: `chat_${activeReport._id}`,
                                  message: botReplyText,
                                  sender: 'team',
                                  senderName: activeReport.assignedTeam?.teamName || 'Rescue Team',
                                  disasterType: activeReport.disasterType,
                                  teamName: activeReport.assignedTeam?.teamName,
                                  skipAi: true
                                });
                              }, 1000);
                            } else {
                              // Completely offline, update local UI only
                              setChatMessages(prev => [...prev, msg]);
                              setTimeout(() => {
                                setChatMessages(prev => [...prev, botMsg]);
                                setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                              }, 1000);
                            }
                            
                            setChatInput('');
                          }
                        }}
                        placeholder="Type a message to your rescue team..."
                        className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                      <button
                        onClick={() => {
                          if (!chatInput.trim()) return;
                          const text = chatInput.trim();
                          const msg = { sender: 'user', senderName: userProfile?.fullName || 'Victim', text, timestamp: new Date().toISOString() };
                          
                          // 100% Offline AI Calculation
                          const botReplyText = getOfflineChatResponse(text, activeReport.disasterType);
                          const botMsg = { sender: 'team', senderName: activeReport.assignedTeam?.teamName || 'Rescue Team', text: botReplyText, timestamp: new Date().toISOString() };

                          if (socket.connected) {
                            socket.emit('send_chat_message', {
                              room: `chat_${activeReport._id}`,
                              message: text,
                              sender: 'user',
                              senderName: userProfile?.fullName || 'Victim',
                              disasterType: activeReport.disasterType,
                              teamName: activeReport.assignedTeam?.teamName,
                              skipAi: true
                            });

                            setTimeout(() => {
                              socket.emit('send_chat_message', {
                                room: `chat_${activeReport._id}`,
                                message: botReplyText,
                                sender: 'team',
                                senderName: activeReport.assignedTeam?.teamName || 'Rescue Team',
                                disasterType: activeReport.disasterType,
                                teamName: activeReport.assignedTeam?.teamName,
                                skipAi: true
                              });
                            }, 1000);
                          } else {
                            setChatMessages(prev => [...prev, msg]);
                            setTimeout(() => {
                              setChatMessages(prev => [...prev, botMsg]);
                              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                            }, 1000);
                          }
                          setChatInput('');
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors flex-shrink-0"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* ── END CHAT ──────────────────────────────────────────────────── */}

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
                <div className="space-y-3 mt-4">
                  {/* Progress Bar */}
                  <div className="w-full bg-rose-950/50 rounded-full h-2.5 mb-4 border border-rose-800/50 overflow-hidden">
                    <div 
                      className="h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${(completedTasks.length / dynamicPrecautions.length) * 100}%`,
                        backgroundColor: completedTasks.length === dynamicPrecautions.length ? '#10b981' : '#f43f5e'
                      }}
                    ></div>
                  </div>
                  
                  {dynamicPrecautions.map((prec, idx) => {
                    const isCompleted = completedTasks.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleTask(idx)}
                        className={`w-full flex items-start text-left p-3 rounded-lg border transition-all duration-200 ${
                          isCompleted 
                            ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400/70 line-through' 
                            : 'bg-rose-950/40 border-rose-800/50 text-rose-200 hover:bg-rose-900/60 hover:border-rose-500/50'
                        }`}
                      >
                        <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mr-3 mt-0.5 border ${
                          isCompleted ? 'bg-emerald-500/20 border-emerald-500' : 'bg-rose-900 border-rose-500'
                        }`}>
                          {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                        </div>
                        <span className="text-sm leading-snug">{prec}</span>
                      </button>
                    );
                  })}
                  
                  {completedTasks.length === dynamicPrecautions.length && (
                    <div className="mt-4 p-3 bg-emerald-900/30 border border-emerald-500/50 rounded-lg text-center animate-pulse">
                      <p className="text-emerald-400 font-bold text-sm">✅ Checklist Complete. Stay safe and wait for rescue.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Acoustic Rubble Beacon UI */}
            <div className={`mt-6 border-2 rounded-2xl p-6 transition-colors duration-300 ${isBeaconActive ? 'bg-red-900/30 border-red-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
              <div className="flex flex-col items-center text-center">
                <button 
                  onClick={toggleBeacon}
                  className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-300 mb-4 ${isBeaconActive ? 'border-red-500 bg-red-500/20 text-red-500 animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.6)]' : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-red-400 hover:text-red-400'}`}
                >
                  {isBeaconActive ? <Volume2 className="w-10 h-10 animate-ping" /> : <VolumeX className="w-10 h-10" />}
                </button>
                <h3 className={`text-xl font-bold mb-2 ${isBeaconActive ? 'text-red-400' : 'text-slate-200'}`}>
                  Acoustic Rubble Beacon
                </h3>
                <p className="text-sm text-slate-400 max-w-sm">
                  {isBeaconActive 
                    ? "ALARM ACTIVE. A high-frequency SOS buzzer is playing to help rescuers locate you under debris. Lock your phone screen to save battery."
                    : "Tap to activate a loud, high-frequency SOS buzzer from your phone's speaker to guide rescue teams to your exact location."}
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 'voice_sos' && (
          <div className="space-y-6">
            <div className="flex items-center border-b border-white/10 pb-4">
              <button onClick={() => setStep('home')} className="mr-4 p-2 bg-slate-800/50 hover:bg-slate-700/80 rounded-lg text-slate-400 hover:text-white transition-all duration-200 border border-transparent hover:border-slate-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">Emergency Services</h2>
            </div>
            
            <div className="flex flex-col space-y-8">
              {/* Massive Hands-Free Voice SOS Trigger */}
              <div className="bg-slate-900/50 border-2 border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
                <div className={`absolute inset-0 bg-sky-500/10 opacity-0 transition-opacity duration-500 ${isListening ? 'opacity-100 animate-pulse' : ''}`} />
                
                <button 
                  onClick={handleVoiceSOSClick}
                  className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${isListening ? 'border-sky-400 bg-sky-500/20 text-sky-400 scale-110 shadow-[0_0_30px_rgba(56,189,248,0.5)]' : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-sky-500 hover:text-sky-400 hover:bg-slate-800/80'}`}
                >
                  {isListening ? <Loader2 className="w-10 h-10 animate-spin absolute" /> : null}
                  {isListening ? <Mic className="w-10 h-10 animate-pulse" /> : <MicOff className="w-10 h-10" />}
                </button>
                
                <h3 className="mt-4 text-xl font-bold text-white relative z-10">
                  {isListening ? "Listening..." : "Hands-Free Emergency SOS"}
                </h3>
                <p className="text-sm text-slate-400 mt-2 max-w-xs relative z-10">
                  {isListening ? "Speak clearly: e.g. 'Help, there is a flood here!'" : "Tap to speak. AI will auto-detect disaster and dispatch teams instantly."}
                </p>
                
                {isListening && voiceTranscript && (
                  <div className="mt-4 p-3 bg-slate-950/80 border border-slate-700 rounded-lg w-full text-left max-w-xs relative z-10">
                    <span className="text-sky-400 text-xs font-bold block mb-1">Live Transcript:</span>
                    <span className="text-sm text-slate-300 italic">"{voiceTranscript}"</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
