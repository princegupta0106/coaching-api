const express = require("express");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const JWT_SECRET = process.env.JWT_SECRET;

// Get current user data
router.get("/me", verifyToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("email, institution, role, access_sets, student_sets")
      .eq("email", req.user.email)
      .single();

    if (error) throw error;

    res.json({ user });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, institution, role = "student" } = req.body;

    if (!email || !password || !institution) {
      return res
        .status(400)
        .json({ error: "Email, password, and institution are required" });
    }

    // Validate role
    if (!["student", "staff", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Check if institution exists
    const { data: institutionData, error: instError } = await supabase
      .from("institutions")
      .select("*")
      .eq("institution_id", institution)
      .single();

    if (instError || !institutionData) {
      return res
        .status(400)
        .json({ error: "Institution does not exist. Please contact admin." });
    }

    // Create user
    const { data, error } = await supabase
      .from("users")
      .insert([{ email, password, institution, role }])
      .select()
      .single();

    if (error) throw error;

    // Add student email to institution's all_students array
    const currentStudents = institutionData.all_students || [];
    console.log("Current students:", currentStudents);
    console.log("Adding student:", email);

    if (!currentStudents.includes(email)) {
      const updatedStudents = [...currentStudents, email];
      console.log("Updated students array:", updatedStudents);

      const { data: updateData, error: updateError } = await supabase
        .from("institutions")
        .update({ all_students: updatedStudents })
        .eq("institution_id", institution)
        .select();

      if (updateError) {
        console.error(
          "Failed to update institution all_students:",
          updateError,
        );
      } else {
        console.log("Successfully updated institution:", updateData);
      }
    }

    const token = jwt.sign(
      {
        email: data.email,
        institution: data.institution,
        role: data.role,
      },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.json({
      token,
      user: {
        email: data.email,
        institution: data.institution,
        role: data.role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("password", password)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        email: user.email,
        institution: user.institution,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.json({
      token,
      user: {
        email: user.email,
        institution: user.institution,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
