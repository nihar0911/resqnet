import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { socket } from '../services/socketClient';
import { GoogleMap, useJsApiLoader, Marker as GoogleMarker, Polyline as GooglePolyline } from '@react-google-maps/api';
import { AlertTriangle, MapPin, Camera, CheckCircle, Navigation, ShieldAlert, Mic, MicOff, Loader2, Volume2, VolumeX, ArrowLeft, ExternalLink, Home, LogOut, Sun, Moon } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initKNN, classifyBase64Image, getKNNStatus, TRAINED_DISASTERS, buildRejectionMessage } from '../services/offlineKNN';
import { ref, set, get } from 'firebase/database';
import { database } from '../services/firebase';
import { getOfflineChatResponse } from '../services/offlineBot';
import { useTheme } from '../context/ThemeContext';

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

const getDisasterEmoji = (type: string) => {
  const m: Record<string, string> = {
    'Flood': '🌊', 'Coastal Flooding': '🌊', 'Cyclone': '🌪️', 'Tree Fall': '🌳', 'Landslide': '🪨',
    'Fire Accident': '🔥', 'Boat Accident': '🚢', 'Beach Drowning': '🏊',
    'Building Collapse': '🏢', 'Earthquake': '🏚️'
  };
  return m[type] || '⚠️';
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
  
  const { theme, toggleTheme } = useTheme();

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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-600/20 blur-[120px] rounded-full animate-slow-pan"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/20 blur-[120px] rounded-full animate-slow-pan" style={{ animationDirection: 'reverse' }}></div>
        </div>
        
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 p-6 animate-fadeIn w-full overflow-hidden">
          {/* Ambient Cinematic Background Glows */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-sky-500/20 via-indigo-500/10 to-emerald-500/20 blur-[120px] rounded-full pointer-events-none -z-10 animate-pulse-slow"></div>

          <div className="w-full max-w-md relative group/login">
            {/* Hover Glow Behind Container */}
            <div className="absolute -inset-1 bg-gradient-to-r from-sky-500/30 to-emerald-500/30 rounded-[2.5rem] blur-xl opacity-50 group-hover/login:opacity-100 transition duration-1000 -z-10"></div>
            
            <div className="bg-white/80 dark:bg-[#0a0f1d]/80 backdrop-blur-3xl border border-white/50 dark:border-slate-700/50 p-10 rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] relative overflow-hidden transition-all duration-500">
              
              {/* Decorative Question Mark */}
              <div className="absolute -top-10 -right-10 opacity-10 pointer-events-none rotate-12">
                <ShieldAlert className="w-48 h-48 text-sky-500 drop-shadow-2xl" />
              </div>
              
              <div className="text-center mb-8 relative z-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-white/50 dark:border-white/10 mb-6 shadow-inner">
                  <ShieldAlert className="w-8 h-8 text-sky-500 dark:text-sky-400 drop-shadow-md" />
                </div>
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-emerald-600 dark:from-sky-400 dark:to-emerald-400 mb-2 tracking-tight">
                  Civilian Portal
                </h2>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Secure entry to the National Rescue Grid</p>
              </div>
              
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
              }} className="space-y-5 relative z-10">
                
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-500 dark:text-sky-400/80 font-black tracking-widest uppercase ml-1">Full Name *</label>
                  <input 
                    required 
                    type="text" 
                    value={profileForm.fullName} 
                    onChange={e => setProfileForm({...profileForm, fullName: e.target.value})} 
                    className="w-full bg-slate-100/80 dark:bg-black/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all shadow-inner placeholder-slate-400 dark:placeholder-slate-600 font-medium" 
                    placeholder="e.g. John Doe" 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 dark:text-sky-400/80 font-black tracking-widest uppercase ml-1">Phone ID *</label>
                    <input 
                      required 
                      type="tel" 
                      value={profileForm.phone} 
                      onChange={e => setProfileForm({...profileForm, phone: e.target.value})} 
                      className="w-full bg-slate-100/80 dark:bg-black/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all shadow-inner placeholder-slate-400 dark:placeholder-slate-600 font-medium" 
                      placeholder="9876543210" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-500 dark:text-sky-400/80 font-black tracking-widest uppercase ml-1">Age *</label>
                    <input 
                      required 
                      type="number" 
                      min="1" max="120" 
                      value={profileForm.age} 
                      onChange={e => setProfileForm({...profileForm, age: e.target.value})} 
                      className="w-full bg-slate-100/80 dark:bg-black/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all shadow-inner placeholder-slate-400 dark:placeholder-slate-600 font-medium" 
                      placeholder="e.g. 35" 
                    />
                  </div>
                </div>
                
                <button 
                  type="submit" 
                  className="w-full relative overflow-hidden group bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-black tracking-wider uppercase text-sm py-4 px-4 rounded-xl shadow-[0_10px_20px_rgba(14,165,233,0.3)] hover:shadow-[0_15px_30px_rgba(14,165,233,0.5)] transition-all transform hover:-translate-y-1 mt-8 border border-white/20"
                >
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-sky-400 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative z-10 flex items-center justify-center">
                    Secure Login / Register <ExternalLink className="w-4 h-4 ml-2" />
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060913] via-[#0c1120] to-[#04060a] text-slate-900 dark:text-slate-100 flex flex-col font-sans animate-slow-pan relative overflow-x-hidden">
      {/* Cinematic Ambient Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-sky-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-900/10 rounded-full blur-[120px] pointer-events-none"></div>
      
      <header className="sticky top-0 z-[1000] bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 p-4 flex justify-between items-center shadow-lg transition-colors duration-500">
        <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-blue-500 to-emerald-400 tracking-tight">ResqNet Eco-System</h1>
        <div className="flex items-center space-x-4">
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition shadow-inner border border-slate-200 dark:border-slate-700"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
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
            <button onClick={() => setStep('home')} className="text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-white flex items-center transition-colors bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:bg-slate-700/80 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700/50">
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
          <div className="space-y-12 text-center mt-20 relative z-10 max-w-xl mx-auto flex flex-col items-center">
            {/* Ambient Background Flare */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-sky-500/10 via-transparent to-red-500/10 blur-[100px] -z-10 pointer-events-none"></div>

            <div className="space-y-4">
              <div className="inline-block px-4 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 mb-2">
                <span className="text-xs font-black tracking-widest uppercase text-sky-400 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-sky-400 mr-2 animate-ping"></span>
                  Live Edge AI Network
                </span>
              </div>
              <h2 className="text-5xl md:text-6xl font-black tracking-tighter leading-tight text-slate-800 dark:text-white drop-shadow-xl">
                National Disaster<br/>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-rose-500 to-orange-500 animate-gradient-x bg-[length:200%_auto]">Response Matrix</span>
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg font-medium leading-relaxed max-w-md mx-auto">
                The world's fastest, intelligent, and coordinated civilian rescue platform powered by decentralized AI.
              </p>
            </div>
            
            <div className="w-full space-y-5">
              {/* Massive Primary SOS Button */}
              <div className="relative group/sos w-full">
                <div className="absolute -inset-2 bg-gradient-to-r from-red-600 to-rose-600 rounded-3xl blur-xl opacity-40 group-hover/sos:opacity-75 transition duration-500 group-hover/sos:duration-200"></div>
                <button 
                  onClick={startReport}
                  className="relative w-full bg-gradient-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 text-white py-6 rounded-2xl text-2xl font-black flex flex-col items-center justify-center border-t border-white/20 shadow-[0_20px_50px_-10px_rgba(220,38,38,0.7)] hover:shadow-[0_20px_60px_-10px_rgba(220,38,38,0.9)] hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay"></div>
                  <AlertTriangle className="mb-2 w-10 h-10 animate-bounce drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
                  <span className="tracking-widest uppercase drop-shadow-md z-10">Initiate SOS Report</span>
                </button>
              </div>

              {/* Sleek Secondary Services Button */}
              <div className="relative group/services w-full">
                <div className="absolute -inset-1 bg-gradient-to-r from-sky-500/20 to-blue-500/20 rounded-2xl blur-lg opacity-0 group-hover/services:opacity-100 transition duration-500"></div>
                <button 
                  onClick={() => setStep('voice_sos')}
                  className="relative w-full bg-white/60 dark:bg-[#070b1a]/60 backdrop-blur-xl hover:bg-white dark:hover:bg-[#0a1128]/80 text-slate-700 dark:text-sky-100 py-5 rounded-2xl text-lg font-bold flex flex-col items-center justify-center border border-slate-200 dark:border-white/10 shadow-lg hover:shadow-[0_10px_30px_rgba(56,189,248,0.2)] hover:-translate-y-0.5 hover:border-sky-400 dark:hover:border-sky-500/50 transition-all duration-300"
                >
                  <Mic className="mb-2 w-7 h-7 text-sky-500 dark:text-sky-400 group-hover/services:animate-pulse" />
                  <span className="tracking-widest uppercase">Hands-Free Emergency</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'report' && (
          <div className="space-y-6">
            <div className="flex items-center border-b border-white/10 pb-4">
              <button onClick={() => setStep('home')} className="mr-4 p-2 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:bg-slate-700/80 rounded-lg text-slate-600 dark:text-slate-400 hover:text-white transition-all duration-200 border border-transparent hover:border-slate-400 dark:border-slate-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">Report a Disaster</h2>
            </div>
            
            {!disasterType ? (
              <div className="bg-slate-50 dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-white/5 shadow-xl">
                <p className="text-slate-600 dark:text-slate-400 mb-6 font-medium">Select the type of emergency you are facing:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {GOA_DISASTERS.map((type) => {
                    return (
                      <button
                        key={type}
                        onClick={() => handleDisasterSelect(type)}
                        className="bg-white dark:bg-slate-800/60 hover:bg-sky-50 dark:hover:bg-sky-900/60 border border-slate-200 dark:border-slate-700/50 hover:border-sky-400 p-4 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-200 hover:text-sky-500 dark:hover:text-sky-300 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(56,189,248,0.15)] flex flex-col items-center justify-center text-center shadow-sm"
                      >
                        <span className="text-3xl mb-2 drop-shadow-md">{getDisasterEmoji(type)}</span>
                        <span className="tracking-wide">{type}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="relative group">
                {/* Animated Background Glow */}
                <div className="absolute -inset-1 bg-gradient-to-r from-sky-400 via-blue-500 to-emerald-400 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                
                <div className="relative space-y-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl p-8 rounded-3xl border border-white/40 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                  {/* Header Row */}
                  <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-white/10">
                    <div className="flex items-center space-x-3">
                      <span className="text-4xl drop-shadow-lg">{getDisasterEmoji(disasterType)}</span>
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">Selected Emergency</span>
                        <span className="text-2xl font-black text-sky-600 dark:text-sky-400 tracking-tight">{disasterType}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setDisasterType('')} 
                      className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition shadow-inner border border-slate-200 dark:border-slate-700"
                    >
                      CHANGE
                    </button>
                  </div>

                  {/* Location Radar Box */}
                  <div className="bg-slate-50 dark:bg-[#070b1a] p-5 rounded-2xl flex items-start border border-slate-200 dark:border-sky-500/20 shadow-inner relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none"></div>
                    <div className="relative z-10 flex w-full">
                      <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center mr-4 flex-shrink-0 animate-pulse border border-red-500/20">
                        <MapPin className="text-red-500 w-5 h-5" />
                      </div>
                      <div className="flex-grow">
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1 flex items-center">
                          Live Coordinates Locked
                          <span className="ml-2 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">{address}</p>
                        {location && (
                          <div className="mt-2 inline-flex items-center bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
                            <Navigation className="w-3 h-3 text-sky-500 mr-1.5" />
                            <p className="text-[10px] text-sky-600 dark:text-sky-400 font-mono tracking-widest">
                              {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Visual Evidence Upload */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center uppercase tracking-widest">
                      <Camera className="w-4 h-4 mr-2 text-sky-500" /> Visual Evidence
                    </h3>
                    <div className="relative group/upload">
                      <div className="absolute inset-0 bg-gradient-to-r from-sky-500/10 to-blue-500/10 rounded-2xl blur opacity-0 group-hover/upload:opacity-100 transition-opacity"></div>
                      <div className="relative border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-500 bg-white dark:bg-slate-900/50 p-6 rounded-2xl transition-colors text-center cursor-pointer">
                        <input 
                          type="file" 
                          accept="image/*,video/*"
                          onChange={handleFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <Camera className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-500 mb-3 group-hover/upload:text-sky-500 transition-colors" />
                        <span className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Click or drag media here</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Supports Images & Video</span>
                        {media && (
                          <div className="mt-4 inline-flex items-center bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mr-2" />
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{media.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button 
                      onClick={handleSubmit}
                      disabled={isSubmitting || !location || (!media && !dynamicPrecautions)}
                      className="relative w-full overflow-hidden rounded-2xl group/btn disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 group-hover/btn:bg-[length:200%_auto] animate-gradient-x transition-all duration-500"></div>
                      <div className="relative bg-white/10 dark:bg-black/10 backdrop-blur-sm text-white py-5 px-6 flex items-center justify-center border border-white/20">
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin mr-3" /> 
                            <span className="font-black tracking-widest uppercase">Processing Request...</span>
                          </>
                        ) : (
                          <>
                            <span className="font-black text-xl tracking-widest uppercase drop-shadow-md">SUBMIT EMERGENCY REPORT</span>
                            <Navigation className="w-6 h-6 ml-3 drop-shadow-md group-hover/btn:translate-x-1 transition-transform" />
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
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

            <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden">
              <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-4 border-b border-slate-300 dark:border-slate-700 pb-2">Live Rescue Tracking</h3>
              
              <div className="space-y-4 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400 text-sm">Status</span>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${activeReport.status === 'assigned' ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400 animate-pulse' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
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
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-300 dark:border-slate-700/50">
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
                  <div className="text-center py-6 text-slate-500 text-sm italic bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                    <span className="block w-6 h-6 border-2 border-slate-400 dark:border-slate-600 border-t-sky-500 rounded-full animate-spin mx-auto mb-2"></span>
                    Waiting for Admin to assign the nearest rescue team...
                  </div>
                )}
              </div>

              {/* Google Maps Live Tracking */}
              <div className="w-full h-96 relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="absolute top-2 right-2 z-[1000] bg-slate-50 dark:bg-slate-900/80 text-sky-400 text-[10px] font-mono px-2 py-1 rounded border border-sky-500/30 shadow-[0_0_10px_rgba(56,189,248,0.2)]">
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
                  <div className="w-full h-full bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center">
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
              <div className="rounded-2xl border border-emerald-500/30 bg-slate-50 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.1)]">
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
                    <div className="h-64 overflow-y-auto p-4 space-y-3 bg-white dark:bg-slate-950/40">
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
                            <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">{msg.text}</p>
                            <p className="text-[9px] text-slate-500 mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-emerald-500/20 bg-white dark:bg-slate-950/60 flex space-x-2">
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
                        className="flex-1 bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
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

            <div className="relative group">
              {/* Cinematic Glow Behind Checklist */}
              <div className="absolute -inset-1 bg-gradient-to-r from-rose-500/20 via-red-500/10 to-orange-500/20 rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition duration-1000"></div>
              
              <div className="relative bg-white/70 dark:bg-[#11050a]/80 backdrop-blur-3xl border border-rose-100 dark:border-rose-500/20 p-8 rounded-3xl shadow-[0_8px_30px_rgb(225,29,72,0.08)] overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-40 pointer-events-none flex items-center">
                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping mr-2"></div>
                  <span className="text-[9px] font-mono font-black tracking-widest text-rose-500 uppercase">AI PROTOCOL: {activeReport.state}</span>
                </div>
                
                <h3 className="font-black text-2xl text-rose-600 dark:text-rose-400 mb-2 flex items-center tracking-tight drop-shadow-sm">
                  <ShieldAlert className="w-6 h-6 mr-3 text-rose-500 animate-pulse" /> 10-Minute Action Plan
                </h3>
                <p className="text-sm font-medium text-slate-600 dark:text-rose-200/70 mb-6 flex items-center">
                  <span className="w-1 h-4 bg-rose-500 rounded-full mr-2"></span>
                  Follow these survival instructions until {activeReport.assignedTeam?.teamName || 'rescue'} arrives
                </p>
                
                {!dynamicPrecautions ? (
                  <div className="flex items-center justify-center py-10 bg-white/50 dark:bg-black/20 rounded-2xl border border-dashed border-rose-200 dark:border-rose-900/50">
                     <span className="animate-spin w-5 h-5 border-2 border-rose-500/30 border-t-rose-500 rounded-full mr-3"></span>
                     <span className="text-sm font-bold text-rose-500/80 tracking-widest uppercase animate-pulse">Computing Geographic Protocols...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Glowing Progress Bar */}
                    <div className="mb-6 relative">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-rose-300/50">Completion</span>
                        <span className="text-[10px] font-black font-mono text-rose-600 dark:text-rose-400">{Math.round((completedTasks.length / dynamicPrecautions.length) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-200/50 dark:bg-rose-950/50 rounded-full h-2 border border-white dark:border-rose-900/50 overflow-hidden shadow-inner relative">
                        <div 
                          className="absolute top-0 left-0 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(225,29,72,0.5)]"
                          style={{ 
                            width: `${(completedTasks.length / dynamicPrecautions.length) * 100}%`,
                            backgroundImage: completedTasks.length === dynamicPrecautions.length ? 'linear-gradient(to right, #10b981, #34d399)' : 'linear-gradient(to right, #e11d48, #fb7185)'
                          }}
                        ></div>
                      </div>
                    </div>
                    
                    {/* Interactive Protocol Checkboxes */}
                    <div className="space-y-3">
                      {dynamicPrecautions.map((prec, idx) => {
                        const isCompleted = completedTasks.includes(idx);
                        return (
                          <button
                            key={idx}
                            onClick={() => toggleTask(idx)}
                            className={`w-full flex items-center text-left p-4 rounded-2xl border transition-all duration-300 group/task shadow-sm hover:shadow-md ${
                              isCompleted 
                                ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-300 dark:hover:border-emerald-500/40' 
                                : 'bg-white/80 dark:bg-rose-950/20 border-slate-200 dark:border-rose-500/20 hover:border-rose-400 dark:hover:border-rose-500/50 hover:-translate-y-0.5 hover:bg-white dark:hover:bg-rose-900/30'
                            }`}
                          >
                            <div className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mr-4 transition-all duration-300 border-2 ${
                              isCompleted 
                                ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)] scale-110' 
                                : 'bg-transparent border-slate-300 dark:border-rose-500/50 group-hover/task:border-rose-500'
                            }`}>
                              <CheckCircle className={`w-4 h-4 text-white transition-opacity duration-300 ${isCompleted ? 'opacity-100' : 'opacity-0'}`} />
                            </div>
                            <span className={`text-sm font-medium leading-relaxed transition-colors duration-300 ${
                              isCompleted ? 'text-emerald-700 dark:text-emerald-400/80 line-through' : 'text-slate-700 dark:text-rose-100'
                            }`}>{prec}</span>
                          </button>
                        );
                      })}
                    </div>
                    
                    {/* Success Badge */}
                    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${completedTasks.length === dynamicPrecautions.length ? 'max-h-24 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                      <div className="p-4 bg-emerald-100/50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                        <CheckCircle className="w-5 h-5 text-emerald-500 mr-2 animate-bounce" />
                        <p className="text-emerald-700 dark:text-emerald-400 font-black text-sm uppercase tracking-wider">Protocol Complete. Await Evacuation.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Acoustic Rubble Beacon UI */}
            <div className={`mt-6 border-2 rounded-2xl p-6 transition-colors duration-300 ${isBeaconActive ? 'bg-red-900/30 border-red-500/50' : 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700'}`}>
              <div className="flex flex-col items-center text-center">
                <button 
                  onClick={toggleBeacon}
                  className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-300 mb-4 ${isBeaconActive ? 'border-red-500 bg-red-500/20 text-red-500 animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.6)]' : 'border-slate-400 dark:border-slate-600 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-red-400 hover:text-red-400'}`}
                >
                  {isBeaconActive ? <Volume2 className="w-10 h-10 animate-ping" /> : <VolumeX className="w-10 h-10" />}
                </button>
                <h3 className={`text-xl font-bold mb-2 ${isBeaconActive ? 'text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                  Acoustic Rubble Beacon
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm">
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
              <button onClick={() => setStep('home')} className="mr-4 p-2 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:bg-slate-700/80 rounded-lg text-slate-600 dark:text-slate-400 hover:text-white transition-all duration-200 border border-transparent hover:border-slate-400 dark:border-slate-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">Emergency Services</h2>
            </div>
            
            <div className="flex flex-col space-y-8 max-w-md mx-auto w-full pt-8">
              {/* Massive Hands-Free Voice SOS Trigger */}
              <div className="relative group/sos">
                {/* AI Aura Glowing Background */}
                <div className={`absolute -inset-4 rounded-[3rem] blur-2xl transition-all duration-1000 ${isListening ? 'bg-gradient-to-r from-sky-500/40 via-indigo-500/40 to-emerald-500/40 opacity-100 animate-pulse' : 'bg-sky-500/10 opacity-0 group-hover/sos:opacity-50'}`}></div>
                
                <div className="relative bg-white/60 dark:bg-[#070b1a]/80 backdrop-blur-3xl border border-white/50 dark:border-white/10 rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
                  
                  {/* Siri-like active wave effect */}
                  {isListening && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                      <div className="w-full h-1/2 bg-gradient-to-b from-transparent via-sky-500 to-transparent animate-scan"></div>
                    </div>
                  )}

                  {/* The Microphone Button */}
                  <div className="relative w-32 h-32 flex items-center justify-center mb-8">
                    {/* Ripple Rings */}
                    <div className={`absolute inset-0 rounded-full border-2 border-sky-400 transition-all duration-1000 ${isListening ? 'scale-[1.8] opacity-0 animate-ping' : 'scale-100 opacity-20'}`}></div>
                    <div className={`absolute inset-0 rounded-full border-2 border-indigo-400 transition-all duration-1000 delay-150 ${isListening ? 'scale-[1.4] opacity-0 animate-ping' : 'scale-100 opacity-0'}`}></div>
                    
                    <button 
                      onClick={handleVoiceSOSClick}
                      className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${
                        isListening 
                          ? 'bg-gradient-to-br from-sky-400 to-indigo-500 text-white scale-110 shadow-[0_0_50px_rgba(56,189,248,0.6)]' 
                          : 'bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 border border-white/50 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-sky-500 hover:border-sky-500/50 hover:shadow-[0_0_30px_rgba(56,189,248,0.2)]'
                      }`}
                    >
                      {isListening ? (
                        <div className="relative flex items-center justify-center w-full h-full">
                          <Loader2 className="w-14 h-14 animate-spin opacity-20 absolute" />
                          <Mic className="w-12 h-12 animate-pulse drop-shadow-md" />
                        </div>
                      ) : (
                        <MicOff className="w-12 h-12 transition-transform duration-300 group-hover/sos:scale-110" />
                      )}
                    </button>
                  </div>
                  
                  <h3 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 dark:from-white dark:to-slate-400 relative z-10 tracking-tight">
                    {isListening ? "Listening to Emergency..." : "Hands-Free SOS"}
                  </h3>
                  
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-3 max-w-[250px] relative z-10 leading-relaxed">
                    {isListening 
                      ? <span className="text-sky-500 dark:text-sky-400 animate-pulse">"Speak clearly: e.g. 'Help, I am trapped in a fire!'"</span>
                      : "Tap the microphone. AI will auto-detect the disaster and dispatch teams instantly."}
                  </p>
                  
                  {isListening && voiceTranscript && (
                    <div className="mt-8 p-5 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl w-full text-left relative z-10 backdrop-blur-md shadow-inner">
                      <div className="flex items-center mb-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping mr-2"></div>
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">Live Transcript</span>
                      </div>
                      <span className="text-base text-slate-800 dark:text-white font-medium leading-relaxed italic">"{voiceTranscript}"</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
