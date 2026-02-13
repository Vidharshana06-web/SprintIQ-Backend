

const express = require("express");
const { addRepository, getMyRepositories, getRepositoryById,  refreshRepository, deleteRepository, getRecentCommits, refreshAllRepositories,} = require("../controllers/repoController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();

router.post("/add", authMiddleware, addRepository);
router.get("/", authMiddleware, getMyRepositories);
router.get("/recent-commits", authMiddleware, getRecentCommits);
router.get("/:id", authMiddleware, getRepositoryById);
router.put("/:id/refresh", authMiddleware, refreshRepository);
router.delete("/:id", authMiddleware, deleteRepository);

router.put("/:id/refresh", authMiddleware, refreshRepository);
router.put("/refresh-all", authMiddleware, refreshAllRepositories);
module.exports = router;