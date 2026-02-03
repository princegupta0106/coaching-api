const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// Get question status for current user
router.get("/status", verifyToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("question_status")
      .eq("email", req.user.email)
      .single();

    if (error) throw error;

    res.json({ question_status: user.question_status || {} });
  } catch (error) {
    console.error("Get status error:", error);
    res.status(500).json({ error: "Failed to fetch question status" });
  }
});

// Update question status
router.post("/update-status", verifyToken, async (req, res) => {
  try {
    const { questionId, status } = req.body;

    if (!questionId || !status) {
      return res
        .status(400)
        .json({ error: "Question ID and status are required" });
    }

    // Validate status
    const validStatuses = ["unseen", "seen", "correct", "wrong"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    // Get current question_status
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("question_status")
      .eq("email", req.user.email)
      .single();

    if (fetchError) throw fetchError;

    // Update the status
    const currentStatus = user.question_status || {};
    currentStatus[questionId] = status;

    const { error: updateError } = await supabase
      .from("users")
      .update({ question_status: currentStatus })
      .eq("email", req.user.email);

    if (updateError) throw updateError;

    res.json({ success: true, questionId, status });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ error: "Failed to update question status" });
  }
});

module.exports = router;
