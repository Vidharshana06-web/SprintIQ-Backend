const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");
const protect = require("../middlewares/authMiddleware"); // ✅ same middleware you use for repos

router.get("/", protect, teamController.getTeams);
router.post("/", protect, teamController.createTeam);
router.get("/:teamId", protect, teamController.getTeamById);

router.post("/:teamId/members", protect, teamController.addMember);
router.put("/:teamId/members/:memberId", protect, teamController.updateMember);
router.delete("/:teamId/members/:memberId", protect, teamController.deleteMember);
// ✅ Team Health Analytics (fast read + refresh)
router.get("/:teamId/analytics", protect, teamController.getTeamAnalytics);
router.post("/:teamId/refresh-analytics", protect, teamController.refreshTeamAnalytics);
router.put("/:teamId/members/:memberId/tasks/:taskId", protect, teamController.updateTaskStatus);

router.delete("/:teamId", protect, teamController.deleteTeam);

module.exports = router;




// const express = require("express");
// const router = express.Router();
// const axios = require("axios");

// /**
//  * GET /api/github/repo-commits
//  * query: repoFullName=owner/repo&username=githubUser
//  * returns commitsThisWeek count for THAT REPO only
//  */
// router.get("/repo-commits", async (req, res) => {
//   try {
//     const { repoFullName, username } = req.query;

//     if (!repoFullName || !username) {
//       return res.status(400).json({
//         success: false,
//         message: "repoFullName and username are required",
//       });
//     }

//     const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

//     // GitHub commits API (repo-specific)
//     const url = `https://api.github.com/repos/${repoFullName}/commits`;

//     // Pagination: count all pages (up to a safe limit)
//     let page = 1;
//     let total = 0;

//     while (page <= 10) {
//       const r = await axios.get(url, {
//         params: {
//           author: username,
//           since,
//           per_page: 100,
//           page,
//         },
//         headers: {
//           Accept: "application/vnd.github+json",
//           // Optional: put token for higher rate limit
//           ...(process.env.GITHUB_TOKEN
//             ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
//             : {}),
//         },
//       });

//       const commits = r.data || [];
//       total += commits.length;

//       if (commits.length < 100) break; // no more pages
//       page++;
//     }

//     return res.json({ success: true, commitsThisWeek: total });
//   } catch (err) {
//     return res.status(500).json({
//       success: false,
//       message: "Repo commit fetch failed",
//       error: err.message,
//     });
//   }
// });

// module.exports = router;