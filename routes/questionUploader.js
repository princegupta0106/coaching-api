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

// Upload a question
router.post("/upload", verifyToken, async (req, res) => {
  try {
    const { questionSetId, questionId, questionData } = req.body;

    // Verify user is staff or admin
    if (req.user.role !== "staff" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only staff and admin can upload questions" });
    }

    if (!questionSetId || !questionId || !questionData) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get the question set to extract exam/subject/chapter info
    const { data: questionSet, error: setError } = await supabase
      .from("question_sets")
      .select("*")
      .eq("id", questionSetId)
      .single();

    if (setError || !questionSet) {
      console.error("Question set error:", setError);
      return res.status(404).json({ error: "Question set not found" });
    }

    console.log("Question set:", questionSet);

    // Extract exam and subject from the questionData or use defaults
    const examSlug = (
      questionData.metadata?.exam ||
      questionData.exam ||
      "jee-advanced"
    )
      .toLowerCase()
      .replace(/\s+/g, "-");
    const subjectSlug = (questionData.subject || "physics")
      .toLowerCase()
      .replace(/\s+/g, "-");
    const chapterSlug = (questionData.chapter || questionSet.name || "general")
      .toLowerCase()
      .replace(/\s+/g, "-");

    const dirPath = path.join(
      __dirname,
      "..",
      "data",
      examSlug,
      subjectSlug,
      chapterSlug,
    );
    const filePath = path.join(dirPath, `${questionId}.json`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Write JSON file
    fs.writeFileSync(filePath, JSON.stringify(questionData, null, 2), "utf8");

    console.log("Saved question file:", filePath);

    // Check if question already exists in database
    const { data: existingQuestion } = await supabase
      .from("questions")
      .select("id")
      .eq("id", questionId)
      .single();

    if (!existingQuestion) {
      // Insert into questions table with full content
      const { error: questionError } = await supabase.from("questions").insert({
        id: questionId,
        content: questionData,
        institutions: [],
      });

      if (questionError) {
        console.error("Error inserting question:", questionError);
        return res
          .status(500)
          .json({ error: "Failed to insert question into database" });
      }

      console.log("Inserted question into database:", questionId);
    }

    // Update question_set's question_ids array
    let currentQuestionIds = questionSet.question_ids || [];

    if (!currentQuestionIds.includes(questionId)) {
      currentQuestionIds.push(questionId);

      const { error: updateError } = await supabase
        .from("question_sets")
        .update({ question_ids: currentQuestionIds })
        .eq("id", questionSetId);

      if (updateError) {
        console.error("Error updating question set:", updateError);
        return res.status(500).json({ error: "Failed to update question set" });
      }

      console.log("Added question to set:", questionSetId);
    }

    res.json({
      message: "Question uploaded successfully",
      questionId,
      filePath: `data/${examSlug}/${subjectSlug}/${chapterSlug}/${questionId}.json`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk upload - create chapters and upload questions
router.post("/bulk-upload", verifyToken, async (req, res) => {
  try {
    const {
      examId,
      subjectId,
      chapterName,
      questions,
      createChapter,
      questionSetId,
    } = req.body;

    // Verify user is staff or admin
    if (req.user.role !== "staff" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only staff and admin can upload questions" });
    }

    if (
      !examId ||
      !subjectId ||
      !chapterName ||
      !questions ||
      questions.length === 0
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log(
      `Bulk upload batch: ${examId}/${subjectId}/${chapterName} with ${questions.length} questions`,
    );

    let questionSetToUse;
    let chapterCreated = false;

    // If questionSetId provided, use it; otherwise create or find chapter
    if (questionSetId) {
      const { data: existingSet } = await supabase
        .from("question_sets")
        .select("*")
        .eq("id", questionSetId)
        .single();

      questionSetToUse = existingSet;
    } else if (createChapter !== false) {
      // Check if question set already exists by name
      const { data: existingSet } = await supabase
        .from("question_sets")
        .select("*")
        .eq("name", chapterName)
        .single();

      if (!existingSet) {
        // Generate question set ID
        const newQuestionSetId = `qs-${subjectId.toLowerCase()}-${Date.now()}`;

        // Create new question set
        const { data: newSet, error: setError } = await supabase
          .from("question_sets")
          .insert({
            id: newQuestionSetId,
            name: chapterName,
            question_ids: [],
            created_by: req.user.id,
          })
          .select()
          .single();

        if (setError) {
          console.error("Error creating question set:", setError);
          return res
            .status(500)
            .json({ error: "Failed to create question set" });
        }

        questionSetToUse = newSet;
        chapterCreated = true;

        // Add question set to subject
        const { data: subject } = await supabase
          .from("subjects")
          .select("*")
          .eq("id", subjectId)
          .single();

        if (subject) {
          const questionSets = subject.question_sets || [];
          if (!questionSets.some((qs) => qs.id === newQuestionSetId)) {
            questionSets.push({ id: newQuestionSetId, name: chapterName });

            await supabase
              .from("subjects")
              .update({ question_sets: questionSets })
              .eq("id", subjectId);
          }
        }

        console.log("Created question set:", newQuestionSetId);
      } else {
        questionSetToUse = existingSet;
      }
    }

    // Prepare file system path
    const examSlug = examId.toLowerCase().replace(/\s+/g, "-");
    const subjectSlug = subjectId.toLowerCase().replace(/\s+/g, "-");
    const chapterSlug = chapterName.toLowerCase().replace(/\s+/g, "-");

    const dirPath = path.join(
      __dirname,
      "..",
      "data",
      examSlug,
      subjectSlug,
      chapterSlug,
    );

    // Create directory if it doesn't exist
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    let questionsAdded = 0;
    const currentQuestionIds = questionSetToUse.question_ids || [];

    // Process each question
    for (const question of questions) {
      try {
        const questionId = question.id;
        const questionData = question.data;

        // Write JSON file
        const filePath = path.join(dirPath, `${questionId}.json`);
        fs.writeFileSync(
          filePath,
          JSON.stringify(questionData, null, 2),
          "utf8",
        );

        // Check if question already exists in database
        const { data: existingQuestion } = await supabase
          .from("questions")
          .select("id")
          .eq("id", questionId)
          .single();

        if (!existingQuestion) {
          // Insert into questions table
          await supabase.from("questions").insert({
            id: questionId,
            content: questionData,
            institutions: [],
          });
        }

        // Add to question set if not already there
        if (!currentQuestionIds.includes(questionId)) {
          currentQuestionIds.push(questionId);
          questionsAdded++;
        }

        console.log("Processed question:", questionId);
      } catch (error) {
        console.error("Error processing question:", error);
      }
    }

    // Update question set with all question IDs
    await supabase
      .from("question_sets")
      .update({ question_ids: currentQuestionIds })
      .eq("id", questionSetToUse.id);

    res.json({
      message: "Bulk upload successful",
      chapterCreated,
      questionSetId: questionSetToUse.id,
      questionsAdded,
      totalQuestions: questions.length,
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
