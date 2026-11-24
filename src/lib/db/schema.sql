-- =====================================================================
-- ReportFix schema (Supabase / Postgres).
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> New query -> paste this
-- whole file -> Run. Safe to run more than once (idempotent where practical).
--
-- SECURITY MODEL: every table has Row Level Security ENABLED and NO policies,
-- so the public anon key can read/write nothing. Only the server, using the
-- service_role key (which bypasses RLS), touches the database.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- users
create table if not exists users (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  role         text not null check (role in ('student','staff','admin')),
  department   text check (department in ('EE','CSE','IS','Library','Cafeteria','Labs')),
  trust_score  numeric(6,2) not null default 50,   -- cache; rebuildable from trust_events
  is_demo_seed boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint staff_has_department check (role <> 'staff' or department is not null)
);

-- ------------------------------------------------------------- issues
create table if not exists issues (
  id                  uuid primary key default gen_random_uuid(),
  canonical_location  text not null,
  category            text not null,
  signature           text not null,               -- short canonical English phrase of the problem
  department          text not null check (department in ('EE','CSE','IS','Library','Cafeteria','Labs')),
  priority            text not null default 'low' check (priority in ('critical','high','medium','low')),
  priority_score      numeric(8,2) not null default 0,
  priority_breakdown  jsonb not null default '{}'::jsonb,   -- explains how priority was computed
  status              text not null default 'open' check (status in ('open','in_progress','resolved','reopened','closed')),
  is_confidential     boolean not null default false,
  me_too_count        integer not null default 1 check (me_too_count >= 0),
  one_line_reason     text,
  resolution_round    integer not null default 0,  -- bumps each time staff marks it resolved
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz
);
create index if not exists issues_dept_status_idx on issues (department, status) where not is_confidential;
create index if not exists issues_location_sig_idx on issues (canonical_location, signature);
create index if not exists issues_confidential_idx on issues (is_confidential);

-- ------------------------------------------------------------ reports
create table if not exists reports (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  issue_id           uuid references issues(id) on delete set null,
  raw_text           text not null,
  language           text,
  canonical_location text,                         -- null until resolved against the gazetteer
  extracted          jsonb not null default '{}'::jsonb,  -- validated AI/fallback output
  flags              jsonb not null default '{}'::jsonb,  -- safety / injection / harassment flags
  ai_mode            text check (ai_mode in ('gemini','fallback')),
  is_confidential    boolean not null default false,
  status             text not null default 'received'
                     check (status in ('received','needs_clarification','routed','grouped','rejected')),
  clarification_note text,
  created_at         timestamptz not null default now()
);
create index if not exists reports_user_idx on reports (user_id);
create index if not exists reports_issue_idx on reports (issue_id);
create index if not exists reports_status_idx on reports (status);

-- ------------------------------------------------------ issue_members
create table if not exists issue_members (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references issues(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  report_id  uuid references reports(id) on delete set null,
  role       text not null check (role in ('reporter','joined')),
  joined_at  timestamptz not null default now(),
  unique (issue_id, user_id)
);
create index if not exists issue_members_user_idx on issue_members (user_id);

-- ------------------------------------------------------- issue_updates
create table if not exists issue_updates (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references issues(id) on delete cascade,
  actor_id    uuid references users(id) on delete set null,
  from_status text,
  to_status   text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists issue_updates_issue_idx on issue_updates (issue_id, created_at);

-- ---------------------------------------------------- resolution_votes
create table if not exists resolution_votes (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references issues(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  round      integer not null,                     -- = issues.resolution_round at vote time
  vote       text not null check (vote in ('confirm','dispute')),
  weight     numeric(6,3) not null default 1 check (weight >= 0),
  created_at timestamptz not null default now(),
  unique (issue_id, user_id, round)                -- one vote per user per issue per round
);
create index if not exists resolution_votes_issue_idx on resolution_votes (issue_id, round);

-- --------------------------------------------------------- trust_events
-- Append-only ledger. users.trust_score must always equal 50 + sum(delta) (clamped 0..100).
create table if not exists trust_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  delta              numeric(6,2) not null,
  reason             text not null,
  related_report_id  uuid references reports(id) on delete set null,
  related_issue_id   uuid references issues(id) on delete set null,
  related_vote_id    uuid references resolution_votes(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists trust_events_user_idx on trust_events (user_id, created_at);

-- ------------------------------------------------------------ audit_log
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at);

-- ---------------------------------------------------------------- RLS
-- Enabled on EVERY table, with deliberately NO policies => anon/authenticated see nothing.
alter table users            enable row level security;
alter table issues           enable row level security;
alter table reports          enable row level security;
alter table issue_members    enable row level security;
alter table issue_updates    enable row level security;
alter table resolution_votes enable row level security;
alter table trust_events     enable row level security;
alter table audit_log        enable row level security;

revoke all on users, issues, reports, issue_members, issue_updates,
              resolution_votes, trust_events, audit_log from anon, authenticated;

-- ------------------------------------------------- trust rebuild (explainability)
-- Base trust is 50. Score = 50 + sum of ledger deltas, clamped to 0..100.
create or replace view user_trust_rebuilt as
  select u.id as user_id,
         greatest(0, least(100, 50 + coalesce(sum(e.delta), 0))) as rebuilt_score,
         u.trust_score as cached_score
  from users u
  left join trust_events e on e.user_id = u.id
  group by u.id, u.trust_score;

revoke all on user_trust_rebuilt from anon, authenticated;

create or replace function rebuild_trust_scores() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update users u
     set trust_score = v.rebuilt_score
    from user_trust_rebuilt v
   where v.user_id = u.id and u.trust_score is distinct from v.rebuilt_score;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------- SCHEMA RELAXATIONS (phase 2)
-- Confidential issues have no department, and places with no owning department (Main Gate, Parking) go to the
-- admin queue (decision D28), so department / canonical_location must be nullable. CHECKs still apply to non-null values.
alter table issues alter column department drop not null;
alter table issues alter column canonical_location drop not null;

-- Old stubs replaced by the functions below.
drop function if exists create_report_with_issue(uuid,text,jsonb,jsonb,text,text,text,jsonb,boolean,text);
drop function if exists join_issue_with_report(uuid,uuid,text,jsonb,jsonb);

-- ---------------------------------------------------------- ISSUE RPCs
-- Multi-table writes are atomic: they run inside one function (= one transaction) and are called via supabase.rpc().

-- A routed report creates a NEW issue: issue + reporter membership + history row + report link, atomically.
create or replace function attach_report_new_issue(p_report_id uuid, p_issue jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_report reports%rowtype;
  v_issue_id uuid;
begin
  select * into v_report from reports where id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if v_report.issue_id is not null then raise exception 'report_already_attached'; end if;

  insert into issues (canonical_location, category, signature, department, priority, priority_score,
                      priority_breakdown, status, is_confidential, me_too_count, one_line_reason)
  values (nullif(p_issue->>'canonical_location', ''), p_issue->>'category', p_issue->>'signature',
          nullif(p_issue->>'department', ''), p_issue->>'priority',
          coalesce((p_issue->>'priority_score')::numeric, 0),
          coalesce(p_issue->'priority_breakdown', '{}'::jsonb), 'open',
          coalesce((p_issue->>'is_confidential')::boolean, false), 1, p_issue->>'one_line_reason')
  returning id into v_issue_id;

  insert into issue_members (issue_id, user_id, report_id, role)
  values (v_issue_id, v_report.user_id, v_report.id, 'reporter');

  update reports
     set issue_id = v_issue_id, status = 'routed',
         canonical_location = coalesce(nullif(p_issue->>'canonical_location', ''), canonical_location)
   where id = p_report_id;

  insert into issue_updates (issue_id, actor_id, from_status, to_status, note)
  values (v_issue_id, null, null, 'open', 'Issue created from a report.');

  insert into audit_log (actor_id, action, entity_type, entity_id, details)
  values (null, 'issue_created', 'issue', v_issue_id, jsonb_build_object('report_id', p_report_id));

  return v_issue_id;
end $$;

-- A report that matches an existing issue JOINS it ("me too"). One student counts once per issue.
create or replace function attach_report_to_issue(
  p_report_id uuid, p_issue_id uuid, p_priority text, p_priority_score numeric, p_priority_breakdown jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_report reports%rowtype;
  v_issue issues%rowtype;
  v_inserted integer;
  v_count integer;
begin
  select * into v_report from reports where id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  select * into v_issue from issues where id = p_issue_id for update;
  if not found then raise exception 'issue_not_found'; end if;
  if v_report.issue_id is not null then raise exception 'report_already_attached'; end if;
  if v_issue.is_confidential then raise exception 'confidential_issue_cannot_be_joined'; end if;
  if v_issue.status = 'closed' then raise exception 'issue_closed'; end if;

  insert into issue_members (issue_id, user_id, report_id, role)
  values (p_issue_id, v_report.user_id, p_report_id, 'joined')
  on conflict (issue_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  select count(*) into v_count from issue_members where issue_id = p_issue_id;

  update issues
     set me_too_count = v_count, priority = p_priority, priority_score = p_priority_score,
         priority_breakdown = p_priority_breakdown, updated_at = now()
   where id = p_issue_id;

  update reports set issue_id = p_issue_id, status = 'grouped', canonical_location = v_issue.canonical_location
   where id = p_report_id;

  if v_inserted > 0 then
    insert into issue_updates (issue_id, actor_id, from_status, to_status, note)
    values (p_issue_id, null, v_issue.status, v_issue.status,
            'Another student reported the same problem (' || v_count || ' affected).');
  end if;

  return jsonb_build_object('joined', v_inserted > 0, 'me_too_count', v_count);
end $$;

-- (update_issue_status is defined in the PHASES 5-6 block below, together with the trust and voting functions.)

-- ================================================================ PHASES 5-6 + SPEED
-- Columns used by voting, flagging, trust and "needs attention". All idempotent.
alter table issue_members add column if not exists excluded boolean not null default false;   -- flagged members no longer count
alter table reports add column if not exists flagged_kind text check (flagged_kind in ('spam','fake','abuse'));
alter table reports add column if not exists flagged_by uuid references users(id) on delete set null;
alter table reports add column if not exists flagged_at timestamptz;
alter table reports add column if not exists flag_note text;
alter table reports add column if not exists attention text;                                  -- set when issue creation failed
create index if not exists reports_attention_idx on reports (attention) where attention is not null;
alter table trust_events add column if not exists kind text;                                  -- machine key, used for "once only"
alter table trust_events add column if not exists related_round integer;
create unique index if not exists trust_events_once_idx on trust_events (
  user_id, kind,
  coalesce(related_issue_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(related_report_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(related_round, 0)
) where kind is not null;

-- ---- voting window + the frozen "pool" of each resolution round (fixes pass 2)
alter table issues add column if not exists vote_deadline timestamptz;   -- when the current round's voting window ends
-- Who may vote in a round and with what weight, frozen when staff mark the issue resolved. Students who join afterwards
-- are not in the pool, so they cannot vote (or swing the vote) in that round.
create table if not exists resolution_pool (
  issue_id uuid not null references issues(id) on delete cascade,
  round    integer not null,
  user_id  uuid not null references users(id) on delete cascade,
  weight   numeric(6,3) not null check (weight >= 0),
  primary key (issue_id, round, user_id)
);
alter table resolution_pool enable row level security;
revoke all on resolution_pool from anon, authenticated;

drop function if exists apply_trust_event(uuid,numeric,text,uuid,uuid,uuid);
drop function if exists cast_resolution_vote(uuid,uuid,text,numeric);
drop function if exists cast_resolution_vote(uuid,uuid,text,numeric,jsonb);
drop function if exists update_issue_status(uuid,uuid,text,text,text);
drop function if exists update_issue_status(uuid,uuid,text,text,text,numeric,text);

-- ONE trust change = one ledger row + the cached score, atomically. Returns the new score, or NULL when this exact
-- event (same user, kind, issue, report, round) was already recorded. Score = 50 + sum(deltas), clamped 0..100.
create or replace function apply_trust_event(
  p_user_id uuid, p_delta numeric, p_reason text, p_kind text,
  p_report_id uuid default null, p_issue_id uuid default null, p_vote_id uuid default null, p_round integer default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_ins integer;
  v_score numeric;
begin
  insert into trust_events (user_id, delta, reason, kind, related_report_id, related_issue_id, related_vote_id, related_round)
  values (p_user_id, p_delta, p_reason, p_kind, p_report_id, p_issue_id, p_vote_id, p_round)
  on conflict do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then return null; end if;
  update users
     set trust_score = greatest(0, least(100, 50 + coalesce((select sum(e.delta) from trust_events e where e.user_id = p_user_id), 0)))
   where id = p_user_id
  returning trust_score into v_score;
  return v_score;
end $$;

-- Status change by staff/admin with a history row. Compare-and-set on the previous status.
-- The FIRST time the owning staff/admin take an open issue (open -> in_progress/resolved) every counted member gets the
-- "report validated" trust event (once per member per issue; never for confidential issues).
create or replace function update_issue_status(
  p_issue_id uuid, p_actor uuid, p_from text, p_to text, p_note text,
  p_validate_delta numeric default 0, p_validate_reason text default '',
  p_pool jsonb default null, p_window_seconds integer default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_issue issues%rowtype;
  v_deadline timestamptz;
  r record;
begin
  select * into v_issue from issues where id = p_issue_id for update;
  if not found then raise exception 'issue_not_found'; end if;
  if v_issue.status <> p_from then raise exception 'stale_status'; end if;

  if p_to = 'resolved' then
    v_deadline := now() + make_interval(secs => greatest(p_window_seconds, 0));
  end if;

  update issues
     set status = p_to, updated_at = now(),
         resolved_at = case when p_to = 'resolved' then now() else resolved_at end,
         resolution_round = case when p_to = 'resolved' then resolution_round + 1 else resolution_round end,
         vote_deadline = case when p_to = 'resolved' then v_deadline else vote_deadline end
   where id = p_issue_id;

  -- freeze who may vote in this round (the affected students right now) and their weights
  if p_to = 'resolved' and not v_issue.is_confidential then
    insert into resolution_pool (issue_id, round, user_id, weight)
    select p_issue_id, v_issue.resolution_round + 1, (e->>'user_id')::uuid, greatest(0, (e->>'weight')::numeric)
      from jsonb_array_elements(coalesce(p_pool, '[]'::jsonb)) e
     where exists (select 1 from issue_members m where m.issue_id = p_issue_id and m.user_id = (e->>'user_id')::uuid and not m.excluded)
    on conflict do nothing;
  end if;

  insert into issue_updates (issue_id, actor_id, from_status, to_status, note)
  values (p_issue_id, p_actor, p_from, p_to, nullif(trim(coalesce(p_note, '')), ''));

  insert into audit_log (actor_id, action, entity_type, entity_id, details)
  values (p_actor, 'issue_status_changed', 'issue', p_issue_id, jsonb_build_object('from', p_from, 'to', p_to));

  if p_from = 'open' and p_to in ('in_progress', 'resolved') and not v_issue.is_confidential and p_validate_delta <> 0 then
    for r in select m.user_id, m.report_id from issue_members m where m.issue_id = p_issue_id and not m.excluded loop
      perform apply_trust_event(r.user_id, p_validate_delta, p_validate_reason, 'report_validated', r.report_id, p_issue_id, null, 0);
    end loop;
  end if;

  return jsonb_build_object('status', p_to, 'resolution_round',
         (select i.resolution_round from issues i where i.id = p_issue_id), 'vote_deadline', v_deadline);
end $$;

-- A student who is affected (reporter or joiner) confirms or disputes the fix. One vote per round (unique key).
-- The reopen rule and the trust events for matching votes happen in the same transaction.
-- p_cfg = {"share":0.5,"min_disputers":2,"min_disputers_single":1,"match_delta":1,"match_reason_confirm":"...","match_reason_dispute":"..."}
create or replace function cast_resolution_vote(
  p_issue_id uuid, p_user_id uuid, p_vote text, p_cfg jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_issue issues%rowtype;
  v_vote_id uuid;
  v_weight numeric;
  v_members integer; v_pool_w numeric;
  v_cn integer; v_dn integer; v_cw numeric; v_dw numeric;
  v_share numeric := coalesce((p_cfg->>'share')::numeric, 0.5);
  v_min integer := coalesce((p_cfg->>'min_disputers')::integer, 2);
  v_min_single integer := coalesce((p_cfg->>'min_disputers_single')::integer, 1);
  v_min_w numeric := coalesce((p_cfg->>'min_dispute_weight')::numeric, 1.2);
  v_early numeric := coalesce((p_cfg->>'early_share')::numeric, 0.5);
  v_cmin integer := coalesce((p_cfg->>'min_confirmers')::integer, 2);
  v_cmin_single integer := coalesce((p_cfg->>'min_confirmers_single')::integer, 1);
  v_delta numeric := coalesce((p_cfg->>'match_delta')::numeric, 1);
  v_need integer; v_cneed integer;
  v_outcome text := 'pending';
  v_close_reason text;
  v_status text;
  r record;
begin
  if p_vote not in ('confirm', 'dispute') then raise exception 'bad_vote'; end if;
  select * into v_issue from issues where id = p_issue_id for update;
  if not found or v_issue.is_confidential then raise exception 'issue_not_found'; end if;
  if not exists (select 1 from issue_members m where m.issue_id = p_issue_id and m.user_id = p_user_id and not m.excluded) then
    raise exception 'not_affected';
  end if;
  if v_issue.status <> 'resolved' then raise exception 'voting_closed'; end if;
  if v_issue.vote_deadline is not null and now() >= v_issue.vote_deadline then raise exception 'window_ended'; end if;

  -- only students who were affected when the fix was reported are in this round's pool (their weight is frozen there)
  select p.weight into v_weight from resolution_pool p where p.issue_id = p_issue_id and p.round = v_issue.resolution_round and p.user_id = p_user_id;
  if not found then raise exception 'joined_late'; end if;

  insert into resolution_votes (issue_id, user_id, round, vote, weight)
  values (p_issue_id, p_user_id, v_issue.resolution_round, p_vote, v_weight)
  on conflict (issue_id, user_id, round) do nothing
  returning id into v_vote_id;
  if v_vote_id is null then raise exception 'already_voted'; end if;

  select count(*), coalesce(sum(p.weight), 0) into v_members, v_pool_w
    from resolution_pool p join issue_members m on m.issue_id = p.issue_id and m.user_id = p.user_id and not m.excluded
   where p.issue_id = p_issue_id and p.round = v_issue.resolution_round;
  select count(*) filter (where v.vote = 'confirm'), count(*) filter (where v.vote = 'dispute'),
         coalesce(sum(v.weight) filter (where v.vote = 'confirm'), 0), coalesce(sum(v.weight) filter (where v.vote = 'dispute'), 0)
    into v_cn, v_dn, v_cw, v_dw
    from resolution_votes v
   where v.issue_id = p_issue_id and v.round = v_issue.resolution_round
     and exists (select 1 from resolution_pool p join issue_members m on m.issue_id = p.issue_id and m.user_id = p.user_id and not m.excluded
                  where p.issue_id = v.issue_id and p.round = v.round and p.user_id = v.user_id);

  v_need := case when v_members <= 1 then v_min_single else v_min end;
  v_cneed := case when v_members <= 1 then v_cmin_single else v_cmin end;
  if v_dn >= v_need and v_dw + 1e-9 >= v_share * (v_cw + v_dw) and v_dw + 1e-9 >= least(v_min_w, v_pool_w) then
    v_outcome := 'reopened';
  elsif v_cn >= v_cneed and v_cw > v_early * v_pool_w + 1e-9 then
    v_outcome := 'closed'; v_close_reason := 'early_majority';
  elsif v_cn + v_dn >= v_members then
    v_outcome := 'closed'; v_close_reason := 'all_voted';
  end if;

  if v_outcome = 'reopened' then
    update issues set status = 'reopened', updated_at = now() where id = p_issue_id;
    insert into issue_updates (issue_id, actor_id, from_status, to_status, note)
    values (p_issue_id, null, 'resolved', 'reopened',
            'Reopened: ' || v_dn || ' of ' || v_members || ' affected students disputed the fix.');
    insert into audit_log (actor_id, action, entity_type, entity_id, details)
    values (null, 'issue_reopened', 'issue', p_issue_id, jsonb_build_object('round', v_issue.resolution_round));
    for r in select v.id, v.user_id from resolution_votes v where v.issue_id = p_issue_id and v.round = v_issue.resolution_round and v.vote = 'dispute' loop
      perform apply_trust_event(r.user_id, v_delta, coalesce(p_cfg->>'match_reason_dispute', 'Your vote matched the final outcome.'), 'vote_matched', null, p_issue_id, r.id, v_issue.resolution_round);
    end loop;
  elsif v_outcome = 'closed' then
    update issues set status = 'closed', updated_at = now() where id = p_issue_id;
    insert into issue_updates (issue_id, actor_id, from_status, to_status, note)
    values (p_issue_id, null, 'resolved', 'closed',
            case when v_close_reason = 'early_majority'
                 then 'Closed early: enough affected students confirmed the fix (a weighted majority).'
                 else 'Closed: every affected student voted and the fix was not disputed enough to reopen.' end);
    insert into audit_log (actor_id, action, entity_type, entity_id, details)
    values (null, 'issue_closed', 'issue', p_issue_id, jsonb_build_object('round', v_issue.resolution_round, 'reason', v_close_reason));
    for r in select v.id, v.user_id from resolution_votes v where v.issue_id = p_issue_id and v.round = v_issue.resolution_round and v.vote = 'confirm' loop
      perform apply_trust_event(r.user_id, v_delta, coalesce(p_cfg->>'match_reason_confirm', 'Your vote matched the final outcome.'), 'vote_matched', null, p_issue_id, r.id, v_issue.resolution_round);
    end loop;
  end if;

  select i.status into v_status from issues i where i.id = p_issue_id;
  return jsonb_build_object('outcome', v_outcome, 'status', v_status, 'confirm_n', v_cn, 'dispute_n', v_dn,
                            'confirm_w', v_cw, 'dispute_w', v_dw, 'members', v_members, 'pool_weight', v_pool_w,
                            'round', v_issue.resolution_round, 'close_reason', v_close_reason);
end $$;

-- Lazy auto-close: a resolved issue whose voting window has ended (and that was not reopened) closes by itself. Called by the
-- app whenever an issue is read or a vote is cast, so no background job is needed. p_issue_id null = settle every due issue.
create or replace function settle_resolution(p_issue_id uuid, p_cfg jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_delta numeric := coalesce((p_cfg->>'match_delta')::numeric, 1);
  n integer := 0;
  i record;
  r record;
begin
  for i in
    select id, resolution_round from issues
     where status = 'resolved' and not is_confidential and vote_deadline is not null and vote_deadline <= now()
       and (p_issue_id is null or id = p_issue_id)
     for update skip locked
  loop
    update issues set status = 'closed', updated_at = now() where id = i.id;
    insert into issue_updates (issue_id, actor_id, from_status, to_status, note)
    values (i.id, null, 'resolved', 'closed', 'Closed automatically: the voting window ended and the fix was not disputed enough to reopen.');
    insert into audit_log (actor_id, action, entity_type, entity_id, details)
    values (null, 'issue_auto_closed', 'issue', i.id, jsonb_build_object('round', i.resolution_round));
    for r in select v.id, v.user_id from resolution_votes v where v.issue_id = i.id and v.round = i.resolution_round and v.vote = 'confirm' loop
      perform apply_trust_event(r.user_id, v_delta, coalesce(p_cfg->>'match_reason_confirm', 'Your vote matched the final outcome.'), 'vote_matched', null, i.id, r.id, i.resolution_round);
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Staff of the owning department / admin flag a report as spam, fake or abuse. The author's trust drops (ledger row),
-- the report stops counting toward the issue. Confidential reports cannot be flagged (that would need the author's identity).
create or replace function flag_report(
  p_report_id uuid, p_actor uuid, p_kind text, p_note text, p_delta numeric, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_report reports%rowtype;
  v_issue issues%rowtype;
  v_count integer := 0;
  v_closed boolean := false;
begin
  if p_kind not in ('spam', 'fake', 'abuse') then raise exception 'bad_kind'; end if;
  select * into v_report from reports where id = p_report_id for update;
  if not found or v_report.is_confidential then raise exception 'report_not_found'; end if;
  if v_report.flagged_kind is not null then raise exception 'already_flagged'; end if;

  update reports
     set flagged_kind = p_kind, flagged_by = p_actor, flagged_at = now(), flag_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_report_id;
  perform apply_trust_event(v_report.user_id, p_delta, p_reason, 'report_flagged_' || p_kind, p_report_id, v_report.issue_id, null, null);

  if v_report.issue_id is not null then
    select * into v_issue from issues where id = v_report.issue_id for update;
    update issue_members m set excluded = true
     where m.issue_id = v_report.issue_id and m.user_id = v_report.user_id
       and not exists (select 1 from reports r where r.issue_id = v_report.issue_id and r.user_id = v_report.user_id and r.flagged_kind is null);
    select count(*) into v_count from issue_members m where m.issue_id = v_report.issue_id and not m.excluded;
    update issues set me_too_count = v_count, updated_at = now() where id = v_report.issue_id;
    insert into issue_updates (issue_id, actor_id, from_status, to_status, note)
    values (v_report.issue_id, p_actor, v_issue.status, v_issue.status,
            'A report was flagged as ' || p_kind || ' and no longer counts (' || v_count || ' affected).');
    if v_count = 0 and v_issue.status <> 'closed' then
      update issues set status = 'closed', updated_at = now() where id = v_report.issue_id;
      insert into issue_updates (issue_id, actor_id, from_status, to_status, note)
      values (v_report.issue_id, p_actor, v_issue.status, 'closed', 'Closed: every report on this issue was flagged.');
      v_closed := true;
    end if;
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, details)
  values (p_actor, 'report_flagged', 'report', p_report_id, jsonb_build_object('kind', p_kind));
  return jsonb_build_object('issue_id', v_report.issue_id, 'me_too_count', v_count, 'closed', v_closed);
end $$;

-- ---------------------------------------------------------- READ RPCs (one round trip each)
-- Trust inputs for the weight rule, for the counted members of one issue / for given users.
create or replace function member_trust_profiles(p_issue_id uuid)
returns table (user_id uuid, trust_score numeric, created_at timestamptz, ledger_events bigint)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.trust_score, u.created_at, (select count(*) from trust_events e where e.user_id = u.id)
    from issue_members m join users u on u.id = m.user_id
   where m.issue_id = p_issue_id and not m.excluded
$$;

create or replace function user_trust_profiles(p_user_ids uuid[])
returns table (user_id uuid, trust_score numeric, created_at timestamptz, ledger_events bigint)
language sql stable security definer set search_path = public as $$
  select u.id, u.trust_score, u.created_at, (select count(*) from trust_events e where e.user_id = u.id)
    from users u where u.id = any(p_user_ids)
$$;

-- Everything the issue page needs, in one call. Reports of a CONFIDENTIAL issue are returned only when
-- p_include_reports is true (the service sets it for the admin / the reporter only); they carry no user ids.
create or replace function issue_bundle(p_issue_id uuid, p_user_id uuid, p_include_reports boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_issue issues%rowtype;
begin
  select * into v_issue from issues where id = p_issue_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'issue', to_jsonb(v_issue),
    'my_role', (select m.role from issue_members m where m.issue_id = p_issue_id and m.user_id = p_user_id),
    'my_excluded', coalesce((select m.excluded from issue_members m where m.issue_id = p_issue_id and m.user_id = p_user_id), false),
    'members', (select count(*) from issue_members m where m.issue_id = p_issue_id and not m.excluded),
    'pool', (select jsonb_build_object(
                'members', count(*),
                'weight', coalesce(sum(p.weight), 0),
                'mine', coalesce(bool_or(p.user_id = p_user_id), false))
               from resolution_pool p join issue_members m on m.issue_id = p.issue_id and m.user_id = p.user_id and not m.excluded
              where p.issue_id = p_issue_id and p.round = v_issue.resolution_round and not v_issue.is_confidential),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'from', x.from_status, 'to', x.to_status, 'note', x.note, 'at', x.created_at,
                                          'actor_role', u.role, 'actor_department', u.department) order by x.created_at)
        from issue_updates x left join users u on u.id = x.actor_id and u.role <> 'student'
       where x.issue_id = p_issue_id), '[]'::jsonb),
    'reports', case when v_issue.is_confidential and not p_include_reports then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'text', r.raw_text, 'language', r.language, 'at', r.created_at, 'flagged', r.flagged_kind) order by r.created_at)
        from reports r where r.issue_id = p_issue_id), '[]'::jsonb) end,
    'votes', (select jsonb_build_object(
                'round', v_issue.resolution_round,
                'confirm_n', count(*) filter (where v.vote = 'confirm'),
                'dispute_n', count(*) filter (where v.vote = 'dispute'),
                'confirm_w', coalesce(sum(v.weight) filter (where v.vote = 'confirm'), 0),
                'dispute_w', coalesce(sum(v.weight) filter (where v.vote = 'dispute'), 0),
                'my_vote', max(v.vote) filter (where v.user_id = p_user_id))
                from resolution_votes v
               where v.issue_id = p_issue_id and v.round = v_issue.resolution_round and not v_issue.is_confidential)
  );
end $$;

-- A student's dashboard list: issues + my role + my vote in the current round, in one call.
create or replace function student_issues(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'issue', to_jsonb(i), 'role', m.role, 'excluded', m.excluded,
           'in_pool', exists (select 1 from resolution_pool p where p.issue_id = i.id and p.round = i.resolution_round and p.user_id = p_user_id),
           'my_vote', (select v.vote from resolution_votes v where v.issue_id = i.id and v.user_id = p_user_id and v.round = i.resolution_round))), '[]'::jsonb)
    from issue_members m join issues i on i.id = m.issue_id
   where m.user_id = p_user_id
$$;

-- ------------------------------------------------------ reset_all_data
-- WORKING. Wipes every table (FK-safe: one TRUNCATE ... CASCADE).
-- The app then reseeds demo users (npm run db:reset, or the Reset button).
create or replace function reset_all_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  truncate table audit_log, trust_events, resolution_votes, resolution_pool, issue_updates,
                 issue_members, reports, issues, users
  restart identity cascade;
end $$;

-- Only the server (service_role) may call these.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function reset_all_data() to service_role;
grant execute on function rebuild_trust_scores() to service_role;
grant execute on function attach_report_new_issue(uuid,jsonb) to service_role;
grant execute on function attach_report_to_issue(uuid,uuid,text,numeric,jsonb) to service_role;
grant execute on function apply_trust_event(uuid,numeric,text,text,uuid,uuid,uuid,integer) to service_role;
grant execute on function update_issue_status(uuid,uuid,text,text,text,numeric,text,jsonb,integer) to service_role;
grant execute on function settle_resolution(uuid,jsonb) to service_role;
grant execute on function cast_resolution_vote(uuid,uuid,text,jsonb) to service_role;
grant execute on function flag_report(uuid,uuid,text,text,numeric,text) to service_role;
grant execute on function member_trust_profiles(uuid) to service_role;
grant execute on function user_trust_profiles(uuid[]) to service_role;
grant execute on function issue_bundle(uuid,uuid,boolean) to service_role;
grant execute on function student_issues(uuid) to service_role;
