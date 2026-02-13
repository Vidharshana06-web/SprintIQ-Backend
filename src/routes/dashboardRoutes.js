// routes/dashboardRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");

const {
  getDashboardStats,
  getTopContributors,
} = require("../controllers/dashboardController");

router.get("/stats", auth, getDashboardStats);
router.get("/top-contributors", auth, getTopContributors);

module.exports = router;
