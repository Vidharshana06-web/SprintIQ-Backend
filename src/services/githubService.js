const axios = require("axios");

const github = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  },
});

// ✅ Repo last commit time (overall repo)
async function getLastCommitTime(repoFullName) {
  const url = `/repos/${repoFullName}/commits`;
  const res = await github.get(url, { params: { per_page: 1 } });
  const commits = res.data || [];
  if (!commits.length) return null;
  return new Date(commits[0].commit.author.date);
}

// ✅ Member commits in last 7 days (repo-specific)
async function getMemberCommitsThisWeek(repoFullName, username) {
  if (!repoFullName || !username) return 0;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const url = `/repos/${repoFullName}/commits`;

  let page = 1;
  let total = 0;

  while (page <= 10) {
    const r = await github.get(url, {
      params: {
        author: username,
        since,
        per_page: 100,
        page,
      },
    });

    const commits = r.data || [];
    total += commits.length;

    if (commits.length < 100) break;
    page++;
  }

  return total;
}

// ✅ Member last commit time (repo-specific)
async function getMemberLastCommitTime(repoFullName, username) {
  if (!repoFullName || !username) return null;

  const url = `/repos/${repoFullName}/commits`;
  const r = await github.get(url, {
    params: {
      author: username,
      per_page: 1,
    },
  });

  const commits = r.data || [];
  if (!commits.length) return null;

  return new Date(commits[0].commit.author.date);
}

// ✅ Verify repo exists (useful at Create Team time)
async function verifyRepoExists(repoFullName) {
  if (!repoFullName) return false;
  try {
    await github.get(`/repos/${repoFullName}`);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getLastCommitTime,
  getMemberCommitsThisWeek,
  getMemberLastCommitTime,
  verifyRepoExists,
};
