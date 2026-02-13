const mongoose = require("mongoose");

const MemberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, enum: ["Leader", "Member"], default: "Member" },
   tasks: {
  type: [
    {
      title: { type: String, required: true },
      dueDate: { type: Date, required: false },
      status: {
        type: String,
        enum: ["PENDING", "IN_PROGRESS", "DONE"],
        default: "PENDING",
      },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  default: [],
},
    githubUsername: { type: String, required: true},
    commitsThisWeek: { type: Number, default: 0 },
        // ✅ Auto analytics fields
    commits7d: { type: Number, default: 0 },         // if you want separate from commitsThisWeek
    lastActivityAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },

  },
  { _id: true }
);

const TeamSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // ✅ per logged-in user
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    repoFullName: { type: String, required:true}, // e.g., "openai/openai-cookbook"
    members: { type: [MemberSchema], default: [] },

        // ✅ Stored Team Health Analytics (fast read)
    analytics: {
  totalCommits7d: { type: Number, default: 0 },
  activeMembersCount: { type: Number, default: 0 },
  inactiveMembersCount: { type: Number, default: 0 },
  healthStatus: { type: String, default: "GOOD" },
  busFactorRisk: { type: String, default: "LOW" },
  suggestions: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },

  // ✅ ADD THIS DAILY TREND
  dailyCommits7d: {
    type: [
      {
        date: { type: String },
        commits: { type: Number, default: 0 },
      },
    ],
    default: [],
  },
},


  },
  { timestamps: true }
);

module.exports = mongoose.model("Team", TeamSchema);