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

const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
