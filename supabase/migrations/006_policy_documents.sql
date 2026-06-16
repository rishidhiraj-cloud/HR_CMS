-- Enable pgvector extension
create extension if not exists vector;

-- Policy documents uploaded by HR
create table policy_documents (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  file_type text not null check (file_type in ('pdf', 'docx', 'txt')),
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  chunk_count integer not null default 0,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null
);

-- Text chunks with vector embeddings (voyage-3-lite = 512 dimensions)
create table document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid not null references policy_documents(id) on delete cascade,
  chunk_text text not null,
  chunk_index integer not null
);

-- Add embedding column separately (some Supabase versions need this)
alter table document_chunks add column embedding vector(512);

-- HNSW index for fast cosine similarity search
create index document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RLS
alter table policy_documents enable row level security;
alter table document_chunks enable row level security;

-- HR can manage all documents
create policy "hr_users can manage policy_documents" on policy_documents
  for all using (exists (select 1 from hr_users where id = auth.uid()));

-- Employees can view ready documents
create policy "employees can view policy_documents" on policy_documents
  for select using (
    status = 'ready'
    and exists (select 1 from employees where id = auth.uid())
  );

-- HR can manage all chunks
create policy "hr_users can manage document_chunks" on document_chunks
  for all using (exists (select 1 from hr_users where id = auth.uid()));

-- Employees can view chunks
create policy "employees can view document_chunks" on document_chunks
  for select using (exists (select 1 from employees where id = auth.uid()));

-- Vector similarity search function (SECURITY DEFINER bypasses RLS — called from service-role API)
create or replace function match_document_chunks(
  query_embedding vector(512),
  match_count integer default 5
)
returns table (
  id uuid,
  document_id uuid,
  chunk_text text,
  document_name text,
  similarity float
)
language sql stable security definer
as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_text,
    pd.name as document_name,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  join policy_documents pd on dc.document_id = pd.id
  where pd.status = 'ready'
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
