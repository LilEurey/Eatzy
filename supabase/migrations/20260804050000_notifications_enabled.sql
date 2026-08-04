-- Migration: notifications_enabled
-- A per-user on/off preference for notifications, surfaced as a real toggle
-- on the profile page (Figma: "Nottification" row + Toggle - Switch
-- component). Same shape as the existing users.language column — a simple
-- preference flag, not a new notifications delivery system.

alter table public.users
  add column notifications_enabled boolean not null default true;
