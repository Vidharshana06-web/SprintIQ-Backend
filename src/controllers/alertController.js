


const Alert = require("../models/Alerts");
const mongoose = require("mongoose");
const { sendActionEmail } = require("../services/mailer");
const getUserId = (req) => req.user?.id || req.user?._id;

exports.getAlerts = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { teamId, type } = req.query;

    const q = {
      owner: new mongoose.Types.ObjectId(userId),   // ✅ FIXED
      isActive: true,
    };

    if (teamId && mongoose.Types.ObjectId.isValid(teamId)) {
      q.teamId = new mongoose.Types.ObjectId(teamId);
    }

    if (type && String(type).trim()) {
      q.type = String(type).trim().toUpperCase();
    }

    const alerts = await Alert.find(q).sort({ updatedAt: -1, createdAt: -1 }); // ✅ FIXED

    const counts = {
      active: alerts.length,
      critical: alerts.filter(a => (a.severity || "").toUpperCase() === "CRITICAL").length,
      warning: alerts.filter(a => (a.severity || "").toUpperCase() === "WARNING").length,
    };

    const byType = alerts.reduce((acc, a) => {
      const t = (a.type || "OTHER").toUpperCase();
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      success: true,
      counts,
      byType,
      alerts,
    });
  } catch (err) {
    console.log("❌ getAlerts error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch alerts" });
  }
};


exports.notifyAlertMember = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const alert = await Alert.findOne({
      _id: id,
      owner: userId,
      isActive: true,
    });

    if (!alert) {
      return res.status(404).json({ success: false, message: "Alert not found" });
    }

    if (!alert.memberEmail) {
      return res.status(400).json({ success: false, message: "No email found for this member" });
    }

    const emailHtml = `
      <div style="font-family: Arial;">
        <h2>⚠️ SprintIQ Alert</h2>
        <p>Hello <b>${alert.githubUsername}</b>,</p>
        <p>${alert.message}</p>
        <p><b>Please complete your pending work as soon as possible.</b></p>
        <br/>
        <p>— Team Lead</p>
      </div>
    `;

    await sendActionEmail({
      to: alert.memberEmail,
      subject: "SprintIQ – Action Required",
      html: emailHtml,
    });

    await Alert.updateOne(
      { _id: alert._id },
      {
        $inc: { notifiedCount: 1 },
        $set: { lastNotifiedAt: new Date() },
      }
    );

    return res.json({ success: true, message: "Email sent successfully" });
  } catch (err) {
    console.log("❌ notifyAlertMember error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to send email" });
  }
};