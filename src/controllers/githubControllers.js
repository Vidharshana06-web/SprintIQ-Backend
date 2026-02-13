import axios from "axios";

const githubClient = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  },
});

// ✅ GET COMMITS
export const getRepoCommits = async (req, res) => {
  const { owner, repo } = req.params;

  try {
    const response = await githubClient.get(
      `/repos/${owner}/${repo}/commits?per_page=30`
    );

    return res.status(200).json({
      success: true,
      count: response.data.length,
      commits: response.data,
    });
  } catch (error) {
    const status = error.response?.status || 500;
    return res.status(status).json({
      success: false,
      message:
        error.response?.data?.message || "Failed to fetch commits from GitHub",
    });
  }
};

// ✅ ANALYZE ACTIVITY
export const analyzeRepoActivity = async (req, res) => {
  const { owner, repo } = req.params;

  try {
    // Only need 1 latest commit
    const response = await githubClient.get(
      `/repos/${owner}/${repo}/commits?per_page=1`
    );

    const commits = response.data;

    if (!commits || commits.length === 0) {
      return res.status(200).json({
        success: true,
        status: "EMPTY",
        inactiveHours: null,
        lastCommitTime: null,
        message: "No commits found in this repository",
      });
    }

    const lastCommitTime = new Date(commits[0].commit.author.date);
    const diffHours = (Date.now() - lastCommitTime.getTime()) / (1000 * 60 * 60);

    let status = "ACTIVE";
    let message = "✅ Repository is active";

    if (diffHours > 6) {
      status = "RISK";
      message = `⚠️ No commits in the last ${Math.floor(diffHours)} hours`;
    }

    return res.status(200).json({
      success: true,
      status,
      lastCommitTime,
      inactiveHours: Math.floor(diffHours),
      message,
    });
  } catch (error) {
    const status = error.response?.status || 500;
    return res.status(status).json({
      success: false,
      message:
        error.response?.data?.message || "Failed to analyze repository activity",
    });
  }
};


export const verifyRepo = async (req, res) => {
  const { repoFullName } = req.query;

  if (!repoFullName || !repoFullName.includes("/")) {
    return res.status(400).json({
      success: false,
      message: "repoFullName must be like owner/repo",
    });
  }

  const [owner, repo] = repoFullName.split("/");

  try {
    const response = await githubClient.get(`/repos/${owner}/${repo}`);

    return res.status(200).json({
      success: true,
      private: response.data.private,
      full_name: response.data.full_name,
      default_branch: response.data.default_branch,
    });
  } catch (error) {
    const status = error.response?.status || 500;
    return res.status(status).json({
      success: false,
      message: error.response?.data?.message || "Failed to verify repo",
    });
  }
};
