import { useDisasterStore } from '../store/useDisasterStore';

interface TelemetryData {
  activeDisasters: { type: string; name: string; severity: number; radius: number }[];
  activeSosCount: number;
  criticalSosCount: number;
  blockedRoadCount: number;
  shelterCapacityUsed: number;
  activeRescueTeams: number;
  dangerEscalation: number;
  internetStatus: 'online' | 'offline';
}

const generateOfflineBriefing = (telemetry: TelemetryData): string => {
  const {
    activeDisasters,
    activeSosCount,
    criticalSosCount,
    blockedRoadCount,
    shelterCapacityUsed,
    activeRescueTeams,
    dangerEscalation,
    internetStatus
  } = telemetry;

  const timestamp = new Date().toLocaleTimeString();

  let brief = `[TACTICAL SITREP — SECURE CHANNEL — ${timestamp}]\n\n`;

  if (internetStatus === 'offline') {
    brief += `🚨 [COMMUNICATION BLACKOUT ACTIVE]\nCentral servers are unreachable. RESQNET mesh-grid communication nodes are active. SOS requests are queueing to localized survival registers. Directing local civilian units to follow cached emergency manuals.\n\n`;
  }

  // Threat Assessment
  brief += `⚡ [THREAT LEVEL ASSESS: MULTIPLIER ${dangerEscalation}.0X]\n`;
  if (activeDisasters.length === 0) {
    brief += `• All sectors clear. Monitoring active tectonic lines and coastal storm indicators.\n`;
  } else {
    activeDisasters.forEach(d => {
      brief += `• ${d.name.toUpperCase()} (Severity: ${d.severity}/10) is active. Danger zone radius expanded to ${Math.round(d.radius)} meters. Soil saturation levels rising.\n`;
    });
  }

  // Tactical Operations
  brief += `\n🎯 [TACTICAL OPERATIONS & LOGISTICS]\n`;
  if (activeSosCount > 0) {
    brief += `• Active Beacons: ${activeSosCount} SOS signals currently emitting telemetry. ${criticalSosCount} categorized as CRITICAL TRIASED.\n`;
    brief += `• Extraction Protocol: ${activeRescueTeams} squads mobilized. Air and ground rescue routing is adjusted dynamically.\n`;
  } else {
    brief += `• Operational Status: Zero pending civilian SOS beacons. All active responders in holding patterns.\n`;
  }

  if (blockedRoadCount > 0) {
    brief += `• Route Blockages: ${blockedRoadCount} major transit routes collapsed or flooded. Obstruction warnings issued. Responders rerouting through auxiliary mesh paths.\n`;
  } else {
    brief += `• Route Integrity: Standard rescue lanes are 100% clear. Route integrity holds.\n`;
  }

  brief += `• Base Shelter Capacity: Safe zone shelter density currently standing at ${shelterCapacityUsed}% capacity.\n`;

  // Dynamic Heuristic Command Recommendation
  brief += `\n💬 [COMMAND INTELLIGENCE ADVISORY]\n`;
  if (criticalSosCount > 0) {
    if (activeDisasters.some(d => d.type === 'flood')) {
      brief += `*ADVISORY*: High water rescue vectors are saturated. Prioritizing Air evac units (SQUAD VALKYRIE) to structural flood entrapments. Ground squads to establish high-ground supply depots.`;
    } else if (activeDisasters.some(d => d.type === 'earthquake')) {
      brief += `*ADVISORY*: Seismic aftershocks expected. Prioritizing Med units to high-occupancy structural failures. Ground squads utilizing acoustic debris scopes at sector centroids.`;
    } else {
      brief += `*ADVISORY*: Triage queue active. Focus extraction forces on critical multi-occupant beacons.`;
    }
  } else if (activeDisasters.length > 0) {
    brief += `*ADVISORY*: Secure perimeter lines. Responders should clear debris from primary evacuation lanes to maintain connection routes.`;
  } else {
    brief += `*ADVISORY*: Tactical Command indicates green status across all coordinate zones. Maintain standby readiness.`;
  }

  return brief;
};

export const getRealtimeBriefing = async (): Promise<string> => {
  const store = useDisasterStore.getState();
  
  // Prepare telemetry context
  const activeDisasters = store.disasters.filter(d => d.status === 'active');
  const activeSos = store.sosRequests.filter(s => s.status !== 'rescued');
  const criticalSos = activeSos.filter(s => s.severity === 'critical');
  
  const totalShelterCapacity = store.shelters.reduce((acc, sh) => acc + sh.capacity, 0);
  const totalShelterOccupants = store.shelters.reduce((acc, sh) => acc + sh.occupants, 0);
  const shelterUsagePercentage = totalShelterCapacity > 0 
    ? Math.round((totalShelterOccupants / totalShelterCapacity) * 100) 
    : 0;

  const telemetry: TelemetryData = {
    activeDisasters: activeDisasters.map(d => ({ type: d.type, name: d.name, severity: d.severity, radius: d.radius })),
    activeSosCount: activeSos.length,
    criticalSosCount: criticalSos.length,
    blockedRoadCount: store.blockedRoads.length,
    shelterCapacityUsed: shelterUsagePercentage,
    activeRescueTeams: store.rescueTeams.filter(t => t.status !== 'idle').length,
    dangerEscalation: store.dangerEscalation,
    internetStatus: store.internetStatus
  };
  const apiKey = store.apiKey;

  // If offline, no API key, or cloud is unreachable, return highly realistic heuristic sitsummary
  if (store.internetStatus === 'offline' || !apiKey || !store.isCloudReachable) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(generateOfflineBriefing(telemetry));
      }, 600); // Small realistic delay
    });
  }

  // Construct prompt for Gemini
  const prompt = `
You are RESQNET AI, a highly advanced emergency command intelligence system operating on military-grade tactical channels.
Generate a concise, high-fidelity real-time situational briefing (SITREP) based on the following disaster telemetry:

- Active Disasters: ${JSON.stringify(telemetry.activeDisasters)}
- Active SOS requests: ${telemetry.activeSosCount} (with ${telemetry.criticalSosCount} critical/life-threatening traps)
- Blocked transit routes: ${telemetry.blockedRoadCount}
- Active rescue squads dispatched: ${telemetry.activeRescueTeams}
- Evacuation shelters capacity utilization: ${telemetry.shelterCapacityUsed}%
- Threat escalation level: ${telemetry.dangerEscalation}/5 (multiplies impact severity)
- Network connectivity state: ONLINE

Format guidelines:
- Present this Sitrep like a secure tactical command brief. Use capitalised headers in square brackets (e.g., [TACTICAL SITREP], [THREAT ASSESSMENT], [COMMAND RECOMMENDATIONS]).
- Keep it highly professional, clean, realistic, and serious. No conversational intro/outro. Use bullet points for specific telemetry items.
- Write about 3 brief paragraphs.
- Provide actionable recommendations for emergency squads, citing how to route around the ${telemetry.blockedRoadCount} blocked roads and which active rescue teams to deploy where.
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gemini API Error: Status ${response.status}`);
    }

    const data = await response.json();
    const briefingText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (briefingText) {
      return briefingText;
    } else {
      throw new Error('Invalid response structure from Gemini API');
    }
  } catch (error) {
    console.error('Failed to fetch from Gemini API, falling back to heuristic engine:', error);
    // Mark cloud as unreachable in store so subsequent AI brief requests bypass fetch
    store.setCloudReachable(false);
    return `[WARNING: ENCRYPTION FALLBACK GRID DEPLOYED]\nFailed to query secondary neural cognitive model. Reverting to local heuristic analysis.\n\n` + generateOfflineBriefing(telemetry);
  }
};

export interface CouncilBriefs {
  coordinator: string;
  medical: string;
  logistics: string;
}

const generateOfflineCouncilBriefs = (telemetry: TelemetryData): CouncilBriefs => {
  const { activeDisasters, activeSosCount, criticalSosCount, blockedRoadCount, shelterCapacityUsed } = telemetry;
  
  const hasFlood = activeDisasters.some(d => d.type === 'flood');
  const hasQuake = activeDisasters.some(d => d.type === 'earthquake');
  
  let coordinator = `[CRISIS COORDINATION DIRECTIVE]\n`;
  if (activeSosCount > 0) {
    coordinator += `• Status: ${activeSosCount} active beacon(s) verified. Priority level: CRITICAL due to ${criticalSosCount} high-occupancy trap alerts.\n`;
    coordinator += `• Directive: Mobilizing responder squads immediately. Priority 1 is extraction at critical threat coordinates.\n`;
  } else {
    coordinator += `• Status: Standby. All sectors report normal flow. No active distress signals logged.\n`;
  }
  coordinator += `• Resource Allocation: Shelter grids currently at ${shelterCapacityUsed}% capacity. Dadar and Colaba bases holding active reserves.`;

  let medical = `[HEALTH & MEDICAL TACTICAL ADVISORY]\n`;
  if (hasFlood) {
    medical += `• Health Hazards: Water contamination risks are high. Risk of waterborne disease and hypothermia in flooded sectors.\n`;
    medical += `• Medical Actions: Pre-positioning trauma kits, life vests, and water purification units at central shelters.\n`;
  } else if (hasQuake) {
    medical += `• Health Hazards: Structural crush injuries and dust inhalation risk. Power failures threaten life-support systems.\n`;
    medical += `• Medical Actions: Emergency transport dispatch active. Medical squads deployed to debris centroids.`;
  } else {
    medical += `• Health Hazards: Baseline. Normal medical surveillance in progress.\n`;
    medical += `• Medical Actions: Shelter health screening teams remain on standby.`;
  }

  let logistics = `[LOGISTICAL SUPPLY CHAIN PLANNING]\n`;
  if (blockedRoadCount > 0) {
    logistics += `• Route Integrity: ${blockedRoadCount} blocked roadway sector(s) detected. High-level detours required.\n`;
    logistics += `• Fleet Status: Directing air-evac (SQUAD VALKYRIE) to bypass surface blocks. Ground teams to route through secondary grid corridors.\n`;
  } else {
    logistics += `• Route Integrity: Main supply corridors are 100% green. Speed margins normal.\n`;
  }
  logistics += `• Volunteer Matching: Committing volunteer rescue vectors to supply transit hubs.`;

  return { coordinator, medical, logistics };
};

export const getMultiAgentBriefing = async (): Promise<CouncilBriefs> => {
  const store = useDisasterStore.getState();
  
  // Prepare telemetry context
  const activeDisasters = store.disasters.filter(d => d.status === 'active');
  const activeSos = store.sosRequests.filter(s => s.status !== 'rescued');
  const criticalSos = activeSos.filter(s => s.severity === 'critical');
  
  const totalShelterCapacity = store.shelters.reduce((acc, sh) => acc + sh.capacity, 0);
  const totalShelterOccupants = store.shelters.reduce((acc, sh) => acc + sh.occupants, 0);
  const shelterUsagePercentage = totalShelterCapacity > 0 
    ? Math.round((totalShelterOccupants / totalShelterCapacity) * 100) 
    : 0;

  const telemetry: TelemetryData = {
    activeDisasters: activeDisasters.map(d => ({ type: d.type, name: d.name, severity: d.severity, radius: d.radius })),
    activeSosCount: activeSos.length,
    criticalSosCount: criticalSos.length,
    blockedRoadCount: store.blockedRoads.length,
    shelterCapacityUsed: shelterUsagePercentage,
    activeRescueTeams: store.rescueTeams.filter(t => t.status !== 'idle').length,
    dangerEscalation: store.dangerEscalation,
    internetStatus: store.internetStatus
  };
  const apiKey = store.apiKey;

  if (store.internetStatus === 'offline' || !apiKey || !store.isCloudReachable) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(generateOfflineCouncilBriefs(telemetry));
      }, 700);
    });
  }

  const queryAgent = async (rolePrompt: string): Promise<string> => {
    const fullPrompt = `
You are an expert AI emergency responder on the RESQNET AI Council.
Analyze the following active disaster telemetry:
- Active Disasters: ${JSON.stringify(telemetry.activeDisasters)}
- Active SOS requests: ${telemetry.activeSosCount} (with ${telemetry.criticalSosCount} critical traps)
- Blocked transit routes: ${telemetry.blockedRoadCount}
- Active rescue squads dispatched: ${telemetry.activeRescueTeams}
- Evacuation shelters capacity utilization: ${telemetry.shelterCapacityUsed}%
- Threat level: ${telemetry.dangerEscalation}/5

Your specific role instructions:
${rolePrompt}

Format guidelines:
- Respond in a direct, highly professional command tone.
- Do NOT include markdown styling or headers (no #, no **).
- Do NOT write conversational introductions or conclusions.
- Keep it concise, between 2 to 4 bullet points maximum.
`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from advisor.';
    } catch (err) {
      console.error('Failed to fetch from advisor:', err);
      throw err;
    }
  };

  try {
    const roles = {
      coordinator: "You are the Coordinator. Decide priority, triage emergency alerts, and outline immediate personnel resources needed.",
      medical: "You are the Medical Advisor. Identify health risks, water/chemical hazards, specify medical supplies needed (oxygen, trauma gear), and assign medical units.",
      logistics: "You are the Logistics Planner. Map rescue routes avoiding blocked sectors, choose vehicles (boat, truck, helicopter), and coordinate supply transport."
    };

    const [coordinator, medical, logistics] = await Promise.all([
      queryAgent(roles.coordinator),
      queryAgent(roles.medical),
      queryAgent(roles.logistics)
    ]);

    return { coordinator, medical, logistics };
  } catch (error) {
    console.warn('AI Council query failed. Reverting to local heuristic council:', error);
    return generateOfflineCouncilBriefs(telemetry);
  }
};

export interface ClassifiedVoiceSOS {
  type: 'flood' | 'trapped' | 'medical' | 'blackout' | 'road_block' | 'other';
  occupants: number;
  message: string;
}

export const classifyVoiceTranscription = async (transcript: string): Promise<ClassifiedVoiceSOS> => {
  const store = useDisasterStore.getState();
  const apiKey = store.apiKey;

  // Local fallback keyword classifier if offline/unreachable
  const fallbackClassify = (text: string): ClassifiedVoiceSOS => {
    const textLower = text.toLowerCase();
    let type: ClassifiedVoiceSOS['type'] = 'other';
    let occupants = 1;

    if (textLower.includes('flood') || textLower.includes('water') || textLower.includes('drown') || textLower.includes('river')) {
      type = 'flood';
    } else if (textLower.includes('collapse') || textLower.includes('stuck') || textLower.includes('trapped') || textLower.includes('rubble')) {
      type = 'trapped';
    } else if (textLower.includes('doctor') || textLower.includes('bleed') || textLower.includes('heart') || textLower.includes('oxygen') || textLower.includes('medical') || textLower.includes('injury')) {
      type = 'medical';
    } else if (textLower.includes('outage') || textLower.includes('power') || textLower.includes('dark') || textLower.includes('generator')) {
      type = 'blackout';
    } else if (textLower.includes('road') || textLower.includes('debris') || textLower.includes('highway') || textLower.includes('landslide')) {
      type = 'road_block';
    }

    // Try to parse occupants count
    const numWords: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    const words = textLower.split(/\s+/);
    for (const word of words) {
      if (numWords[word]) {
        occupants = numWords[word];
        break;
      }
      const num = parseInt(word);
      if (!isNaN(num) && num > 0) {
        occupants = num;
        break;
      }
    }

    return { type, occupants, message: text };
  };

  if (store.internetStatus === 'offline' || !apiKey || !store.isCloudReachable) {
    return fallbackClassify(transcript);
  }

  const prompt = `
Analyze the following transcribed emergency audio clip text and classify it into a structured JSON payload:
Transcription: "${transcript}"

Select the matching emergency category from these options: 'flood', 'trapped', 'medical', 'blackout', 'road_block', 'other'.
Detect the number of people affected or trapped (default to 1 if unspecified).
Extract or clean up the transcribed emergency message text.

Respond ONLY with a valid JSON block of this shape (do not include any markdown, backticks, or extra text, just raw JSON):
{
  "type": "flood" | "trapped" | "medical" | "blackout" | "road_block" | "other",
  "occupants": number,
  "message": "cleaned description text"
}
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Sanitize in case Gemini wrapped in markdown code blocks
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    return {
      type: parsed.type || 'other',
      occupants: Number(parsed.occupants) || 1,
      message: parsed.message || transcript
    };
  } catch (err) {
    console.warn('Voice transcription Gemini classification failed, falling back to keywords:', err);
    return fallbackClassify(transcript);
  }
};

export interface FakeIncidentResult {
  isFake: boolean;
  reason: string;
}

export const detectFakeIncident = async (message: string): Promise<FakeIncidentResult> => {
  const store = useDisasterStore.getState();
  const apiKey = store.apiKey;

  // Local fallback keyword classifier if offline/unreachable
  const fallbackCheck = (text: string): FakeIncidentResult => {
    const textLower = text.toLowerCase();
    const fakeKeywords = [
      'joke', 'haha', 'prank', 'fake text', 'test text', 'testing this app', 'not a real emergency',
      'just kidding', 'kidding', 'lol', 'fake emergency', 'fake report', 'dummy report', 'mock alert',
      'this is a drill', 'this is a test', 'dummy alert', 'just a test', 'troll'
    ];

    for (const keyword of fakeKeywords) {
      if (textLower.includes(keyword)) {
        return {
          isFake: true,
          reason: `Flagged by keyword analyzer: contains reference to '${keyword}'.`
        };
      }
    }

    return { isFake: false, reason: 'Verified via local rule scanner.' };
  };

  if (store.internetStatus === 'offline' || !apiKey || !store.isCloudReachable) {
    return fallbackCheck(message);
  }

  const prompt = `
You are an expert AI emergency dispatcher trained to detect fake, spam, prank, or testing emergency reports.
Analyze the following incoming SOS message details:
"${message}"

Determine if this is a fake emergency, a joke, spam, or just testing text.
Respond ONLY with a valid JSON block of this shape (do not include any markdown, backticks, or extra text, just raw JSON):
{
  "isFake": boolean,
  "reason": "short explanation of why it is flagged as fake, or 'Verified' if legitimate"
}
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Sanitize in case Gemini wrapped in markdown code blocks
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    return {
      isFake: !!parsed.isFake,
      reason: parsed.reason || (parsed.isFake ? 'Flagged suspicious by central AI.' : 'Verified.')
    };
  } catch (err) {
    console.warn('Fake incident detector Gemini check failed, falling back to keywords:', err);
    return fallbackCheck(message);
  }
};

const LOCAL_GEO_REGISTRY: Record<string, [number, number]> = {
  // Goa landmarks
  'panaji': [15.4909, 73.8278],
  'panaji beach': [15.4989, 73.8122],
  'vasco': [15.3960, 73.8120],
  'vasco da gama': [15.3960, 73.8120],
  'margao': [15.2736, 73.9582],
  'mapusa': [15.5930, 73.8140],
  'calangute': [15.5442, 73.7686],
  'baga': [15.5562, 73.7517],
  'colva': [15.2783, 73.9117],
  'dona paula': [15.4529, 73.8022],
  'porvorim': [15.5262, 73.8252],
  // Maharashtra landmarks
  'mumbai': [19.0760, 72.8777],
  'pune': [18.5204, 73.8567],
  'nagpur': [21.1458, 79.0882],
  'dadar': [19.0178, 72.8478],
  'colaba': [18.9067, 72.8147],
  'andheri': [19.1136, 72.8697],
  'bandra': [19.0596, 72.8295],
  'kurla': [19.0720, 72.8820],
  'sion': [19.0390, 72.8610],
  'dharavi': [19.0380, 72.8538],
  'thane': [19.2183, 72.9781],
  // Delhi landmarks
  'delhi': [28.6139, 77.2090],
  'connaught place': [28.6304, 77.2177],
  'dwarka': [28.5810, 77.0588],
  'noida': [28.6273, 77.3725],
  'karol bagh': [28.6438, 77.1903],
  'gurugram': [28.4595, 77.0266],
  'saket': [28.5244, 77.2066],
  // Karnataka landmarks
  'bengaluru': [12.9716, 77.5946],
  'koramangala': [12.9352, 77.6244],
  'whitefield': [12.9698, 77.7500],
  'yelahanka': [13.1007, 77.5963],
  'indiranagar': [12.9784, 77.6408],
  'jayanagar': [12.9307, 77.5835],
  // Tamil Nadu landmarks
  'chennai': [13.0827, 80.2707],
  't. nagar': [13.0418, 80.2341],
  'adyar': [13.0012, 80.2565],
  'velachery': [12.9801, 80.2228],
  'marina beach': [13.0499, 80.2824],
  // West Bengal landmarks
  'kolkata': [22.5726, 88.3639],
  'park street': [22.5487, 88.3512],
  'salt lake': [22.5724, 88.4233],
  'howrah': [22.5851, 88.3187],
  // Andhra Pradesh
  'amaravati': [16.5748, 80.3572],
  'visakhapatnam': [17.6868, 83.2185],
  'vijayawada': [16.5062, 80.6480],
  // Gujarat
  'gandhinagar': [23.2156, 72.6369],
  'ahmedabad': [23.0225, 72.5714],
  'surat': [21.1702, 72.8311],
  // Rajasthan
  'jaipur': [26.9124, 75.7873],
  'jodhpur': [26.2389, 73.0243],
  'udaipur': [24.5854, 73.7125],
  // Uttar Pradesh
  'lucknow': [26.8467, 80.9462],
  'kanpur': [26.4499, 80.3319],
  'varanasi': [25.3176, 82.9739],
  // Other Capitals
  'patna': [25.5941, 85.1376],
  'bhopal': [23.2599, 77.4126],
  'raipur': [21.2514, 81.6296],
  'chandigarh': [30.7333, 76.7794],
  'ranchi': [23.3441, 85.3096],
  'thiruvananthapuram': [8.5241, 76.9366],
  'imphal': [24.8170, 93.9368],
  'shillong': [25.5788, 91.8933],
  'aizawl': [23.7271, 92.7176],
  'kohima': [25.6751, 94.1086],
  'bhubaneswar': [20.2961, 85.8245],
  'gangtok': [27.3314, 88.6138],
  'agartala': [23.8315, 91.2868],
  'dehradun': [30.3165, 78.0322],
  'srinagar': [34.0837, 74.7973],
  'jammu': [32.7266, 74.8570],
  'leh': [34.1526, 77.5771],
  'itanagar': [27.0844, 93.6053],
  'guwahati': [26.1445, 91.7362],
  'dispur': [26.1433, 91.7898]
};

const getRandomCoordsLocal = (center: [number, number], offset = 0.03): [number, number] => {
  return [
    center[0] + (Math.random() - 0.5) * offset,
    center[1] + (Math.random() - 0.5) * offset
  ];
};

const matchLocationCoords = (locationText: string, stateCenter: [number, number]): [number, number] => {
  const norm = locationText.toLowerCase().trim();
  if (!norm) return getRandomCoordsLocal(stateCenter, 0.04);
  
  // Try exact match or substring match in our registry
  for (const [key, coords] of Object.entries(LOCAL_GEO_REGISTRY)) {
    if (norm.includes(key) || key.includes(norm)) {
      return [
        coords[0] + (Math.random() - 0.5) * 0.003,
        coords[1] + (Math.random() - 0.5) * 0.003
      ];
    }
  }
  
  return getRandomCoordsLocal(stateCenter, 0.04);
};

const fallbackClassifyIncident = (text: string): { type: IncidentDetectionResult['type']; severity: number } => {
  const textLower = text.toLowerCase();
  let type: IncidentDetectionResult['type'] = 'flood';
  let severity = 6;

  if (textLower.includes('flood') || textLower.includes('water') || textLower.includes('drown') || textLower.includes('river') || textLower.includes('rain')) {
    type = 'flood';
    severity = textLower.includes('heavy') || textLower.includes('critical') ? 8 : 6;
  } else if (textLower.includes('earthquake') || textLower.includes('quake') || textLower.includes('tremor') || textLower.includes('seismic')) {
    type = 'earthquake';
    severity = textLower.includes('major') || textLower.includes('severe') ? 9 : 7;
  } else if (textLower.includes('cyclone') || textLower.includes('storm') || textLower.includes('wind') || textLower.includes('hurricane') || textLower.includes('typhoon')) {
    type = 'cyclone';
    severity = textLower.includes('severe') || textLower.includes('high speed') ? 8 : 6;
  } else if (textLower.includes('outage') || textLower.includes('power') || textLower.includes('grid') || textLower.includes('blackout') || textLower.includes('electricity')) {
    type = 'power_outage';
    severity = textLower.includes('total') || textLower.includes('hospitals affected') ? 8 : 5;
  } else if (textLower.includes('road') || textLower.includes('block') || textLower.includes('debris') || textLower.includes('landslide') || textLower.includes('fissure') || textLower.includes('highway')) {
    type = 'road_block';
    severity = textLower.includes('complete') || textLower.includes('main road') ? 7 : 5;
  } else if (textLower.includes('sos') || textLower.includes('help') || textLower.includes('trapped') || textLower.includes('injury') || textLower.includes('medical') || textLower.includes('rescue')) {
    type = 'sos';
    severity = textLower.includes('critical') || textLower.includes('dying') || textLower.includes('elderly') ? 9 : 7;
  }

  if (textLower.includes('urgent') || textLower.includes('critical') || textLower.includes('emergency') || textLower.includes('immediate')) {
    severity = Math.min(10, severity + 2);
  }

  return { type, severity };
};

export interface IncidentDetectionResult {
  lat: number;
  lng: number;
  type: 'flood' | 'earthquake' | 'cyclone' | 'power_outage' | 'road_block' | 'sos';
  severity: number;
  description: string;
}

export const detectIncidentFromDescription = async (
  city: string,
  locationName: string,
  description: string
): Promise<IncidentDetectionResult> => {
  const store = useDisasterStore.getState();
  const apiKey = store.apiKey;

  // Resolve state center coordinates
  const stateCenter = store.selectedCityCenter || [19.0760, 72.8777];

  const fallbackGeocode = (): IncidentDetectionResult => {
    const coords = matchLocationCoords(locationName || description, stateCenter);
    const { type, severity } = fallbackClassifyIncident(description + ' ' + locationName);
    return {
      lat: coords[0],
      lng: coords[1],
      type,
      severity,
      description: description || `Emergency reported at ${locationName}`
    };
  };

  if (store.internetStatus === 'offline' || !apiKey || !store.isCloudReachable) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(fallbackGeocode());
      }, 500);
    });
  }

  const prompt = `
You are an expert AI emergency geocoder and incident classifier for RESQNET AI.
Given the following inputs:
- Selected State/Union Territory: "${city}" (geographic center is roughly at ${JSON.stringify(stateCenter)})
- User reported specific location/landmark name: "${locationName}"
- User reported description of the incident: "${description}"

Perform the following:
1. Geocode the reported location to precise latitude and longitude coordinates. The coordinates MUST be strictly within the boundaries of the selected State "${city}". 
   Use your knowledge of Indian geography. For example, if the state is Goa (GA) and the location is Vasco, the coordinates should be around (15.39, 73.81). If the location is not a recognizable landmark, place the coordinates within a reasonable distance (e.g. within 0.1 degrees) of the state center coordinates ${JSON.stringify(stateCenter)}, but with a random offset so it doesn't overlap exactly at the center.
2. Classify the incident type into exactly one of these categories: 'flood', 'earthquake', 'cyclone', 'power_outage', 'road_block', 'sos'.
3. Estimate the severity of the incident on a scale of 1 to 10.
4. Clean up and summarize the incident description.

Respond ONLY with a valid JSON block of this shape (do not include any markdown, backticks, or extra text, just raw JSON):
{
  "lat": number,
  "lng": number,
  "type": "flood" | "earthquake" | "cyclone" | "power_outage" | "road_block" | "sos",
  "severity": number,
  "description": "cleaned summary description"
}
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    return {
      lat: Number(parsed.lat) || stateCenter[0],
      lng: Number(parsed.lng) || stateCenter[1],
      type: parsed.type || 'flood',
      severity: Number(parsed.severity) || 6,
      description: parsed.description || description
    };
  } catch (err) {
    console.warn('AI Incident detection failed, falling back to heuristic geocoder:', err);
    return fallbackGeocode();
  }
};

