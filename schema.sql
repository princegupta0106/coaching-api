CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  institution TEXT NOT NULL,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'staff', 'admin')),
  full_name TEXT,
  mobile_number TEXT,
  allowed_exams TEXT[] DEFAULT '{}',
  student_sets TEXT[] DEFAULT '{}',
  access_sets TEXT[] DEFAULT '{}',
  sets_created TEXT[] DEFAULT '{}',
  question_status JSONB DEFAULT '{}',
  bookmarks TEXT[] DEFAULT '{}'
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
  subject_name TEXT,
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

CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  created_by TEXT NOT NULL,
  question_set_ids TEXT[] DEFAULT '{}',
  question_ids TEXT[] DEFAULT '{}',
  duration_minutes INTEGER DEFAULT 30,
  is_public BOOLEAN DEFAULT TRUE,
  assigned_student_sets TEXT[] DEFAULT '{}',
  start_at TIMESTAMP,
  last_start_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL,
  student_email TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  started_at TIMESTAMP DEFAULT NOW(),
  end_at TIMESTAMP,
  last_saved_at TIMESTAMP,
  submitted_at TIMESTAMP,
  duration_seconds INTEGER DEFAULT 0,
  last_question_index INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  answers JSONB DEFAULT '[]',
  question_status JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  FOREIGN KEY (test_id) REFERENCES tests(id),
  FOREIGN KEY (student_email) REFERENCES users(email)
);

