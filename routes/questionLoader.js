const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { verifyToken } = require("../middleware/auth");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// Cache for question file paths (built on first request)
let questionFileIndex = null;

// Build index of all question files (runs once on startup or first request)
function buildQuestionIndex() {
  console.log("[INDEX] Building question file index...");
  const startTime = Date.now();
  const index = new Map();
  const dataDir = path.join(__dirname, "..", "data");

  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDirectory(filePath);
      } else if (file.endsWith(".json")) {
        const questionId = file.replace(".json", "");
        index.set(questionId, filePath);
      }
    }
  }

  scanDirectory(dataDir);
  const duration = Date.now() - startTime;
  console.log(
    `[INDEX] Index built with ${index.size} questions in ${duration}ms`,
  );
  return index;
}

// Get question file path from index (fast lookup)
function getQuestionFile(questionId) {
  if (!questionFileIndex) {
    questionFileIndex = buildQuestionIndex();
  }
  return questionFileIndex.get(questionId);
}

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

// Get a single question by ID (on-demand loading)
router.get("/single/:questionId", verifyToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    console.log(`[SINGLE] Loading question: ${questionId}`);

    const questionFile = getQuestionFile(questionId);

    if (questionFile) {
      const questionData = JSON.parse(fs.readFileSync(questionFile, "utf8"));
      console.log(`[SINGLE] Found: ${questionId}`);
      res.json({ question: questionData });
    } else {
      console.log(`[SINGLE] Not found: ${questionId}`);
      res.status(404).json({ error: "Question not found" });
    }
  } catch (error) {
    console.error("[SINGLE] Error:", error);
    res.status(500).json({ error: "Failed to load question" });
  }
});

// Load ALL questions from a set in one request (FAST - uses index)
router.get("/load/:setId", verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;
    const startTime = Date.now();
    console.log(`[LOAD] Loading all questions for set: ${setId}`);

    // Get question set from database to get question_ids
    const { data: questionSet, error } = await supabase
      .from("question_sets")
      .select("question_ids")
      .eq("id", setId)
      .single();

    if (error) {
      console.error("[LOAD] Error fetching question set:", error);
      return res.json({ questions: [] });
    }

    const questionIds = questionSet.question_ids || [];
    console.log(`[LOAD] Found ${questionIds.length} question IDs`);

    if (questionIds.length === 0) {
      return res.json({ questions: [] });
    }

    // Build index if not already built
    if (!questionFileIndex) {
      questionFileIndex = buildQuestionIndex();
    }

    // Load all questions using the index (FAST!)
    const questions = [];
    let foundCount = 0;
    let notFoundCount = 0;

    for (const questionId of questionIds) {
      try {
        const questionFile = questionFileIndex.get(questionId);

        if (questionFile) {
          const questionData = JSON.parse(
            fs.readFileSync(questionFile, "utf8"),
          );
          questions.push(questionData);
          foundCount++;
        } else {
          console.log(`[LOAD] Not found: ${questionId}`);
          notFoundCount++;
        }
      } catch (err) {
        console.error(`[LOAD] Error loading ${questionId}:`, err.message);
        notFoundCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[LOAD] Complete: ${foundCount} loaded, ${notFoundCount} missing in ${duration}ms`,
    );

    res.json({ questions });
  } catch (error) {
    console.error("[LOAD] Error:", error);
    res.status(500).json({ error: "Failed to load questions" });
  }
});

module.exports = router;
