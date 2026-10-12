-- Run this script in the Supabase SQL Editor.
create table if not exists public.student_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_name text not null check (char_length(trim(student_name)) between 1 and 100),
  roll_number text not null check (char_length(trim(roll_number)) between 1 and 30),
  title text not null check (char_length(trim(title)) between 1 and 180),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  category text not null check (category in ('Academic', 'Facilities', 'IT Support', 'Administration', 'Other')),
  priority text not null check (priority in ('Low', 'Medium', 'High')),
  status text not null default 'Open' check (status in ('Open', 'In Progress', 'Resolved')),
  created_at timestamptz not null default now()
);

create index if not exists student_queries_user_created_idx
  on public.student_queries (user_id, created_at desc);

alter table public.student_queries enable row level security;

-- Remove any older policy on this table so a permissive public policy cannot
-- be OR-combined with the owner-scoped policies below.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'student_queries'
  loop
    execute format('drop policy %I on public.student_queries', existing_policy.policyname);
  end loop;
end;
$$;

create policy "Users can read their own queries"
  on public.student_queries for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own queries"
  on public.student_queries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own queries"
  on public.student_queries for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own queries"
  on public.student_queries for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.student_queries to authenticated;

-- Seed a single set of sample records, assigned to the first signed-in user,
-- only when the table is globally empty. The transaction lock prevents
-- simultaneous first visits from inserting duplicate sample sets.
create or replace function public.seed_demo_queries_if_empty()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to seed demonstration records';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(7261821);

  if exists (select 1 from public.student_queries limit 1) then
    return 0;
  end if;

  insert into public.student_queries (
    user_id, student_name, roll_number, title, description, category, priority, status
  ) values
    ((select auth.uid()), 'Aarav Sharma', 'CS2024018', 'Unable to access the course portal', 'My account is locked out of the learning portal after resetting my password.', 'IT Support', 'High', 'In Progress'),
    ((select auth.uid()), 'Priya Patel', 'EC2023062', 'Request to review exam schedule', 'Two of my final examinations are currently scheduled at the same time.', 'Academic', 'High', 'Open'),
    ((select auth.uid()), 'Rohan Mehta', 'ME2022087', 'Repair needed in lab room 204', 'Several workstations in the mechanical lab are not powering on.', 'Facilities', 'Medium', 'Resolved'),
    ((select auth.uid()), 'Ananya Rao', 'BT2024024', 'Clarification on scholarship documents', 'Could you confirm whether a digital income certificate is acceptable?', 'Administration', 'Low', 'Open');

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.seed_demo_queries_if_empty() from public, anon;
grant execute on function public.seed_demo_queries_if_empty() to authenticated;
