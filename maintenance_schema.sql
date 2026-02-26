-- Create site_management table for global configuration
create table if not exists public.site_management (
  id bigint primary key default 1,
  is_maintenance boolean default false,
  maintenance_message text default '서버 점검 중입니다.',
  maintenance_schedule text default '',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint single_row check (id = 1)
);

-- Insert initial row if not exists
insert into public.site_management (id, is_maintenance, maintenance_message, maintenance_schedule)
values (1, false, '서버 점검 중입니다.', '')
on conflict (id) do nothing;

-- Enable RLS
alter table public.site_management enable row level security;

-- Policies
drop policy if exists "Enable read access for everyone" on public.site_management;
create policy "Enable read access for everyone" on public.site_management for select using (true);

drop policy if exists "Enable update for admins only" on public.site_management;
-- Note: Assuming admins have a specific role or we allow all authenticated for now and filter in UI
-- For simplicity and parity with other tables in this project, enabling all for anon for now as per previous schema patterns
create policy "Enable all for anon on site_management" on public.site_management for all using (true) with check (true);

-- Enable Realtime
alter publication supabase_realtime add table site_management;
