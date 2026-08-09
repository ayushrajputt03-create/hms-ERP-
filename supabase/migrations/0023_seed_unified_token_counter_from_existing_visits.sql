-- Seed the unified daily token counter from the visits already on the books.
--
-- Without this, the first registration after 0022 restarts the day's series at
-- 1. Today's data already has a qr_self visit holding token 1 (issued from the
-- retired qrToken series), so the very next patient at the counter would be
-- handed a second token 1 — the exact defect 0022 exists to remove, reproduced
-- on the day of deployment.
--
-- For every facility/day that has visits, the counter is set to the highest
-- token issued that day by EITHER old series, so numbering resumes above
-- everything already printed. greatest() against the existing value means this
-- can never move a counter backwards and is safe to re-run.
--
-- Historical duplicates are deliberately left alone. Two ORTHO visits on
-- 2026-08-09 both hold token 1; renumbering one of them now would contradict a
-- slip a patient was already given and a queue that has already been called.
-- The register is a record of what happened, including when it was wrong.

with per_day as (
  select
    d.facility_id,
    (to_timestamp(coalesce(nullif(d.data ->> 'visitDate', ''), '0')::bigint / 1000.0)
       at time zone 'Asia/Kolkata')::date              as local_date,
    max(coalesce(nullif(d.data ->> 'tokenNumber', ''), '0')::bigint) as max_token
  from public.documents d
  where d.collection like 'facilities/%/opdVisits'
    and coalesce(nullif(d.data ->> 'tokenNumber', ''), '0')::bigint > 0
  group by 1, 2
)
insert into public.documents (path, collection, facility_id, data)
select
  'facilities/' || p.facility_id || '/counters/opdToken-' || to_char(p.local_date, 'YYYY-MM-DD'),
  'facilities/' || p.facility_id || '/counters',
  p.facility_id,
  jsonb_build_object('value', p.max_token)
from per_day p
on conflict (path) do update
  set data = documents.data
             || jsonb_build_object('value', greatest(
                  coalesce((documents.data ->> 'value')::bigint, 0),
                  (excluded.data ->> 'value')::bigint)),
      updated_at = now();

-- The retired per-doctor QR series. Left in the table rather than deleted:
-- these rows are the audit trail for how the duplicated tokens came to be
-- issued, and nothing reads them any more.
