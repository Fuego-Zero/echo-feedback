CREATE TABLE admin (
  id TEXT PRIMARY KEY CHECK (id = 'admin'),
  username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admin(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX session_expiry ON session(expires_at);
CREATE TABLE project (
  id TEXT PRIMARY KEY, ak TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  allowed_origins TEXT NOT NULL, allow_extension_clients INTEGER NOT NULL CHECK(allow_extension_clients IN (0,1)),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE feedback (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
  content TEXT NOT NULL, contact TEXT NOT NULL, user_id TEXT NOT NULL,
  project_version TEXT NOT NULL, source_page TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','processing','resolved')),
  note TEXT NOT NULL, submission_key TEXT NOT NULL, digest TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(project_id, submission_key)
);
CREATE INDEX feedback_project_status_time ON feedback(project_id,status,created_at DESC,id DESC);
CREATE INDEX feedback_time ON feedback(created_at DESC,id DESC);
CREATE INDEX feedback_status_time ON feedback(status,created_at DESC,id DESC);
CREATE TABLE attachment (
  id TEXT PRIMARY KEY, feedback_id TEXT NOT NULL REFERENCES feedback(id),
  disk_name TEXT NOT NULL UNIQUE, format TEXT NOT NULL CHECK(format='webp'),
  size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, position INTEGER NOT NULL
);
CREATE INDEX attachment_feedback ON attachment(feedback_id,position);
