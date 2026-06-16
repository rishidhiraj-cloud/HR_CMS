-- Enable realtime for polls table so widget receives instant notifications
-- (safe to run even if publication already includes all tables)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE polls;
EXCEPTION WHEN OTHERS THEN
  -- Publication may already include this table or be FOR ALL TABLES — ignore
  NULL;
END;
$$;
