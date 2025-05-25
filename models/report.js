const mongoose = require('mongoose');
const ReportSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  fileName: String,
  result: String,
  uploadedAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model('Report', ReportSchema);

