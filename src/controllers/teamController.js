



const Team = require("../models/Team");
const mongoose = require("mongoose");

const Repository = require("../models/Repository");
const Alert = require("../models/Alerts"); // put this at top of 
const { fetchRepoCommits7d, buildTeamAnalytics } = require("../services/githubAnalytics");

// helper: get user id safely from middleware
const getUserId = (req) => req.user?.id || req.user?._id;

// helper: enforce only one leader in a team
function enforceSingleLeader(members, leaderMemberId) {
  return members.map((m) => {
    const obj = m.toObject ? m.toObject() : m;
    if (String(obj._id) !== String(leaderMemberId) && obj.role === "Leader") {
      return { ...obj, role: "Member" };
    }
    return obj;
  });
}

// ✅ GET /api/teams
exports.getTeams = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const teams = await Team.find({ userId }).sort({ createdAt: -1 });
    return res.json({ success: true, teams });
  } catch (error) {
    console.log("❌ getTeams error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch teams" });
  }
};

// ✅ POST /api/teams
// exports.createTeam = async (req, res) => {
//   try {
//     const { name, description, repoFullName} = req.body;

//     if (!name?.trim()) {
//       return res.status(400).json({ success: false, message: "Team name is required" });
//     }

//     const userId = getUserId(req);
//     if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

//     const team = await Team.create({
//       userId, // ✅ FIXED
//       name: name.trim(),
//       description: (description || "").trim(),
//       members: [],
//     });

//     return res.status(201).json({ success: true, team });
//   } catch (error) {
//     console.log("❌ createTeam error:", error);
//     return res.status(500).json({ success: false, message: "Failed to create team" });
//   }
// };


exports.createTeam = async (req, res) => {
  try {
    const { name, description, repoFullName } = req.body;

    if (!repoFullName || !repoFullName.includes("/")) {
      return res.status(400).json({
        success: false,
        message: "Repo must be like owner/repo",
      });
    }

    const [repoOwner, repoName] = repoFullName.trim().split("/");

    const newTeam = await Team.create({
      name,
      description,
      repoFullName: repoFullName.trim(),
      userId: req.user.id,
    });

    // ✅ Save into connected repos automatically
    const exists = await Repository.findOne({
      user: req.user.id,
      owner: repoOwner,
      repo: repoName,
    });

    if (!exists) {
      await Repository.create({
        user: req.user.id,
        owner: repoOwner,
        repo: repoName,
        status: "ACTIVE",
        lastCommitTime: null,
        inactiveHours: 0,
        lastChecked: new Date(),
      });
    }

    return res.json({ success: true, team: newTeam });
  } catch (err) {
    console.log("❌ createTeam error:", err);
    return res.status(500).json({ success: false, message: "Failed to create team" });
  }
};


// ✅ GET /api/teams/:teamId
exports.getTeamById = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { teamId } = req.params;
    console.log("✅ refreshTeamAnalytics started:", teamId);


    // ✅ avoid CastError
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ success: false, message: "Invalid team id" });
    }

    const team = await Team.findOne({ _id: teamId, userId }); // ✅ FIXED

    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    return res.json({ success: true, team });
  } catch (error) {
    console.log("❌ getTeamById error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch team" });
  }
};

// ✅ POST /api/teams/:teamId/members
exports.addMember = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { email, role, tasks, githubUsername } = req.body;

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    if (!githubUsername || !githubUsername.trim()) {
      return res.status(400).json({
        success: false,
        message: "GitHub Username is required",
      });
    }

    team.members.push({
      email,
      role,
      tasks,
      githubUsername: githubUsername.trim(), // ✅ REQUIRED
      commitsThisWeek: 0,
    });

    await team.save();

    return res.json({ success: true, team });

  } catch (err) {
    console.log("❌ addMember error:", err);
    return res.status(500).json({
      success: false,
      message: "Add member failed",
    });
  }
};

// ✅ PUT /api/teams/:teamId/members/:memberId
exports.updateMember = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { teamId, memberId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ success: false, message: "Invalid team id" });
    }

    const team = await Team.findOne({ _id: teamId, userId }); // ✅ FIXED
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    const member = team.members.id(memberId);
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    const { email, role, tasks, commitsThisWeek } = req.body;

    if (email?.trim()) member.email = email.trim().toLowerCase();
    member.role = role === "Leader" ? "Leader" : "Member";
    member.tasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
    member.commitsThisWeek = Number(commitsThisWeek || 0);

    if (member.role === "Leader") {
      team.members = enforceSingleLeader(team.members, member._id);
    }

    await team.save();
    return res.json({ success: true, team });
  } catch (e) {
    console.log("❌ updateMember error:", e);
    return res.status(500).json({ success: false, message: "Failed to update member" });
  }
};



// ✅ PUT /api/teams/:teamId/members/:memberId/tasks/:taskId
exports.updateTaskStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { teamId, memberId, taskId } = req.params;
    const { status } = req.body;

    if (!["PENDING", "IN_PROGRESS", "DONE"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const team = await Team.findOne({ _id: teamId, userId });
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    const member = team.members.id(memberId);
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    const task = member.tasks.id(taskId);
    if (!task) return res.status(404).json({ success: false, message: "Task not found" });

    task.status = status;
    await team.save();

    return res.json({ success: true, team });
  } catch (err) {
    console.log("❌ updateTaskStatus error:", err);
    return res.status(500).json({ success: false, message: "Failed to update task status" });
  }
};

// ✅ DELETE /api/teams/:teamId/members/:memberId
exports.deleteMember = async (req, res) => {
  try {
    const { teamId, memberId } = req.params;

    // 1) Get team and find the member BEFORE deleting (to capture username/email)
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const member = team.members.id(memberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    const githubUsername = (member.githubUsername || "").trim();
    const memberEmail = (member.email || "").trim();

    // 2) Delete member
    member.deleteOne(); // or team.members.pull(memberId)
    await team.save();

    // 3) ✅ Resolve alerts for that member
    // Prefer githubUsername (unique). If missing, fallback to email.
    const alertQuery = { teamId: teamId, isActive: true };

    if (githubUsername) alertQuery.githubUsername = githubUsername;
    else if (memberEmail) alertQuery.memberEmail = memberEmail;

    await Alert.updateMany(alertQuery, {
      isActive: false,
      resolvedAt: new Date(),
    });

    return res.json({ success: true, team });

  } catch (err) {
    console.log("❌ deleteMember error:", err);
    return res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
};

// ✅ DELETE /api/teams/:teamId
// ✅ DELETE /api/teams/:teamId
exports.deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;

    // 1) Find team first (we need repoFullName)
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ success: false, message: "Team not found" });
    }

    // OPTIONAL safety: only owner can delete
    // if (String(team.userId) !== String(req.user.id)) {
    //   return res.status(403).json({ success: false, message: "Forbidden" });
    // }

    // 2) ✅ Resolve alerts for that team (hide from UI)
    await Alert.updateMany(
      { teamId: teamId, isActive: true },
      { isActive: false, resolvedAt: new Date() }
    );

    // 3) ✅ Delete connected repo record linked to this team repo
    // Your Repository schema uses: user(required), owner, repo
    // So delete by (user + owner/repo)
    if (team.repoFullName && team.repoFullName.includes("/")) {
      const [owner, repo] = team.repoFullName.split("/");

      await Repository.deleteMany({
        user: req.user.id,
        owner,
        repo,
      });
    }

    // 4) ✅ Delete the team
    await Team.deleteOne({ _id: teamId });

    return res.json({ success: true, message: "Team deleted + cleanup done" });
  } catch (err) {
    console.log("❌ deleteTeam error:", err);
    return res.status(500).json({ success: false, message: "Delete failed" });
  }
};


// ✅ GET /api/teams/:teamId/analytics (fast read from DB)
exports.getTeamAnalytics = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { teamId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ success: false, message: "Invalid team id" });
    }

    const team = await Team.findOne({ _id: teamId, userId });
    console.log("✅ repoFullName =", team.repoFullName);
console.log("✅ members count =", team.members.length);

    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    return res.json({
      success: true,
      analytics: team.analytics || null,
      members: team.members,
      repoFullName: team.repoFullName,
    });
  } catch (err) {
    console.log("❌ getTeamAnalytics error:", err);
    return res.status(500).json({ success: false, message: "Failed to get analytics" });
  }
};

// ✅ POST /api/teams/:teamId/refresh-analytics (fetch GitHub → save → return)
exports.refreshTeamAnalytics = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { teamId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ success: false, message: "Invalid team id" });
    }

    const team = await Team.findOne({ _id: teamId, userId });
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    const githubToken = process.env.GITHUB_TOKEN || "";
    const now = new Date();

    // ✅ IMPORTANT: must have repoFullName like owner/repo
    if (!team.repoFullName || !team.repoFullName.includes("/")) {
      return res.status(400).json({
        success: false,
        message: "Team repoFullName missing or invalid (must be owner/repo)",
      });
    }
// 🔥 Prepare team-wide daily trend map (initialize last 7 days)
const days = Math.max(1, Math.min(90, Number(req.query.days || 7)));

const teamDailyMap = {};
const today = new Date();

for (let i = days - 1; i >= 0; i--) {
  const d = new Date();
  d.setDate(today.getDate() - i);
  const iso = d.toISOString().split("T")[0];
  teamDailyMap[iso] = 0; // initialize with 0
}



    // ✅ Update each member commits using repo-specific API
    for (let i = 0; i < team.members.length; i++) {
      const m = team.members[i];
console.log("➡️ Fetching commits for:", m.githubUsername);

      if (!m.githubUsername) continue;

      // ✅ caching: skip if synced in last 15 minutes
      const lastSynced = m.lastSyncedAt ? new Date(m.lastSyncedAt) : null;
      const minsSinceSync = lastSynced ? (now - lastSynced) / (1000 * 60) : 999;
      //if (minsSinceSync < 15) continue;

    

const { commits7d, lastActivityAt, dailyCommits7d } = await fetchRepoCommits7d(
  team.repoFullName,
  m.githubUsername,
  githubToken,
  days
);
console.log("✅ GitHub result for", m.githubUsername, commits7d);

      // ✅ keep both fields updated
      m.commits7d = commits7d;
      m.commitsThisWeek = commits7d;

      m.lastActivityAt = lastActivityAt;
      m.lastSyncedAt = now;


      // 🔥 Merge member daily trend into team trend
if (dailyCommits7d && dailyCommits7d.length) {
  dailyCommits7d.forEach(d => {
    if (!teamDailyMap[d.date]) {
      teamDailyMap[d.date] = 0;
    }
    teamDailyMap[d.date] += d.commits;
  });
}

    }

    // 🔥 Convert teamDailyMap to sorted array
const teamDailyCommits7d = Object.keys(teamDailyMap)
  .sort()
  .map(date => ({
    date,
    commits: teamDailyMap[date]
  }));

// ✅ Build analytics
const baseAnalytics = buildTeamAnalytics(team.members);

// ✅ Attach daily trend
team.analytics = {
  ...baseAnalytics,
  dailyCommits7d: teamDailyCommits7d
};

    // ✅ Build team analytics + suggestions
 console.log("✅ saving team analytics...");

    await team.save();
    console.log("✅ saved, sending response...");


    return res.json({
      success: true,
      analytics: team.analytics,
      members: team.members,
      repoFullName: team.repoFullName,
    });
  } catch (err) {
    console.log("❌ refreshTeamAnalytics error:", err);
    return res.status(500).json({ success: false, message: "Failed to refresh analytics" });
  }
};

