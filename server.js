require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const institutionRoutes = require("./routes/institution");
const studentSetsRoutes = require("./routes/studentSets");
const usersRoutes = require("./routes/users");
const questionSetsRoutes = require("./routes/questionSets");
const studentStatusRoutes = require("./routes/studentStatus");
const questionLoaderRoutes = require("./routes/questionLoader");
const questionUploaderRoutes = require("./routes/questionUploader");
const simpleBulkUploadRoutes = require("./routes/simpleBulkUpload");
const superAdminRoutes = require("./routes/superAdmin");
const testRoutes = require("./routes/tests");

const app = express();
const PORT = process.env.PORT || 3000;

// Log environment check on startup
console.log("=== Server Configuration ===");
console.log("PORT:", PORT);
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing");
console.log(
  "SUPABASE_SERVICE_KEY:",
  process.env.SUPABASE_SERVICE_KEY ? "✓ Set" : "✗ Missing",
);
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "✓ Set" : "✗ Missing");
console.log("===========================");

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static("public"));

app.use("/api/auth", authRoutes);
app.use("/api/student-status", studentStatusRoutes);
app.use("/api/institution", institutionRoutes);
app.use("/api/student-sets", studentSetsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/questions", questionSetsRoutes);
app.use("/api/questions", questionLoaderRoutes);
app.use("/api/questions", questionUploaderRoutes);
app.use("/api/bulk-upload", simpleBulkUploadRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/tests", testRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
