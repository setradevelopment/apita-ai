-- Migration 011: Contact email and per-user permissions

-- Add contact_email to profiles (editable by admin/support, separate from login email)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email text;

-- Add permissions JSONB to profiles (fine-grained per-user permissions)
-- Keys: reset_member_password, reset_coordinator_password, create_members,
--       delete_members, inactivate_members
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}';

-- Add active flag to members (for "inativar" feature)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
