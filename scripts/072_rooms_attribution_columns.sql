-- Room attribution fields used by room creation/editing and status updates.
-- Safe to re-run. Run on staging first, then prod after deploy.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rooms.created_by IS
  'Staff user who created the room record.';

COMMENT ON COLUMN public.rooms.updated_by IS
  'Staff user who last edited the room or changed its status.';
