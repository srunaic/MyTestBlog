-- [Migration] Add status column to channel members for Invitation System
-- Default is 'joined' to maintain backward compatibility for existing members.

alter table public.anticode_channel_members 
add column if not exists status text default 'joined';

-- Update RLS to allow users to update their own status (Accept Invite)
-- And allow owners to insert with status='invited' (Send Invite)

-- Ensure policy exists for update
drop policy if exists "Users can update their own membership status" on public.anticode_channel_members;
create policy "Users can update their own membership status"
on public.anticode_channel_members for update
using ( auth.uid()::text = (select id::text from anticode_users where username = anticode_channel_members.username) )
with check ( auth.uid()::text = (select id::text from anticode_users where username = anticode_channel_members.username) );

-- Allow viewing own invites
drop policy if exists "Users can view their own memberships" on public.anticode_channel_members;
create policy "Users can view their own memberships"
on public.anticode_channel_members for select
using ( username = (select username from anticode_users where id::text = auth.uid()::text) );
