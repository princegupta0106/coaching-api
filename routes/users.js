const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

function normalizeTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => `${v}`.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return null;
}

function normalizeQuestion(question) {
  const base = question.content || question;
  const normalized = { id: question.id, ...base };

  if (!normalized.subject_name && question.subject_name) {
    normalized.subject_name = question.subject_name;
  }
  if (!normalized.subject && question.subject) {
    normalized.subject = question.subject;
  }
  if (!normalized.exam && question.exam) {
    normalized.exam = question.exam;
  }
  if (!normalized.chapter && question.chapter) {
    normalized.chapter = question.chapter;
  }

  return normalized;
}

// Get all students in admin's institution (admin and staff)
router.get("/institution-students", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "staff") {
      return res
        .status(403)
        .json({ error: "Only admins and staff can view students" });
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

// Get all users in admin's institution (admin and staff)
router.get("/list", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "staff") {
      return res
        .status(403)
        .json({ error: "Only admins and staff can view users" });
    }

    const { data: users, error } = await supabase
      .from("users")
      .select(
        "email, role, student_sets, institution, full_name, mobile_number, allowed_exams",
      )
      .eq("institution", req.user.institution);

    if (error) throw error;

    res.json({ users: users || [] });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get bookmarks for current student
router.get("/bookmarks", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ error: "Only students can view bookmarks" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("bookmarks")
      .eq("email", req.user.email)
      .single();

    if (error) throw error;

    res.json({ bookmarks: user?.bookmarks || [] });
  } catch (error) {
    console.error("Get bookmarks error:", error);
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

// Load bookmarked questions for current student
router.get("/bookmarks/questions", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ error: "Only students can view bookmarks" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("bookmarks")
      .eq("email", req.user.email)
      .single();

    if (error) throw error;

    const bookmarks = Array.isArray(user?.bookmarks) ? user.bookmarks : [];
    if (!bookmarks.length) {
      return res.json({ questions: [] });
    }

    const ids = [...new Set(bookmarks.map((id) => `${id}`.trim()))].filter(
      Boolean,
    );

    if (!ids.length) {
      return res.json({ questions: [] });
    }

    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .in("id", ids);

    if (questionsError) throw questionsError;

    const userInstitution = req.user.institution;
    const filtered = (questions || []).filter((q) => {
      const institutions = q.institutions || [];
      return (
        institutions.length === 0 || institutions.includes(userInstitution)
      );
    });

    const questionMap = new Map(filtered.map((q) => [q.id, q]));
    const ordered = bookmarks
      .map((id) => questionMap.get(`${id}`.trim()))
      .filter(Boolean)
      .map(normalizeQuestion);

    res.json({ questions: ordered });
  } catch (error) {
    console.error("Get bookmark questions error:", error);
    res.status(500).json({ error: "Failed to fetch bookmarked questions" });
  }
});

// Add a bookmark for current student
router.post("/bookmarks", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can add bookmarks" });
    }

    const { questionId } = req.body;
    if (!questionId) {
      return res.status(400).json({ error: "questionId is required" });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("bookmarks")
      .eq("email", req.user.email)
      .single();

    if (userError) throw userError;

    const existing = user?.bookmarks || [];
    const updated = existing.includes(questionId)
      ? existing
      : [...existing, questionId];

    const { error } = await supabase
      .from("users")
      .update({ bookmarks: updated })
      .eq("email", req.user.email);

    if (error) throw error;

    res.json({ bookmarks: updated });
  } catch (error) {
    console.error("Add bookmark error:", error);
    res.status(500).json({ error: "Failed to add bookmark" });
  }
});

// Remove a bookmark for current student
router.delete("/bookmarks/:questionId", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ error: "Only students can remove bookmarks" });
    }

    const { questionId } = req.params;
    if (!questionId) {
      return res.status(400).json({ error: "questionId is required" });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("bookmarks")
      .eq("email", req.user.email)
      .single();

    if (userError) throw userError;

    const existing = user?.bookmarks || [];
    const updated = existing.filter((id) => id !== questionId);

    const { error } = await supabase
      .from("users")
      .update({ bookmarks: updated })
      .eq("email", req.user.email);

    if (error) throw error;

    res.json({ bookmarks: updated });
  } catch (error) {
    console.error("Remove bookmark error:", error);
    res.status(500).json({ error: "Failed to remove bookmark" });
  }
});

// Create new user (admin only)
router.post("/create", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can create users" });
    }

    const {
      email,
      password,
      role = "student",
      fullName,
      mobileNumber,
    } = req.body;
    const allowedExams = normalizeTextArray(req.body.allowedExams);
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
      .insert([
        {
          email,
          password,
          institution,
          role,
          full_name: fullName || null,
          mobile_number: mobileNumber || null,
          allowed_exams: allowedExams || [],
        },
      ])
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
    const { password, role, fullName, mobileNumber } = req.body;
    const allowedExams = normalizeTextArray(req.body.allowedExams);

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
    if (fullName !== undefined) updates.full_name = fullName || null;
    if (mobileNumber !== undefined)
      updates.mobile_number = mobileNumber || null;
    if (allowedExams !== null) updates.allowed_exams = allowedExams;

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
