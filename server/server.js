import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import twilio from 'twilio';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 1e7, // 10MB limit for image uploads over socket
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

const PORT = process.env.PORT || 5000;

// --- GEMINI AI IMAGE VERIFICATION ENDPOINT ---
app.post('/api/verify-image', async (req, res) => {
  const { base64Data, mimeType, disasterType } = req.body; // outside try so catch can access it
  if (!base64Data || !mimeType || !disasterType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const genAI = new GoogleGenerativeAI('AIzaSyA1uhtV1BczhkTxjqzYtYbScsrdR-WcZBk');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a strict disaster image verification AI. The user selected the disaster type: '${disasterType}'. Look at this image very carefully. Does this image CLEARLY show a '${disasterType}' disaster actively happening?

IMPORTANT RULES:
- A tree fallen on road = 'Tree Fall', NOT a flood
- Water covering roads/streets = 'Flood'
- Normal tree or park = NOT any disaster
- Normal road with no damage = NOT a disaster
- Be strict: if there is even slight doubt, return match: false
- Do NOT accept normal everyday photos as disasters

Respond ONLY with a raw JSON object (no markdown, no backticks, no explanation):
{ "match": true, "detected": "what you see", "severity": "High or Medium or Low", "casualties": "estimated or None visible", "analysis": "one sentence damage report" }`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType } }
    ]);

    let responseText = result.response.text().trim()
      .replace(/```json/g, '').replace(/```/g, '').trim();

    let aiDecision = null;
    try {
      aiDecision = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) aiDecision = JSON.parse(match[0]);
    }

    if (!aiDecision) {
      return res.status(422).json({ error: 'AI could not parse image. Upload a clearer photo.' });
    }

    return res.json(aiDecision);

  } catch (err) {
    console.warn('⚠️ Gemini offline, using local fallback AI:', err.message);

    // --- OFFLINE FALLBACK: Rule-based local verification ---
    const isImage = mimeType && mimeType.startsWith('image/');
    const offlineResult = {
      match: isImage,
      detected: isImage ? `[Offline Mode] ${disasterType} reported` : 'Not an image',
      severity: 'High',
      casualties: 'Unknown (Offline Mode)',
      analysis: `[OFFLINE] ${disasterType} incident reported. AI verification unavailable — manual admin review required.`,
      offline: true
    };
    return res.json(offlineResult);
  }
});

// --- IN-MEMORY DATABASE (Mocks MongoDB for Demo) ---
let userReports = [];
const GOA_DISASTERS = [
  'Flood', 'Coastal Flooding', 'Cyclone', 'Tree Fall', 'Landslide',
  'Waterlogging', 'Fire Accident', 'Boat Accident', 'Beach Drowning',
  'Building Collapse', 'Road Collapse', 'Power Failure', 'Oil Spill',
  'Heatwave', 'Drainage Overflow'
];

let rescueTeams = [];
const statesAndCities = {
  'Goa': { cities: ['Panaji', 'Margao', 'Vasco'], center: { lat: 15.4909, lng: 73.8278 } },
  'Maharashtra': { cities: ['Mumbai', 'Pune', 'Nagpur'], center: { lat: 19.0760, lng: 72.8777 } },
  'Karnataka': { cities: ['Bengaluru', 'Mangaluru', 'Hubli'], center: { lat: 12.9716, lng: 77.5946 } },
  'Delhi': { cities: ['New Delhi', 'Dwarka', 'Rohini'], center: { lat: 28.6139, lng: 77.2090 } },
  'Kerala': { cities: ['Kochi', 'Trivandrum', 'Kozhikode'], center: { lat: 9.9312, lng: 76.2673 } }
};

Object.keys(statesAndCities).forEach((stateName, sIdx) => {
  const data = statesAndCities[stateName];
  data.cities.forEach((cityName, cIdx) => {
    GOA_DISASTERS.forEach((disaster, dIdx) => {
      let tType = 'General Rescue';
      if (['Flood', 'Coastal Flooding', 'Boat Accident', 'Beach Drowning', 'Waterlogging', 'Oil Spill', 'Drainage Overflow'].includes(disaster)) tType = 'Water Rescue';
      else if (['Fire Accident'].includes(disaster)) tType = 'Fire Rescue';
      else if (['Building Collapse', 'Road Collapse', 'Landslide', 'Tree Fall', 'Earthquake', 'Cyclone'].includes(disaster)) tType = 'Heavy Rescue';
      else if (['Heatwave'].includes(disaster)) tType = 'Medical Rescue';
      else if (['Power Failure'].includes(disaster)) tType = 'Power Maintenance';
      
      const latOffset = (Math.random() - 0.5) * 0.1;
      const lngOffset = (Math.random() - 0.5) * 0.1;
      
      rescueTeams.push({
        _id: `t_${stateName.substring(0,2)}_${cIdx}_${dIdx}`,
        teamName: `${cityName} Special ${disaster} Unit`,
        teamType: tType,
        state: stateName,
        city: cityName,
        coordinates: { lat: data.center.lat + latOffset, lng: data.center.lng + lngOffset },
        available: true
      });
    });
  });
});

console.log('✅ Connected to In-Memory Database Mode');

// Socket.io Realtime Sync
io.on('connection', (socket) => {
  console.log(`📡 New client connected: ${socket.id}`);

  // When user submits a report
  socket.on('submit_report', (data) => {
    try {
      const newReport = {
        _id: 'rep_' + Date.now().toString(),
        userId: data.userId || socket.id,
        userName: data.userName || 'Civilian',
        userProfile: data.userProfile || null,
        disasterType: data.disasterType,
        coordinates: data.coordinates,
        address: data.address,
        state: data.state,
        media: data.media,
        severity: data.severity || 'medium',
        status: 'pending',
        assignedTeam: null,
        timestamp: new Date().toISOString()
      };
      
      userReports.push(newReport);

      // Emit new report to admins instantly
      io.emit('new_disaster_alert', newReport);
      // Confirm to user
      socket.emit('report_submitted_success', newReport);
    } catch (err) {
      socket.emit('report_error', { message: err.message });
    }
  });

  // When admin assigns a team
  socket.on('assign_team', (data) => {
    try {
      const { reportId, teamId } = data;
      
      const reportIndex = userReports.findIndex(r => r._id === reportId);
      const teamIndex = rescueTeams.findIndex(t => t._id === teamId);

      if (reportIndex !== -1 && teamIndex !== -1) {
        // Update Team Status
        rescueTeams[teamIndex].available = false;
        
        // Update Report Status
        userReports[reportIndex].status = 'assigned';
        userReports[reportIndex].assignedTeam = rescueTeams[teamIndex];

        // Broadcast to all clients
        io.emit('status_updated', userReports[reportIndex]);
        console.log(`✅ Rescue Team ${teamId} assigned to Report ${reportId}`);
        
        // --- TWILIO SMS ALERT TRIGGER ---
        try {
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          client.messages.create({
            body: `RESQNET EMERGENCY ALERT: The Admin has dispatched ${rescueTeams[teamIndex].teamName} to your location for the ${userReports[reportIndex].disasterType}. Team is en route. Check the live tracker!`,
            from: '+16186634564', // Placeholder virtual number (if this fails, it's usually because the user hasn't bought a number yet)
            to: '+918830190221'
          }).then(message => console.log('✅ Twilio SMS Sent! SID:', message.sid))
            .catch(err => {
              // Attempt fallback using Alphanumeric Sender ID
              client.messages.create({
                body: `RESQNET ALERT: ${rescueTeams[teamIndex].teamName} dispatched for your ${userReports[reportIndex].disasterType}. Check live tracker!`,
                from: 'RESQNET',
                to: '+918830190221'
              }).then(msg => console.log('✅ Twilio SMS Sent via Alpha Sender! SID:', msg.sid))
                .catch(e => console.error('❌ Twilio SMS Failed (Check your Twilio From Number):', e.message));
            });
        } catch (err) {
          console.error('❌ Twilio Init Error:', err.message);
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  // When operation is resolved
  socket.on('resolve_issue', (data) => {
    try {
      const { reportId } = data;
      const reportIndex = userReports.findIndex(r => r._id === reportId);
      
      if (reportIndex !== -1) {
        const report = userReports[reportIndex];
        
        if (report.assignedTeam) {
           // Free up team
           const teamIndex = rescueTeams.findIndex(t => t._id === report.assignedTeam._id);
           if (teamIndex !== -1) rescueTeams[teamIndex].available = true;
        }
        
        userReports[reportIndex].status = 'resolved';
        io.emit('status_updated', userReports[reportIndex]);
        console.log(`✅ Issue ${reportId} resolved.`);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// REST APIs
app.get('/api/reports', (req, res) => {
  try {
    // Return latest first
    res.json([...userReports].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teams', (req, res) => {
  try {
    res.json(rescueTeams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weather', async (req, res) => {
  const { lat, lon } = req.query;
  const weatherApiKey = process.env.OPENWEATHER_API_KEY;
  if (!weatherApiKey) {
     return res.json({ success: true, weather: { temp: 31, humidity: 80, windSpeed: 15, description: 'Mock Weather' }, fallbackActive: true });
  }
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({
      success: true,
      weather: { temp: data.main?.temp, humidity: data.main?.humidity, windSpeed: data.wind?.speed, description: data.weather?.[0]?.description }
    });
  } catch (err) {
    res.json({ success: true, weather: { temp: 31, humidity: 80, windSpeed: 15, description: 'Mock Weather' }, fallbackActive: true });
  }
});

httpServer.listen(PORT, () => {
  console.log(`🚀 ResqNet Eco-System Backend running on http://localhost:${PORT}`);
});
