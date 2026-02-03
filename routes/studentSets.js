const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// Create a new student set (admin only)
router.post("/create", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can create student sets" });
    }

    const { setName, students = [] } = req.body;
    const institutionId = req.user.institution;

    if (!setName) {
      return res.status(400).json({ error: "Set name is required" });
    }

    const setId = `${institutionId}-${setName}`;

    // Check if set already exists
    const { data: existing } = await supabase
      .from("student_sets")
      .select("id")
      .eq("id", setId)
      .single();

    if (existing) {
      return res
        .status(400)
        .json({ error: "Student set with this name already exists" });
    }

    const { data, error } = await supabase
      .from("student_sets")
      .insert([{ id: setId, students }])
      .select()
      .single();

    if (error) throw error;

    res.json({ studentSet: data });
  } catch (error) {
    console.error("Create student set error:", error);
    res.status(500).json({ error: "Failed to create student set" });
  }
});

// Get all student sets for institution (admin only)
router.get("/list", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can view all student sets" });
    }

    const institutionId = req.user.institution;

    const { data: studentSets, error } = await supabase
      .from("student_sets")
      .select("*")
      .like("id", `${institutionId}-%`);

    if (error) throw error;

    res.json({ studentSets: studentSets || [] });
  } catch (error) {
    console.error("List student sets error:", error);
    res.status(500).json({ error: "Failed to fetch student sets" });
  }
});

// Update student set (admin only)
router.put("/update/:setId", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can update student sets" });
    }

    const { setId } = req.params;
    const { students } = req.body;

    if (!students || !Array.isArray(students)) {
      return res.status(400).json({ error: "Students array is required" });
    }

    const { data, error } = await supabase
      .from("student_sets")
      .update({ students })
      .eq("id", setId)
      .select()
      .single();

    if (error) throw error;

    res.json({ studentSet: data });
  } catch (error) {
    console.error("Update student set error:", error);
    res.status(500).json({ error: "Failed to update student set" });
  }
});

// Share student set with staff (admin only)
router.post("/share", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can share student sets" });
    }

    const { setId, staffEmail } = req.body;

    if (!setId || !staffEmail) {
      return res
        .status(400)
        .json({ error: "Set ID and staff email are required" });
    }

    // Get staff user
    const { data: staffUser, error: staffError } = await supabase
      .from("users")
      .select("*")
      .eq("email", staffEmail)
      .single();

    if (staffError || !staffUser) {
      return res.status(404).json({ error: "Staff user not found" });
    }

    if (staffUser.role !== "staff") {
      return res.status(400).json({ error: "User is not a staff member" });
    }

    // Add set to staff's student_sets array
    const currentSets = staffUser.student_sets || [];
    if (!currentSets.includes(setId)) {
      const { data, error } = await supabase
        .from("users")
        .update({ student_sets: [...currentSets, setId] })
        .eq("email", staffEmail)
        .select()
        .single();

      if (error) throw error;

      res.json({ message: "Student set shared successfully", user: data });
    } else {
      res.json({ message: "Student set already shared with this staff" });
    }
  } catch (error) {
    console.error("Share student set error:", error);
    res.status(500).json({ error: "Failed to share student set" });
  }
});

// Get student sets shared with current user (staff)
router.get("/my-sets", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ error: "Only staff can view shared sets" });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("student_sets")
      .eq("email", req.user.email)
      .single();

    if (userError) throw userError;

    const setIds = user.student_sets || [];

    if (setIds.length === 0) {
      return res.json({ studentSets: [] });
    }

    const { data: studentSets, error } = await supabase
      .from("student_sets")
      .select("*")
      .in("id", setIds);

    if (error) throw error;

    res.json({ studentSets: studentSets || [] });
  } catch (error) {
    console.error("Get my sets error:", error);
    res.status(500).json({ error: "Failed to fetch student sets" });
  }
});

// Remove share access from staff (admin only)
router.post("/unshare", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can unshare student sets" });
    }

    const { setId, staffEmail } = req.body;

    if (!setId || !staffEmail) {
      return res
        .status(400)
        .json({ error: "Set ID and staff email are required" });
    }

    // Get staff user
    const { data: staffUser, error: staffError } = await supabase
      .from("users")
      .select("*")
      .eq("email", staffEmail)
      .single();

    if (staffError || !staffUser) {
      return res.status(404).json({ error: "Staff user not found" });
    }

    // Remove set from staff's student_sets array
    const currentSets = staffUser.student_sets || [];
    const updatedSets = currentSets.filter((id) => id !== setId);

    const { data, error } = await supabase
      .from("users")
      .update({ student_sets: updatedSets })
      .eq("email", staffEmail)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Access removed successfully", user: data });
  } catch (error) {
    console.error("Unshare student set error:", error);
    res.status(500).json({ error: "Failed to remove access" });
  }
});

// Get shared staff for a set (admin only)
router.get("/shared-staff/:setId", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only admins can view shared staff" });
    }

    const { setId } = req.params;

    // Find all staff users who have this set in their student_sets
    const { data: staffUsers, error } = await supabase
      .from("users")
      .select("email, role, student_sets")
      .eq("role", "staff")
      .eq("institution", req.user.institution);

    if (error) throw error;

    // Filter staff who have access to this set
    const sharedStaff = (staffUsers || [])
      .filter((staff) => (staff.student_sets || []).includes(setId))
      .map((staff) => staff.email);

    res.json({ sharedStaff });
  } catch (error) {
    console.error("Get shared staff error:", error);
    res.status(500).json({ error: "Failed to fetch shared staff" });
  }
});

module.exports = router;
