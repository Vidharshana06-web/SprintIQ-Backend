const mongoose = require("mongoose");

const repositorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  owner: String,
  repo: String,
  lastChecked: Date,
  lastCommitTime: Date,
  inactiveHours: Number,
  status: String
}, { timestamps: true });

module.exports = mongoose.model("Repository", repositorySchema);
