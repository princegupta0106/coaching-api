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

// Load questions from JSON files
router.get("/load/:setId", verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;
    console.log("Loading questions for set:", setId);

    // Get question set from database to get question_ids
    const { data: questionSet, error } = await supabase
      .from("question_sets")
      .select("question_ids")
      .eq("id", setId)
      .single();

    if (error) {
      console.error("Error fetching question set:", error);
      return res.json({ questions: [] });
    }

    const questionIds = questionSet.question_ids || [];
    console.log("Question IDs:", questionIds);

    if (questionIds.length === 0) {
      return res.json({ questions: [] });
    }

    // Load questions from JSON files
    const questions = [];
    const dataDir = path.join(__dirname, "..", "data");

    for (const questionId of questionIds) {
      try {
        // Find the JSON file - search recursively
        const questionFile = findQuestionFile(dataDir, questionId);

        if (questionFile) {
          const questionData = JSON.parse(
            fs.readFileSync(questionFile, "utf8"),
          );
          questions.push(questionData);
          console.log("Loaded question:", questionId);
        } else {
          console.log("Question file not found for:", questionId);
        }
      } catch (err) {
        console.error(`Error loading question ${questionId}:`, err.message);
      }
    }

    console.log("Total questions loaded:", questions.length);
    res.json({ questions });
  } catch (error) {
    console.error("Load questions error:", error);
    res.status(500).json({ error: "Failed to load questions" });
  }
});

// Recursively find a question JSON file
function findQuestionFile(dir, questionId) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      const found = findQuestionFile(filePath, questionId);
      if (found) return found;
    } else if (file === `${questionId}.json`) {
      return filePath;
    }
  }

  return null;
}

module.exports = router;
