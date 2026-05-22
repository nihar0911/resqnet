import mongoose from 'mongoose';

const userReportSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // e.g. socket ID or generic ID for now
  userName: { type: String, default: 'Civilian' },
  disasterType: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  address: { type: String, default: 'Location pending...' },
  state: { type: String, default: '' },
  media: { type: String, default: '' }, // base64 or URL
  severity: { type: String, enum: ['low', 'medium', 'critical'], default: 'medium' },
  status: { type: String, enum: ['pending', 'assigned', 'resolved'], default: 'pending' },
  assignedTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'RescueTeam', default: null },
  timestamp: { type: Date, default: Date.now }
});

const UserReport = mongoose.model('UserReport', userReportSchema);
export default UserReport;
