const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },

    repoFullName: {
      type: String,
      required: true, // owner/repo
      index: true,
    },

    // ✅ member info (not required so old alerts won't break)
    githubUsername: { type: String, default: "", index: true },
    memberEmail: { type: String, default: "" },


   

type: {
  type: String,
  default: "INACTIVITY",
  index: true,
  set: (v) => String(v || "INACTIVITY").trim().toUpperCase(),
},

  severity: {
  type: String,
  enum: ["CRITICAL", "WARNING", "INFO"],
  default: "INFO",
  index: true,
  set: (v) => String(v || "INFO").trim().toUpperCase(),
},


    message: { type: String, required: true },
    inactiveHours: { type: Number, default: 0 },
    lastCommitTime: { type: Date, default: null },

    isActive: { type: Boolean, default: true, index: true },
    resolvedAt: { type: Date, default: null },


     notifiedCount: { type: Number, default: 0 },
    lastNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Alert", alertSchema);
