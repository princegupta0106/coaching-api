const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

async function getAllowedExamsForUser(user) {
  if (!user || user.role !== "student") {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("allowed_exams")
    .eq("email", user.email)
    .single();

  if (error) {
    console.error("Fetch allowed exams error:", error);
    return null;
  }

  const allowed = Array.isArray(data?.allowed_exams)
    ? data.allowed_exams.filter(Boolean)
    : [];

  return allowed.length > 0 ? allowed : null;
}

// Get all exams
router.get("/exams", verifyToken, async (req, res) => {
  try {
    const allowedExams = await getAllowedExamsForUser(req.user);
    const query = supabase.from("exams").select("*");
    const { data: exams, error } = allowedExams
      ? await query.in("id", allowedExams)
      : await query;

    if (error) throw error;

    res.json({ exams: exams || [] });
  } catch (error) {
    console.error("Get exams error:", error);
    res.status(500).json({ error: "Failed to fetch exams" });
  }
});

// Get subjects for an exam
router.get("/exams/:examId/subjects", verifyToken, async (req, res) => {
  try {
    const { examId } = req.params;

    const allowedExams = await getAllowedExamsForUser(req.user);
    if (allowedExams && !allowedExams.includes(examId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { data: exam, error } = await supabase
      .from("exams")
      .select("subjects")
      .eq("id", examId)
      .single();

    if (error) throw error;

    const subjectIds = exam.subjects || [];

    if (subjectIds.length === 0) {
      return res.json({ subjects: [] });
    }

    const { data: subjects, error: subjectsError } = await supabase
      .from("subjects")
      .select("*")
      .in("id", subjectIds);

    if (subjectsError) throw subjectsError;

    res.json({ subjects: subjects || [] });
  } catch (error) {
    console.error("Get subjects error:", error);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

// Get question sets (chapters) for a subject
router.get(
  "/subjects/:subjectId/question-sets",
  verifyToken,
  async (req, res) => {
    try {
      const { subjectId } = req.params;
      console.log(`[API] Fetching question sets for subject: ${subjectId}`);
      console.log(`[API] User:`, req.user);

      const { data: subject, error } = await supabase
        .from("subjects")
        .select("question_sets")
        .eq("id", subjectId)
        .single();

      if (error) {
        console.error("[API] Supabase error:", error);
        throw error;
      }

      console.log(
        `[API] Found ${subject?.question_sets?.length || 0} question sets`,
      );
      res.json({ questionSets: subject.question_sets || [] });
    } catch (error) {
      console.error(
        "[API] Get question sets error:",
        error.message,
        error.stack,
      );
      res.status(500).json({
        error: "Failed to fetch question sets",
        details: error.message,
        subjectId: req.params.subjectId,
      });
    }
  },
);

// Get questions for a question set
router.get("/question-sets/:setId/questions", verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;

    const { data: questionSet, error } = await supabase
      .from("question_sets")
      .select("question_ids")
      .eq("id", setId)
      .single();

    if (error) throw error;

    const questionIds = questionSet.question_ids || [];

    if (questionIds.length === 0) {
      return res.json({ questions: [] });
    }

    // Get questions and filter by institution if needed
    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .in("id", questionIds);

    if (questionsError) throw questionsError;

    // Filter questions based on institution access
    const userInstitution = req.user.institution;
    const filteredQuestions = (questions || []).filter((q) => {
      const institutions = q.institutions || [];
      return (
        institutions.length === 0 || institutions.includes(userInstitution)
      );
    });

    res.json({ questions: filteredQuestions });
  } catch (error) {
    console.error("Get questions error:", error);
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// Create a new question set (staff only)
router.post("/my-sets/create", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res
        .status(403)
        .json({ error: "Only staff can create question sets" });
    }

    const { name, questionIds = [] } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Set name is required" });
    }

    // Generate unique ID
    const setId = `qset-${req.user.email.split("@")[0]}-${Date.now()}`;

    const { data: questionSet, error } = await supabase
      .from("question_sets")
      .insert([
        {
          id: setId,
          name,
          question_ids: questionIds,
          created_by: req.user.email,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Add to user's sets_created
    const { data: user } = await supabase
      .from("users")
      .select("sets_created")
      .eq("email", req.user.email)
      .single();

    const setsCreated = user.sets_created || [];
    await supabase
      .from("users")
      .update({ sets_created: [...setsCreated, setId] })
      .eq("email", req.user.email);

    res.json({ questionSet });
  } catch (error) {
    console.error("Create question set error:", error);
    res.status(500).json({ error: "Failed to create question set" });
  }
});

// Get staff's created sets
router.get("/my-sets", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ error: "Only staff can access this" });
    }

    const { data: user } = await supabase
      .from("users")
      .select("sets_created")
      .eq("email", req.user.email)
      .single();

    const setIds = user.sets_created || [];

    if (setIds.length === 0) {
      return res.json({ sets: [] });
    }

    const { data: sets, error } = await supabase
      .from("question_sets")
      .select("*")
      .in("id", setIds);

    if (error) throw error;

    res.json({ sets: sets || [] });
  } catch (error) {
    console.error("Get my sets error:", error);
    res.status(500).json({ error: "Failed to fetch sets" });
  }
});

// Update question set (add/remove questions)
router.put("/my-sets/:setId", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ error: "Only staff can update sets" });
    }

    const { setId } = req.params;
    const { questionIds, name } = req.body;

    // Verify ownership
    const { data: questionSet } = await supabase
      .from("question_sets")
      .select("created_by")
      .eq("id", setId)
      .single();

    if (!questionSet || questionSet.created_by !== req.user.email) {
      return res
        .status(403)
        .json({ error: "You can only update your own sets" });
    }

    const updates = {};
    if (questionIds !== undefined) updates.question_ids = questionIds;
    if (name) updates.name = name;

    const { data, error } = await supabase
      .from("question_sets")
      .update(updates)
      .eq("id", setId)
      .select()
      .single();

    if (error) throw error;

    res.json({ questionSet: data });
  } catch (error) {
    console.error("Update question set error:", error);
    res.status(500).json({ error: "Failed to update question set" });
  }
});

// Delete question set
router.delete("/my-sets/:setId", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ error: "Only staff can delete sets" });
    }

    const { setId } = req.params;

    // Verify ownership
    const { data: questionSet } = await supabase
      .from("question_sets")
      .select("created_by")
      .eq("id", setId)
      .single();

    if (!questionSet || questionSet.created_by !== req.user.email) {
      return res
        .status(403)
        .json({ error: "You can only delete your own sets" });
    }

    // Delete the set
    const { error } = await supabase
      .from("question_sets")
      .delete()
      .eq("id", setId);

    if (error) throw error;

    // Remove from user's sets_created
    const { data: user } = await supabase
      .from("users")
      .select("sets_created")
      .eq("email", req.user.email)
      .single();

    const updatedSets = (user.sets_created || []).filter((id) => id !== setId);
    await supabase
      .from("users")
      .update({ sets_created: updatedSets })
      .eq("email", req.user.email);

    // Remove from all users' access_sets
    const { data: allUsers } = await supabase
      .from("users")
      .select("email, access_sets");

    for (const u of allUsers || []) {
      if ((u.access_sets || []).includes(setId)) {
        const newAccessSets = u.access_sets.filter((id) => id !== setId);
        await supabase
          .from("users")
          .update({ access_sets: newAccessSets })
          .eq("email", u.email);
      }
    }

    res.json({ message: "Question set deleted successfully" });
  } catch (error) {
    console.error("Delete question set error:", error);
    res.status(500).json({ error: "Failed to delete question set" });
  }
});

// Share question set with student_set
router.post("/my-sets/:setId/share", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ error: "Only staff can share sets" });
    }

    const { setId } = req.params;
    const { studentSetId } = req.body;

    if (!studentSetId) {
      return res.status(400).json({ error: "Student set ID is required" });
    }

    // Verify ownership of question set
    const { data: questionSet } = await supabase
      .from("question_sets")
      .select("created_by")
      .eq("id", setId)
      .single();

    if (!questionSet || questionSet.created_by !== req.user.email) {
      return res
        .status(403)
        .json({ error: "You can only share your own sets" });
    }

    // Verify staff has access to this student set
    const { data: staffUser } = await supabase
      .from("users")
      .select("student_sets")
      .eq("email", req.user.email)
      .single();

    if (!(staffUser.student_sets || []).includes(studentSetId)) {
      return res
        .status(403)
        .json({ error: "You do not have access to this student set" });
    }

    // Get all students in the student set
    const { data: studentSet } = await supabase
      .from("student_sets")
      .select("students")
      .eq("id", studentSetId)
      .single();

    const studentEmails = studentSet.students || [];

    // Add question set to each student's access_sets
    for (const email of studentEmails) {
      const { data: student } = await supabase
        .from("users")
        .select("access_sets")
        .eq("email", email)
        .single();

      if (student) {
        const accessSets = student.access_sets || [];
        if (!accessSets.includes(setId)) {
          await supabase
            .from("users")
            .update({ access_sets: [...accessSets, setId] })
            .eq("email", email);
        }
      }
    }

    res.json({
      message: "Question set shared successfully",
      sharedWith: studentEmails.length,
    });
  } catch (error) {
    console.error("Share question set error:", error);
    res.status(500).json({ error: "Failed to share question set" });
  }
});

// Get question sets by IDs (for students to load their access_sets)
router.post("/by-ids", verifyToken, async (req, res) => {
  try {
    const { setIds } = req.body;

    if (!setIds || !Array.isArray(setIds) || setIds.length === 0) {
      return res.json({ sets: [] });
    }

    const { data: sets, error } = await supabase
      .from("question_sets")
      .select("*")
      .in("id", setIds);

    if (error) throw error;

    res.json({ sets: sets || [] });
  } catch (error) {
    console.error("Get sets by IDs error:", error);
    res.status(500).json({ error: "Failed to fetch question sets" });
  }
});

// Get accessible question sets for current student
router.get("/accessible", verifyToken, async (req, res) => {
  try {
    // Get user's access_sets
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("access_sets")
      .eq("email", req.user.email)
      .single();

    if (userError) throw userError;

    const accessSetIds = user.access_sets || [];

    if (accessSetIds.length === 0) {
      return res.json({ sets: [] });
    }

    // Get full question set details
    const { data: sets, error } = await supabase
      .from("question_sets")
      .select("*")
      .in("id", accessSetIds);

    if (error) throw error;

    res.json({ sets: sets || [] });
  } catch (error) {
    console.error("Get accessible sets error:", error);
    res.status(500).json({ error: "Failed to fetch accessible question sets" });
  }
});

// QS Loader - Load question sets for authenticated user
router.get("/qs-loader", verifyToken, async (req, res) => {
  try {
    console.log("=== QS Loader Started ===");
    console.log("User email:", req.user.email);

    // Get user's access_sets array
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("access_sets")
      .eq("email", req.user.email)
      .single();

    if (userError) {
      console.error("User fetch error:", userError);
      throw userError;
    }

    console.log("User access_sets array:", user.access_sets);

    const accessSetIds = user.access_sets || [];

    if (accessSetIds.length === 0) {
      console.log("No access sets found for user");
      return res.json({ sets: [] });
    }

    // Get all question sets matching the IDs
    const { data: sets, error: setsError } = await supabase
      .from("question_sets")
      .select("*")
      .in("id", accessSetIds);

    if (setsError) {
      console.error("Question sets fetch error:", setsError);
      throw setsError;
    }

    console.log("Fetched question sets:", sets);
    console.log("Total sets found:", sets?.length || 0);
    console.log("=== QS Loader Complete ===");

    res.json({ sets: sets || [] });
  } catch (error) {
    console.error("=== QS Loader Error ===");
    console.error("Error details:", error);
    res.status(500).json({ error: "Failed to load question sets" });
  }
});

module.exports = router;
