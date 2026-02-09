const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

function normalizeQuestion(question) {
  return { id: question.id, ...(question.content || question) };
}

function uniqueArray(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function computeEndAt(startedAt, durationMinutes) {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  const ms = durationMinutes * 60 * 1000;
  return new Date(start.getTime() + ms).toISOString();
}

function isStartWindowOpen(test, now) {
  const nowTime = now.getTime();
  if (test.start_at) {
    const startTime = new Date(test.start_at).getTime();
    if (!Number.isNaN(startTime) && nowTime < startTime) return false;
  }
  if (test.last_start_at) {
    const lastStartTime = new Date(test.last_start_at).getTime();
    if (!Number.isNaN(lastStartTime) && nowTime > lastStartTime) return false;
  }
  return true;
}

// Create a new test (staff only)
router.post("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ error: "Only staff can create tests" });
    }

    const {
      name,
      questionSetIds = [],
      durationMinutes = 30,
      isPublic = true,
      assignedStudentSets = [],
      startAt,
      lastStartAt,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Test name is required" });
    }

    if (!Array.isArray(questionSetIds) || questionSetIds.length === 0) {
      return res
        .status(400)
        .json({ error: "Select at least one question set" });
    }

    const { data: sets, error: setsError } = await supabase
      .from("question_sets")
      .select("id, question_ids, created_by")
      .in("id", questionSetIds);

    if (setsError) throw setsError;

    const ownedSets = (sets || []).filter(
      (set) => set.created_by === req.user.email,
    );

    if (ownedSets.length !== questionSetIds.length) {
      return res
        .status(403)
        .json({ error: "You can only use your own question sets" });
    }

    const questionIds = uniqueArray(
      ownedSets.flatMap((set) => set.question_ids || []),
    );

    if (questionIds.length === 0) {
      return res.status(400).json({ error: "Selected sets have no questions" });
    }

    const testId = `test-${req.user.email.split("@")[0]}-${Date.now()}`;

    const { data: test, error } = await supabase
      .from("tests")
      .insert([
        {
          id: testId,
          name,
          institution: req.user.institution,
          created_by: req.user.email,
          question_set_ids: questionSetIds,
          question_ids: questionIds,
          duration_minutes: durationMinutes,
          is_public: isPublic,
          assigned_student_sets: assignedStudentSets,
          start_at: parseTimestamp(startAt),
          last_start_at: parseTimestamp(lastStartAt),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({ test });
  } catch (error) {
    console.error("Create test error:", error);
    res.status(500).json({ error: "Failed to create test" });
  }
});

// List tests
router.get("/", verifyToken, async (req, res) => {
  try {
    const { data: tests, error } = await supabase
      .from("tests")
      .select("*")
      .eq("institution", req.user.institution)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (req.user.role === "staff") {
      const staffTests = (tests || []).filter(
        (test) => test.created_by === req.user.email,
      );
      return res.json({ tests: staffTests });
    }

    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Access denied" });
    }

    const { data: studentSets } = await supabase
      .from("student_sets")
      .select("id")
      .contains("students", [req.user.email]);

    const studentSetIds = (studentSets || []).map((set) => set.id);

    const visibleTests = (tests || []).filter((test) => {
      if (test.is_public) return true;
      const assigned = test.assigned_student_sets || [];
      return assigned.some((setId) => studentSetIds.includes(setId));
    });

    res.json({ tests: visibleTests });
  } catch (error) {
    console.error("List tests error:", error);
    res.status(500).json({ error: "Failed to fetch tests" });
  }
});

// Get current student's attempt for a test
router.get("/:testId/attempt", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ error: "Only students can access attempts" });
    }

    const { testId } = req.params;

    const { data: test, error: testError } = await supabase
      .from("tests")
      .select("id, duration_minutes")
      .eq("id", testId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: "Test not found" });
    }

    const { data: attempt, error: attemptError } = await supabase
      .from("test_attempts")
      .select("*")
      .eq("test_id", testId)
      .eq("student_email", req.user.email)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    let updatedAttempt = attempt;
    if (!attempt.end_at) {
      const endAt = computeEndAt(
        attempt.started_at,
        test.duration_minutes || 30,
      );
      if (endAt) {
        const { data: patchedAttempt } = await supabase
          .from("test_attempts")
          .update({ end_at: endAt })
          .eq("id", attempt.id)
          .select()
          .single();
        if (patchedAttempt) updatedAttempt = patchedAttempt;
      }
    }

    res.json({
      attempt: updatedAttempt,
      serverTime: new Date().toISOString(),
      durationMinutes: test.duration_minutes,
    });
  } catch (error) {
    console.error("Get attempt error:", error);
    res.status(500).json({ error: "Failed to fetch attempt" });
  }
});

// Save progress for a test attempt
router.patch("/:testId/attempt", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can save attempts" });
    }

    const { testId } = req.params;
    const { answers, questionStatus, lastQuestionIndex } = req.body;

    const { data: attempt, error: attemptError } = await supabase
      .from("test_attempts")
      .select("*")
      .eq("test_id", testId)
      .eq("student_email", req.user.email)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    if (attempt.status === "submitted") {
      return res.status(400).json({ error: "Attempt already submitted" });
    }

    const updates = {
      last_saved_at: new Date().toISOString(),
    };

    if (Array.isArray(answers)) updates.answers = answers;
    if (questionStatus && typeof questionStatus === "object") {
      updates.question_status = questionStatus;
    }
    if (Number.isFinite(lastQuestionIndex)) {
      updates.last_question_index = lastQuestionIndex;
    }

    const { data: updatedAttempt, error } = await supabase
      .from("test_attempts")
      .update(updates)
      .eq("id", attempt.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ attempt: updatedAttempt });
  } catch (error) {
    console.error("Save attempt error:", error);
    res.status(500).json({ error: "Failed to save attempt" });
  }
});

// Get a single test
router.get("/:testId", verifyToken, async (req, res) => {
  try {
    const { testId } = req.params;

    const { data: test, error } = await supabase
      .from("tests")
      .select("*")
      .eq("id", testId)
      .single();

    if (error || !test) {
      return res.status(404).json({ error: "Test not found" });
    }

    res.json({ test });
  } catch (error) {
    console.error("Get test error:", error);
    res.status(500).json({ error: "Failed to fetch test" });
  }
});

// Load questions for a test
router.get("/:testId/questions", verifyToken, async (req, res) => {
  try {
    const { testId } = req.params;

    const { data: test, error } = await supabase
      .from("tests")
      .select("question_ids, institution, created_by")
      .eq("id", testId)
      .single();

    if (error || !test) {
      return res.status(404).json({ error: "Test not found" });
    }

    if (req.user.role === "staff" && test.created_by !== req.user.email) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (req.user.role !== "student" && req.user.role !== "staff") {
      return res.status(403).json({ error: "Access denied" });
    }

    const questionIds = test.question_ids || [];
    if (questionIds.length === 0) {
      return res.json({ questions: [] });
    }

    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .in("id", questionIds);

    if (questionsError) throw questionsError;

    const filteredQuestions = (questions || []).filter((q) => {
      const institutions = q.institutions || [];
      return (
        institutions.length === 0 || institutions.includes(test.institution)
      );
    });

    res.json({ questions: filteredQuestions.map(normalizeQuestion) });
  } catch (error) {
    console.error("Load test questions error:", error);
    res.status(500).json({ error: "Failed to load test questions" });
  }
});

// Start a test attempt
router.post("/:testId/start", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can start tests" });
    }

    const { testId } = req.params;

    const { data: test, error: testError } = await supabase
      .from("tests")
      .select("id, duration_minutes, start_at, last_start_at")
      .eq("id", testId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: "Test not found" });
    }

    const now = new Date();
    if (!isStartWindowOpen(test, now)) {
      return res.status(403).json({
        error: "Test start window is not open",
        startAt: test.start_at,
        lastStartAt: test.last_start_at,
      });
    }

    const { data: existingAttempt } = await supabase
      .from("test_attempts")
      .select("*")
      .eq("test_id", testId)
      .eq("student_email", req.user.email)
      .single();

    if (existingAttempt && existingAttempt.status === "submitted") {
      return res.status(400).json({ error: "Test already submitted" });
    }

    if (existingAttempt) {
      let updatedAttempt = existingAttempt;
      if (!existingAttempt.end_at) {
        const endAt = computeEndAt(
          existingAttempt.started_at,
          test.duration_minutes || 30,
        );
        if (endAt) {
          const { data: patchedAttempt } = await supabase
            .from("test_attempts")
            .update({ end_at: endAt })
            .eq("id", existingAttempt.id)
            .select()
            .single();
          if (patchedAttempt) updatedAttempt = patchedAttempt;
        }
      }
      return res.json({
        attempt: updatedAttempt,
        serverTime: new Date().toISOString(),
        durationMinutes: test.duration_minutes || 30,
      });
    }

    const attemptId = `attempt-${req.user.email.split("@")[0]}-${Date.now()}`;

    const endAt = computeEndAt(now.toISOString(), test.duration_minutes || 30);

    const { data: attempt, error } = await supabase
      .from("test_attempts")
      .insert([
        {
          id: attemptId,
          test_id: testId,
          student_email: req.user.email,
          status: "in_progress",
          end_at: endAt,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({
      attempt,
      serverTime: new Date().toISOString(),
      durationMinutes: test.duration_minutes || 30,
    });
  } catch (error) {
    console.error("Start test error:", error);
    res.status(500).json({ error: "Failed to start test" });
  }
});

// Submit a test attempt
router.post("/:testId/submit", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can submit tests" });
    }

    const { testId } = req.params;
    const { answers = [] } = req.body;

    const { data: attempt, error: attemptError } = await supabase
      .from("test_attempts")
      .select("*")
      .eq("test_id", testId)
      .eq("student_email", req.user.email)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: "Test attempt not found" });
    }

    if (attempt.status === "submitted") {
      return res.status(400).json({ error: "Test already submitted" });
    }

    const { data: test, error: testError } = await supabase
      .from("tests")
      .select("question_ids")
      .eq("id", testId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: "Test not found" });
    }

    const questionIds = test.question_ids || [];

    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .in("id", questionIds);

    if (questionsError) throw questionsError;

    const answerMap = new Map(
      (answers || []).map((entry) => [entry.questionId, entry.answer]),
    );

    let score = 0;
    let total = 0;
    const perQuestion = [];

    (questions || []).forEach((question) => {
      const flatQuestion = normalizeQuestion(question);
      const questionType = flatQuestion.question_type || "mcq_single";
      const correctAnswer = flatQuestion.answer?.value ?? "";
      const userAnswer = answerMap.get(flatQuestion.id);

      if (questionType === "mcq_single") {
        total += 1;
        const isCorrect = userAnswer === correctAnswer;
        if (isCorrect) score += 1;
        perQuestion.push({
          questionId: flatQuestion.id,
          correctAnswer,
          userAnswer,
          isCorrect,
        });
      } else if (questionType === "numerical") {
        total += 1;
        const userNum = parseFloat(userAnswer);
        const correctNum = parseFloat(correctAnswer);
        const isCorrect =
          Number.isFinite(userNum) &&
          Number.isFinite(correctNum) &&
          Math.abs(userNum - correctNum) < 0.01;
        if (isCorrect) score += 1;
        perQuestion.push({
          questionId: flatQuestion.id,
          correctAnswer,
          userAnswer,
          isCorrect,
        });
      }
    });

    const submittedAt = new Date();
    const startedAt = attempt.started_at ? new Date(attempt.started_at) : null;
    const durationSeconds = startedAt
      ? Math.max(0, Math.floor((submittedAt - startedAt) / 1000))
      : 0;

    const { data: updatedAttempt, error: updateError } = await supabase
      .from("test_attempts")
      .update({
        submitted_at: submittedAt.toISOString(),
        duration_seconds: durationSeconds,
        status: "submitted",
        score,
        total,
        answers,
        result: { perQuestion },
      })
      .eq("id", attempt.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      attempt: updatedAttempt,
      score,
      total,
      percentage: total ? Math.round((score / total) * 100) : 0,
    });
  } catch (error) {
    console.error("Submit test error:", error);
    res.status(500).json({ error: "Failed to submit test" });
  }
});

// List attempts for the current student
router.get("/attempts/list", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can view attempts" });
    }

    const { data: attempts, error } = await supabase
      .from("test_attempts")
      .select("*")
      .eq("student_email", req.user.email)
      .order("started_at", { ascending: false });

    if (error) throw error;

    const testIds = (attempts || []).map((attempt) => attempt.test_id);
    const { data: tests } = await supabase
      .from("tests")
      .select("id, name, duration_minutes")
      .in("id", testIds.length ? testIds : ["__none__"]);

    const testMap = new Map((tests || []).map((test) => [test.id, test]));

    const enriched = (attempts || []).map((attempt) => ({
      ...attempt,
      test: testMap.get(attempt.test_id) || null,
    }));

    res.json({ attempts: enriched });
  } catch (error) {
    console.error("List attempts error:", error);
    res.status(500).json({ error: "Failed to fetch attempts" });
  }
});

// Get attempt details for review (student or staff)
router.get("/attempts/:attemptId", verifyToken, async (req, res) => {
  try {
    const { attemptId } = req.params;

    const { data: attempt, error: attemptError } = await supabase
      .from("test_attempts")
      .select("*")
      .eq("id", attemptId)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    const { data: test, error: testError } = await supabase
      .from("tests")
      .select("*")
      .eq("id", attempt.test_id)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: "Test not found" });
    }

    if (req.user.role === "student") {
      if (attempt.student_email !== req.user.email) {
        return res.status(403).json({ error: "Access denied" });
      }
    } else if (req.user.role === "staff") {
      if (test.created_by !== req.user.email) {
        return res.status(403).json({ error: "Access denied" });
      }
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ attempt, test });
  } catch (error) {
    console.error("Get attempt review error:", error);
    res.status(500).json({ error: "Failed to fetch attempt" });
  }
});

// List attempts for a test (staff only)
router.get("/:testId/attempts", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ error: "Only staff can view attempts" });
    }

    const { testId } = req.params;

    const { data: test, error: testError } = await supabase
      .from("tests")
      .select("id, created_by")
      .eq("id", testId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: "Test not found" });
    }

    if (test.created_by !== req.user.email) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { data: attempts, error } = await supabase
      .from("test_attempts")
      .select("*")
      .eq("test_id", testId)
      .order("started_at", { ascending: false });

    if (error) throw error;

    res.json({ attempts: attempts || [] });
  } catch (error) {
    console.error("List test attempts error:", error);
    res.status(500).json({ error: "Failed to fetch attempts" });
  }
});

module.exports = router;
