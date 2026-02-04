const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// Get only question IDs/metadata (fast - no file loading)
router.get("/metadata/:setId", verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;
    console.log("Loading question metadata for set:", setId);

    // Get question set from database to get question_ids
    const { data: questionSet, error } = await supabase
      .from("question_sets")
      .select("question_ids")
      .eq("id", setId)
      .single();

    if (error) {
      console.error("Error fetching question set:", error);
      return res.json({ questionIds: [] });
    }

    const questionIds = questionSet.question_ids || [];
    console.log(`Metadata loaded: ${questionIds.length} question IDs`);

    res.json({ questionIds });
  } catch (error) {
    console.error("Load metadata error:", error);
    res.status(500).json({ error: "Failed to load metadata" });
  }
});

// Get a single question by ID (from Supabase)
router.get("/single/:questionId", verifyToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    console.log(`[SINGLE] Loading question: ${questionId}`);
    console.log(`[SINGLE] User:`, req.user);

    const { data: question, error } = await supabase
      .from("questions")
      .select("*")
      .eq("id", questionId)
      .single();

    if (error) {
      console.log(`[SINGLE] Not found in database: ${questionId}`, error);
      return res.status(404).json({
        error: "Question not found",
        questionId,
      });
    }

    // Flatten the question data - merge content into root level
    const flatQuestion = {
      id: question.id,
      ...(question.content || question),
    };

    console.log(
      `[SINGLE] Found: ${questionId}, type: ${flatQuestion.question_type}`,
    );
    res.json({ question: flatQuestion });
  } catch (error) {
    console.error("[SINGLE] Error:", error.message, error.stack);
    res.status(500).json({
      error: "Failed to load question",
      details: error.message,
      questionId: req.params.questionId,
    });
  }
});

// Load ALL questions from a set in one request (FAST - uses index)
router.get("/load/:setId", verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;
    const startTime = Date.now();
    console.log(`[LOAD] Loading all questions for set: ${setId}`);
    console.log(`[LOAD] User:`, req.user);

    // Get question set from database to get question_ids
    const { data: questionSet, error } = await supabase
      .from("question_sets")
      .select("question_ids")
      .eq("id", setId)
      .single();

    if (error) {
      console.error("[LOAD] Supabase error:", error.message, error);
      return res.status(500).json({
        error: "Failed to fetch question set",
        details: error.message,
        setId,
      });
    }

    const questionIds = questionSet.question_ids || [];
    console.log(`[LOAD] Found ${questionIds.length} question IDs`);

    if (questionIds.length === 0) {
      return res.json({ questions: [] });
    }

    // Load all questions from Supabase
    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .in("id", questionIds);

    if (questionsError) {
      console.error("[LOAD] Error fetching questions:", questionsError);
      return res.status(500).json({
        error: "Failed to fetch questions",
        details: questionsError.message,
      });
    }

    // Flatten all questions - merge content into root level
    const flatQuestions = (questions || []).map((q) => ({
      id: q.id,
      ...(q.content || q),
    }));

    const duration = Date.now() - startTime;
    console.log(
      `[LOAD] Loaded ${flatQuestions.length} questions in ${duration}ms`,
    );

    res.json({ questions: flatQuestions });
  } catch (error) {
    console.error("[LOAD] Error:", error);
    res.status(500).json({
      error: "Failed to load questions",
      details: error.message,
    });
  }
});

module.exports = router;
