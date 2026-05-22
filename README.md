# 🚨 ResqNet: Offline-First Disaster Management Eco-System

![ResqNet Dashboard](https://img.shields.io/badge/Status-Hackathon_Ready-success?style=for-the-badge) ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB) ![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white) ![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&logoColor=white)

**ResqNet** is a state-of-the-art, offline-first disaster response platform built to operate when traditional internet infrastructure fails. It seamlessly connects civilians in distress with emergency response teams using edge AI, local networking, and offline mapping.

## 🏆 Key Features Designed for Hackathons

### 1. 🧠 Edge AI Computer Vision (Zero Internet Required)
When networks go down, cloud APIs fail. ResqNet uses **TensorFlow.js (MobileNet + KNN Classifier)** running entirely inside the civilian's browser. It analyzes uploaded photos locally to instantly verify the disaster type (e.g., Flood vs. Landslide) before transmitting the alert, preventing false alarms from overwhelming the rescue dashboard. 

### 2. 📡 Local Intranet Sync (Socket.io)
ResqNet is designed to run on a localized emergency WiFi hotspot or mesh network. Using lightweight **Socket.io** web sockets, distress signals, GPS coordinates, and Base64 image data are instantly beamed from the civilian's phone to the Admin Command Center without ever touching the world wide web.

### 3. 🗺️ 100% Offline Maps
During a cyclone or earthquake, Google Maps won't load. ResqNet serves raw OpenStreetMap `.mbtiles` locally using a self-hosted tile server. Civilians and Admins get full-color, interactive maps (powered by Leaflet) to pinpoint exact GPS coordinates and track rescue teams completely offline.

### 4. 🚑 Real-Time Rescue Tracking
Once an Admin assigns a rescue team to a distress signal, the civilian's UI instantly transforms into a live-tracking dashboard. They can watch the ambulance or rescue boat move across the map in real-time, complete with a dynamically calculated ETA.

### 5. ☁️ Hybrid Cloud Fallback (Gemini & Twilio)
If the system detects an active internet connection, ResqNet automatically "upgrades" its capabilities:
- **Gemini 1.5 Flash:** Replaces the local KNN model to provide incredibly deep, multi-modal analysis of the disaster scene, estimating casualties and severity.
- **Twilio SMS:** Instantly blasts SMS text messages to the civilian's phone to notify them that a rescue team has been dispatched.

---

## 💻 Technology Stack

- **Frontend:** React 19, TailwindCSS, Vite, React-Leaflet, Zustand (State Management)
- **Backend:** Node.js, Express, Socket.io (Real-time bi-directional events)
- **Edge AI:** TensorFlow.js, pre-trained MobileNet feature extractor + KNN Classifier
- **Cloud AI:** Google Generative AI (Gemini 1.5 Flash)
- **Mapping:** Leaflet.js, OpenStreetMap
- **Communications:** Twilio Programmable SMS

---

## 🚀 How to Run Locally

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18+) installed on your machine.

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Eco-System
ResqNet uses `concurrently` to boot up the Backend Server, the Frontend Vite Server, and the Offline Map Tile Server all at once.
```bash
npm start
```

### 3. Access the Dashboards
- **Civilian Interface:** `http://localhost:5173/`
- **Admin Command Center:** `http://localhost:5173/admin`

---

## 🎯 How to Demo to Judges

1. **The Setup:** Disconnect your laptop from the internet to prove the offline capabilities!
2. **The Civilian (Phone):** Open the Civilian Interface. Select "Flood", allow GPS access, and upload a test image.
3. **The Edge AI:** Show the judges how the TensorFlow.js model instantly analyzes the image. Try uploading a picture of a cat instead of a flood—the system will strictly reject it!
4. **The Transmission:** Submit a valid image. Watch it instantly appear on the Admin Dashboard using local Socket.io.
5. **The Dispatch:** As the Admin, click "Assign Team" to dispatch the nearest unit.
6. **The Live Tracker:** Jump back to the Civilian view. The map instantly appears, showing the rescue team driving toward the distress location with a live ticking ETA.

---
*Built to save lives when the grid goes down.*
