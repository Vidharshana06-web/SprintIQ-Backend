const express = require("express");
const router = express.Router();
const { sendActionEmail } = require("../services/mailer");
const Alert = require("../models/Alerts");
const auth = require("../middlewares/authMiddleware");
/**
 * GET /api/alerts
 * Query:
 *  - active=true|false (default true)
 *  - teamId=<teamObjectId> (optional)
 *  - type=INACTIVITY|DEADLINE|WORKLOAD|QUALITY|DEPENDENCY (optional)
 */
router.get("/", auth, async (req, res) => {
  try {
    const onlyActive = String(req.query.active || "true") === "true";
    const teamId = req.query.teamId || null;
    const type = req.query.type || null;

    // ✅ Base filter (owner + optional team)
    const baseFilter = { owner: req.user.id };
    if (teamId) baseFilter.teamId = teamId;

    // ✅ list filter (optional active + optional type)
    const listFilter = { ...baseFilter };
    if (onlyActive) listFilter.isActive = true;
    if (type) listFilter.type = type;

    // 1) Alerts list for UI
    const alerts = await Alert.find(listFilter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // 2) Counts (always computed from ACTIVE alerts for this owner/team)
    const activeFilter = { ...baseFilter, isActive: true };

    const [active, critical, warning, byTypeAgg] = await Promise.all([
      Alert.countDocuments(activeFilter),
      // Alert.countDocuments({ ...activeFilter, severity: "critical" }),
      // Alert.countDocuments({ ...activeFilter, severity: "warning" }),
      Alert.countDocuments({ ...activeFilter, severity: "CRITICAL" }),
Alert.countDocuments({ ...activeFilter, severity: "WARNING" }),

      Alert.aggregate([
        { $match: activeFilter },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
    ]);

    const byType = {};
    (byTypeAgg || []).forEach((x) => {
      if (x._id) byType[x._id] = x.count;
    });

    const counts = { active, critical, warning };

    return res.json({ success: true, alerts, counts, byType });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch alerts",
      error: err.message,
    });
  }
});


router.post("/:id/notify", auth, async (req, res) => {
  try {
    const alertId = req.params.id;
    const { message } = req.body;

    const alert = await Alert.findOne({
      _id: alertId,
      owner: req.user.id,
      isActive: true,
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    if (!alert.memberEmail) {
      return res.status(400).json({
        success: false,
        message: "No email found for this team member",
      });
    }

    await sendActionEmail({
      to: alert.memberEmail,
      subject: "SprintIQ – Action Required",
      html: `
        <p>Hi,</p>
        <p>${message}</p>
        <p>
          <b>Repository:</b> ${alert.repoFullName}<br/>
          <b>User:</b> ${alert.githubUsername}<br/>
          <b>Inactive Hours:</b> ${alert.inactiveHours}
        </p>
        <p>— SprintIQ Team</p>
      `,
    });

    // ✅ update notification tracking
    alert.notifiedCount = (alert.notifiedCount || 0) + 1;
    alert.lastNotifiedAt = new Date();
    await alert.save();

    return res.json({ success: true });
  } catch (err) {
    console.log("❌ Email send failed:", err);
    return res.status(500).json({
      success: false,
      message: "Email failed",
      error: err.message,
    });
  }
});

module.exports = router;
