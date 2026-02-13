const axios = require("axios");

function sinceISO(days = 7) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ✅ Repo-specific commit count + dynamic daily trend
async function fetchRepoCommits7d(
  repoFullName,
  username,
  githubToken = "",
  days = 7
) {
  if (!repoFullName || !username) {
    return {
      commits7d: 0,
      lastActivityAt: null,
      dailyCommits7d: [],
    };
  }

  const url = `https://api.github.com/repos/${repoFullName}/commits`;
  const since = sinceISO(days);

  let page = 1;
  let total = 0;
  let lastActivityAt = null;
  let allCommits = [];

  try {
    while (page <= 10) {
      // const r = await axios.get(url, {
      //   params: {
      //     author: username,
      //     since,
      //     per_page: 100,
      //     page,
      //   },
      //   headers: {
      //     Accept: "application/vnd.github+json",
      //     ...(githubToken
      //       ? { Authorization: `Bearer ${githubToken}` }
      //       : {}),
      //   },
      // });
      const r = await axios.get(url, {
  timeout: 15000, // ✅ add this
  params: { author: username, since, per_page: 100, page },
  headers: {
    Accept: "application/vnd.github+json",
    ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
  },
});

      const commits = r.data || [];
      total += commits.length;
      allCommits.push(...commits);

      if (page === 1 && commits.length > 0) {
        const dt =
          commits[0]?.commit?.author?.date ||
          commits[0]?.commit?.committer?.date ||
          null;
        lastActivityAt = dt ? new Date(dt) : null;
      }

      if (commits.length < 100) break;
      page++;
    }
  } catch (err) {
    console.log("❌ GitHub fetch error:", err.response?.data || err.message);
  }

  // 🔥 Dynamic Daily Trend Logic (Aligned with days param)

  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const dailyMap = {};

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().split("T")[0];
    dailyMap[key] = 0;
  }

  allCommits.forEach((commit) => {
    const commitDate =
      commit?.commit?.author?.date?.split("T")[0] ||
      commit?.commit?.committer?.date?.split("T")[0];

    if (commitDate && dailyMap.hasOwnProperty(commitDate)) {
      dailyMap[commitDate]++;
    }
  });

  const dailyCommits7d = Object.keys(dailyMap)
    .sort()
    .map((date) => ({
      date,
      commits: dailyMap[date],
    }));

  return { commits7d: total, lastActivityAt, dailyCommits7d };
}

// ✅ Team health + smart suggestions
function buildTeamAnalytics(members) {
  const totalCommits7d = members.reduce(
    (sum, m) => sum + (m.commits7d || 0),
    0
  );

  const activeMembersCount = members.filter(
    (m) => (m.commits7d || 0) > 0
  ).length;

  const inactiveMembersCount = members.length - activeMembersCount;

  const inactiveRatio =
    members.length === 0
      ? 1
      : inactiveMembersCount / members.length;

  let healthStatus = "GOOD";
  if (inactiveRatio >= 0.5) healthStatus = "RISK";
  else if (inactiveRatio >= 0.3) healthStatus = "WARN";

  let busFactorRisk = "LOW";

  if (totalCommits7d > 0) {
    const sorted = [...members].sort(
      (a, b) => (b.commits7d || 0) - (a.commits7d || 0)
    );

    const top1 = (sorted[0]?.commits7d || 0) / totalCommits7d;
    const top2 =
      ((sorted[0]?.commits7d || 0) +
        (sorted[1]?.commits7d || 0)) /
      totalCommits7d;

    if (top1 > 0.6 || top2 > 0.8) busFactorRisk = "HIGH";
    else if (top1 > 0.45 || top2 > 0.7) busFactorRisk = "MED";
  }

  const suggestions = [];

  if (inactiveMembersCount > 0) {
    suggestions.push(
      `${inactiveMembersCount} member(s) inactive in last 7 days → assign small tasks + quick check-in.`
    );
  }

  if (busFactorRisk === "HIGH") {
    suggestions.push(
      `Workload concentrated (HIGH bus factor) → distribute tasks or introduce pair programming.`
    );
  } else if (busFactorRisk === "MED") {
    suggestions.push(
      `Workload slightly concentrated → distribute work more evenly.`
    );
  }

  const lowVelocityThreshold = members.length * 2;

  if (totalCommits7d < lowVelocityThreshold) {
    suggestions.push(
      `Overall velocity is low (${totalCommits7d} commits/7d) → define weekly commit goals.`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      `Team health is stable ✅ Maintain current development rhythm.`
    );
  }

  return {
    totalCommits7d,
    activeMembersCount,
    inactiveMembersCount,
    healthStatus,
    busFactorRisk,
    suggestions,
    updatedAt: new Date(),
  };
}

module.exports = {
  fetchRepoCommits7d,
  buildTeamAnalytics,
};
