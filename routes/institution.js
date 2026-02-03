const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

router.get("/view", verifyToken, async (req, res) => {
  try {
    // Only admins can view institution details
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can view institution details" });
    }

    const institutionId = req.user.institution;
    console.log("Fetching institution:", institutionId);

    const { data: institution, error } = await supabase
      .from("institutions")
      .select("*")
      .eq("institution_id", institutionId)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return res
        .status(404)
        .json({ error: "Institution not found", details: error.message });
    }

    if (!institution) {
      return res.status(404).json({ error: "Institution not found" });
    }

    console.log("Institution found:", institution);
    res.json({ institution });
  } catch (error) {
    console.error("Institution view error:", error);
    res.status(500).json({ error: "Failed to fetch institution" });
  }
});

module.exports = router;
