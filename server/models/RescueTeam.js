import mongoose from 'mongoose';

const rescueTeamSchema = new mongoose.Schema({
  teamName: { type: String, required: true },
  teamType: { type: String, default: 'General Rescue' },
  state: { type: String, required: true },
  city: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  available: { type: Boolean, default: true },
  disastersHandled: { type: [String], default: [] }
});

const RescueTeam = mongoose.model('RescueTeam', rescueTeamSchema);
export default RescueTeam;
