-- Drop support_sessions table
--
-- Context: the "Suporte" feature (temporary admin user that impersonated a club
-- for a fixed TTL) has been retired. The super_admin now operates inside any
-- client's environment directly via the drilldown at /admin/organizations/[id]/*,
-- using the resolveTargetOrg() resolver with an explicit `forOrgId` parameter.
--
-- Drop semantics:
--   - CASCADE drops the RLS policy attached to the table (no FKs reference it).
--   - IF EXISTS keeps re-runs idempotent on environments where the table was
--     already manually removed.

DROP TABLE IF EXISTS public.support_sessions CASCADE;
