CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  institution TEXT NOT NULL,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'staff', 'admin')),
  student_sets TEXT[] DEFAULT '{}',
  access_sets TEXT[] DEFAULT '{}',
  sets_created TEXT[] DEFAULT '{}',
  question_status JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS institutions (
  institution_id TEXT PRIMARY KEY,
  institution_name TEXT NOT NULL,
  all_students TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS student_sets (
  id TEXT PRIMARY KEY,
  students TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  content JSONB NOT NULL,
  institutions TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS question_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  question_ids TEXT[] DEFAULT '{}',
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  question_sets JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  subjects TEXT[] DEFAULT '{}'
);

