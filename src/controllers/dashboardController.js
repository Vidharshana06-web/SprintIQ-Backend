const Repository = require("../models/Repository");
const Team = require("../models/Team");
const axios = require("axios");

// helper: GitHub API client (token optional)
const gh = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
      : {}),
  },
});

// count commits in last 7 days for a repo (safe pagination limit)
async function countCommitsLast7Days(owner, repo) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const url = `/repos/${owner}/${repo}/commits`;

  let page = 1;
  let total = 0;

  while (page <= 5) {
    const r = await gh.get(url, {
      params: { since, per_page: 100, page },
    });

    const commits = r.data || [];
    total += commits.length;

    if (commits.length < 100) break;
    page++;
  }

  return total;
}

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1) Active repos count
    const activeRepos = await Repository.countDocuments({ user: userId });

    // 2) Team members count (sum of members across teams)
    const teams = await Team.find({ userId }).select("members").lean();
    const teamMembers = teams.reduce((sum, t) => sum + (t.members?.length || 0), 0);

    // 3) Tasks (not implemented yet)
    const activeTasks = 0;

    // 4) Commits in last 7 days (sum across connected repos)
    const myRepos = await Repository.find({ user: userId }).select("owner repo").lean();

    let commits7Days = 0;
    for (const r of myRepos) {
      commits7Days += await countCommitsLast7Days(r.owner, r.repo);
    }

    return res.json({
      success: true,
      stats: {
        activeRepos,
        teamMembers,
        activeTasks,
        commits7Days,
      },
    });
  } catch (e) {
    console.log("❌ getDashboardStats error:", e.message);
    return res.status(500).json({ success: false, message: "Failed to load dashboard stats" });
  }
};




const github = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
      : {}),
  },
});

exports.getTopContributors = async (req, res) => {
  try {
    const userId = req.user.id;
    const { teamId } = req.query;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const counts = {}; // { name: commits }

    // ✅ CASE 1: Team-wise contributors
    if (teamId) {
      const team = await Team.findOne({ _id: teamId, userId }).lean();

      if (!team) {
        return res.status(404).json({ success: false, message: "Team not found" });
      }

      if (!team.repoFullName || !team.repoFullName.includes("/")) {
        return res.json({ success: true, contributors: [] });
      }

      const [owner, repo] = team.repoFullName.split("/");

      const resp = await github.get(`/repos/${owner}/${repo}/commits`, {
        params: { since, per_page: 100 },
      });

      (resp.data || []).forEach((c) => {
        const author = c.author?.login || c.commit?.author?.name || "Unknown";
        counts[author] = (counts[author] || 0) + 1;
      });

      const contributors = Object.entries(counts)
        .map(([name, commits]) => ({ name, commits }))
        .sort((a, b) => b.commits - a.commits)
        .slice(0, 6);

      return res.json({ success: true, contributors });
    }

    // ✅ CASE 2: Global contributors (all connected repos)
    const repos = await Repository.find({ user: userId }).select("owner repo").lean();

    if (!repos.length) {
      return res.json({ success: true, contributors: [] });
    }

    await Promise.all(
      repos.map(async (r) => {
        try {
          const resp = await github.get(`/repos/${r.owner}/${r.repo}/commits`, {
            params: { since, per_page: 100 },
          });

          (resp.data || []).forEach((c) => {
            const author = c.author?.login || c.commit?.author?.name || "Unknown";
            counts[author] = (counts[author] || 0) + 1;
          });
        } catch (err) {
          console.log("❌ Top contributors failed:", r.owner, r.repo, err.response?.status);
        }
      })
    );

    const contributors = Object.entries(counts)
      .map(([name, commits]) => ({ name, commits }))
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 6);

    return res.json({ success: true, contributors });
  } catch (e) {
    console.log("❌ getTopContributors error:", e.message);
    return res.status(500).json({ success: false, message: "Failed to load contributors" });
  }
};