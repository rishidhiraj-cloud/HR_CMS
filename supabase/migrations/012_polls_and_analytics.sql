-- polls
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  poll_type TEXT NOT NULL DEFAULT 'mcq',
  target_type TEXT NOT NULL DEFAULT 'all',
  target_value TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- poll responses (one per employee per poll)
CREATE TABLE IF NOT EXISTS poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES auth.users(id),
  selected_option INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, employee_id)
);

-- AI search query logs (for analytics)
CREATE TABLE IF NOT EXISTS search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  query TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Document access logs (for analytics)
CREATE TABLE IF NOT EXISTS document_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;

-- Employees see active polls targeted at them or all employees
CREATE POLICY "employees_read_polls" ON polls
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND (
      target_type = 'all'
      OR (target_type = 'level' AND target_value = (SELECT role FROM employees WHERE id = auth.uid()))
    )
  );

-- Employees can vote once
CREATE POLICY "employees_vote" ON poll_responses
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- Any authenticated user can read responses (for aggregate result display)
CREATE POLICY "authenticated_read_responses" ON poll_responses
  FOR SELECT TO authenticated
  USING (true);

-- Employees can log their own searches
CREATE POLICY "employees_log_searches" ON search_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Employees can log document access
CREATE POLICY "employees_log_doc_access" ON document_access_logs
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());
