const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const githubRoutes = require("./routes/githubRoutes");
const repoRoutes = require("./routes/repoRoutes");
const authRoutes = require("./routes/authRoutes");
const axios = require("axios");
const teamRoutes = require("./routes/teamRoutes");

dotenv.config();
connectDB();
require("dotenv").config();
const app = express();


app.get("/api/test-github", async (req, res) => {
  try {
    const r = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
    });
    res.json({ ok: true, login: r.data.login });
  } catch (e) {
    res.status(500).json({ ok: false, err: e.response?.data || e.message });
  }
});

// ✅ FIXED CORS - Allow Vite frontend
// ✅ CORS - allow your React frontend (Vite) on 5173
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "https://sprint-iq-frontend-two.vercel.app",
    "https://sprint-iq-frontend-n7q1pw2oj-vidharshanas-projects.vercel.app"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/repos", repoRoutes);

app.use("/api/teams", teamRoutes);
const { startAlertCron } = require("./cron/alertCron");
startAlertCron(); // ✅ start hourly job
app.use("/api/alerts", require("./routes/alertRoutes"));
const dashboardRoutes = require("./routes/dashboardRoutes");
app.use("/api/dashboard", dashboardRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
