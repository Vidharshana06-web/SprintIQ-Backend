


const Repository = require("../models/Repository");
const axios = require("axios");

async function fetchLatestCommit(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;

  // 1) try WITH token (higher rate limit)
  try {
    const r = await axios.get(url, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`, // ✅ classic PAT style
        Accept: "application/vnd.github+json",
      },
    });
    return r.data;
  } catch (e) {
    // 2) if token fails, retry WITHOUT token (works for public repos)
    if (e.response?.status === 401) {
      const r2 = await axios.get(url, {
        headers: { Accept: "application/vnd.github+json" },
      });
      return r2.data;
    }
    throw e;
  }
}

async function analyzeAndReturnRepoData(owner, repo) {
  const commits = await fetchLatestCommit(owner, repo);

  if (!commits || commits.length === 0) {
    return {
      status: "EMPTY",
      lastCommitTime: null,
      inactiveHours: null,
      lastChecked: new Date(),
    };
  }

  const lastCommitTime = new Date(commits[0].commit.author.date);
  const diffHours = (Date.now() - lastCommitTime.getTime()) / (1000 * 60 * 60);

  return {
    status: diffHours > 6 ? "RISK" : "ACTIVE",
    lastCommitTime,
    inactiveHours: Math.floor(diffHours),
    lastChecked: new Date(),
  };
}

exports.addRepository = async (req, res) => {
  try {
    const { owner, repo } = req.body;

    if (!owner || !repo) {
      return res.status(400).json({ success: false, message: "owner and repo are required" });
    }

    const exists = await Repository.findOne({ user: req.user.id, owner, repo });
    if (exists) {
      return res.status(400).json({ success: false, message: "Repository already added" });
    }

    const analysis = await analyzeAndReturnRepoData(owner, repo);

    const newRepo = await Repository.create({
      user: req.user.id,
      owner,
      repo,
      lastChecked: analysis.lastChecked,
      lastCommitTime: analysis.lastCommitTime,
      inactiveHours: analysis.inactiveHours,
      status: analysis.status,
    });

    return res.status(201).json({ success: true, message: "Repository added successfully", repository: newRepo });
  } catch (error) {
    console.error("addRepository error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || "Failed to add repository",
    });
  }
};




// GET /api/repos
exports.getMyRepositories = async (req, res) => {
  try {
    const repos = await Repository.find({ user: req.user.id }).sort({ createdAt: -1 });
    return res.json({ success: true, repos });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Failed to fetch repositories" });
  }
};

// GET /api/repos/:id
exports.getRepositoryById = async (req, res) => {
  try {
    const repo = await Repository.findOne({ _id: req.params.id, user: req.user.id });
    if (!repo) return res.status(404).json({ success: false, message: "Repo not found" });
    return res.json({ success: true, repo });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Failed to fetch repository" });
  }
};

exports.refreshRepository = async (req, res) => {
  try {
    const { id } = req.params;

    // 1) find repo (and make sure it belongs to logged-in user)
    const repoDoc = await Repository.findOne({ _id: id, user: req.user.id });

    if (!repoDoc) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    // 2) analyze again from GitHub
    const analysis = await analyzeAndReturnRepoData(repoDoc.owner, repoDoc.repo);

    // 3) update DB
    repoDoc.lastChecked = analysis.lastChecked;
    repoDoc.lastCommitTime = analysis.lastCommitTime;
    repoDoc.inactiveHours = analysis.inactiveHours;
    repoDoc.status = analysis.status;

    await repoDoc.save();

    return res.status(200).json({
      success: true,
      message: "Repository refreshed",
      repo: repoDoc,
    });
  } catch (error) {
    console.error("refreshRepository error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || "Failed to refresh repository",
    });
  }
};


exports.deleteRepository = async (req, res) => {
  try {
    const repo = await Repository.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!repo) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    // ✅ IMPORTANT FIX: resolve alerts first
    await Alert.updateMany(
      {
        repoFullName: `${repo.owner}/${repo.repo}`,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          resolvedAt: new Date(),
        },
      }
    );

    // ✅ delete repo
    await repo.deleteOne();

    res.json({
      success: true,
      message: "Repository and related alerts removed successfully",
    });
  } catch (err) {
    console.error("Delete repo failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// controllers/repoController.js

async function fetchCommits(owner, repo, perRepo = 3) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perRepo}`;

  // try WITH token
  try {
    const r = await axios.get(url, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`, // classic PAT
        Accept: "application/vnd.github+json",
      },
    });
    return r.data;
  } catch (e) {
    // fallback WITHOUT token for public repos
    if (e.response?.status === 401) {
      const r2 = await axios.get(url, {
        headers: { Accept: "application/vnd.github+json" },
      });
      return r2.data;
    }
    throw e;
  }
}

exports.getRecentCommits = async (req, res) => {
  try {
    const myRepos = await Repository.find({ user: req.user.id }).select("owner repo");

    if (!myRepos.length) {
      return res.json({ success: true, commits: [] });
    }

    // Fetch commits from each repo (limit to avoid rate-limit)
    const perRepo = 3;
    const all = await Promise.all(
      myRepos.map(async (r) => {
        const commits = await fetchCommits(r.owner, r.repo, perRepo);
        return (commits || []).map((c) => ({
          owner: r.owner,
          repo: r.repo,
          message: c.commit?.message || "No message",
          author:
            c.commit?.author?.name ||
            c.author?.login ||
            "Unknown",
          date: c.commit?.author?.date || null,
          url: c.html_url || null,
        }));
      })
    );

    const flat = all.flat().filter((x) => x.date);

    // sort latest first, limit total
    flat.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json({
      success: true,
      commits: flat.slice(0, 15),
    });
  } catch (error) {
    console.error("getRecentCommits error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to load recent commits",
    });
  }
};


exports.refreshRepository = async (req, res) => {
  try {
    const repoDoc = await Repository.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!repoDoc) {
      return res.status(404).json({ success: false, message: "Repository not found" });
    }

    const analysis = await analyzeAndReturnRepoData(repoDoc.owner, repoDoc.repo);

    repoDoc.status = analysis.status;
    repoDoc.lastChecked = analysis.lastChecked;
    repoDoc.lastCommitTime = analysis.lastCommitTime;
    repoDoc.inactiveHours = analysis.inactiveHours;

    await repoDoc.save();

    return res.json({ success: true, repo: repoDoc });
  } catch (error) {
    console.error("refreshRepository error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Failed to refresh repository" });
  }
};

exports.refreshAllRepositories = async (req, res) => {
  try {
    const repos = await Repository.find({ user: req.user.id });

    const updated = await Promise.all(
      repos.map(async (r) => {
        const analysis = await analyzeAndReturnRepoData(r.owner, r.repo);

        r.status = analysis.status;
        r.lastChecked = analysis.lastChecked;
        r.lastCommitTime = analysis.lastCommitTime;
        r.inactiveHours = analysis.inactiveHours;

        await r.save();
        return r;
      })
    );

    return res.json({ success: true, repos: updated });
  } catch (error) {
    console.error("refreshAllRepositories error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Failed to refresh all repositories" });
  }
};