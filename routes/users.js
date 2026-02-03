const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// Get all students in admin's institution
router.get("/institution-students", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can view students" });
    }

    const { data: students, error } = await supabase
      .from("users")
      .select("email, institution")
      .eq("institution", req.user.institution)
      .eq("role", "student");

    if (error) throw error;

    res.json({ students: students || [] });
  } catch (error) {
    console.error("List students error:", error);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

// Get all users in admin's institution
router.get("/list", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can view users" });
    }

    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, role, student_sets, institution")
      .eq("institution", req.user.institution);

    if (error) throw error;

    res.json({ users: users || [] });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Create new user (admin only)
router.post("/create", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can create users" });
    }

    const { email, password, role = "student" } = req.body;
    const institution = req.user.institution;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!["student", "staff", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create user
    const { data, error } = await supabase
      .from("users")
      .insert([{ email, password, institution, role }])
      .select()
      .single();

    if (error) throw error;

    // Add to institution's all_students
    const { data: institutionData } = await supabase
      .from("institutions")
      .select("all_students")
      .eq("institution_id", institution)
      .single();

    if (institutionData) {
      const currentStudents = institutionData.all_students || [];
      if (!currentStudents.includes(email)) {
        await supabase
          .from("institutions")
          .update({ all_students: [...currentStudents, email] })
          .eq("institution_id", institution);
      }
    }

    res.json({ message: "User created successfully", user: data });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Update user (admin only)
router.put("/update/:email", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can update users" });
    }

    const { email } = req.params;
    const { password, role } = req.body;

    // Verify user is in admin's institution
    const { data: user } = await supabase
      .from("users")
      .select("institution")
      .eq("email", email)
      .single();

    if (!user || user.institution !== req.user.institution) {
      return res
        .status(403)
        .json({ error: "Can only update users in your institution" });
    }

    const updates = {};
    if (password) updates.password = password;
    if (role && ["student", "staff", "admin"].includes(role))
      updates.role = role;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("email", email)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "User updated successfully", user: data });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Delete user (admin only)
router.delete("/delete/:email", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can delete users" });
    }

    const { email } = req.params;

    // Verify user is in admin's institution
    const { data: user } = await supabase
      .from("users")
      .select("institution")
      .eq("email", email)
      .single();

    if (!user || user.institution !== req.user.institution) {
      return res
        .status(403)
        .json({ error: "Can only delete users in your institution" });
    }

    // Don't allow admin to delete themselves
    if (email === req.user.email) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const { error } = await supabase.from("users").delete().eq("email", email);

    if (error) throw error;

    // Remove from institution's all_students
    const { data: institutionData } = await supabase
      .from("institutions")
      .select("all_students")
      .eq("institution_id", req.user.institution)
      .single();

    if (institutionData) {
      const updatedStudents = (institutionData.all_students || []).filter(
        (e) => e !== email,
      );
      await supabase
        .from("institutions")
        .update({ all_students: updatedStudents })
        .eq("institution_id", req.user.institution);
    }

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;
