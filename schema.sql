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
  exam TEXT,
  subject TEXT,
  chapter TEXT,
  question_data JSONB,
  content JSONB,
  institutions TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS question_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  question_ids TEXT[] DEFAULT '{}',
  created_by TEXT NOT NULL,
  is_test BOOLEAN DEFAULT FALSE,
  test_date DATE,
  test_start_time TIME,
  test_end_time TIME,
  duration_minutes INTEGER,
  total_marks INTEGER,
  institution_id TEXT,
  test_window_start TIME,
  test_window_end TIME
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT,
  question_sets JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  name TEXT,
  subjects TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS test_results_and_status (
  test_id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  question_set_id TEXT NOT NULL,
  question_status JSONB DEFAULT '{}',
  user_start_time TIMESTAMP,
  user_end_time TIMESTAMP,
  answers JSONB DEFAULT '{}',
  FOREIGN KEY (user_email) REFERENCES users(email),
  FOREIGN KEY (question_set_id) REFERENCES question_sets(id)
);

