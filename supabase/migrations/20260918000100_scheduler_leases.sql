-- Global background-worker locks are only accessible to trusted server code.
create table if not exists public.scheduler_leases (
  lease_key text primary key,
  owner_token uuid not null,
  expires_at timestamptz not null
);
alter table public.scheduler_leases enable row level security;
revoke all on public.scheduler_leases from public, anon, authenticated;
grant select, insert, update, delete on public.scheduler_leases to service_role;

create or replace function public.acquire_scheduler_lease(p_key text, p_owner uuid, p_seconds integer default 21600)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare acquired boolean;
begin
  if p_key is null or length(p_key) > 100 or p_owner is null or p_seconds is null or p_seconds < 60 or p_seconds > 86400 then
    raise exception 'Invalid scheduler lease parameters';
  end if;
  insert into public.scheduler_leases (lease_key, owner_token, expires_at)
  values (p_key, p_owner, clock_timestamp() + make_interval(secs => p_seconds))
  on conflict (lease_key) do update
    set owner_token = excluded.owner_token, expires_at = excluded.expires_at
    where scheduler_leases.expires_at <= clock_timestamp()
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

create or replace function public.renew_scheduler_lease(p_key text, p_owner uuid, p_seconds integer default 21600)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare renewed boolean;
begin
  if p_seconds is null or p_seconds < 60 or p_seconds > 86400 then
    raise exception 'Invalid scheduler lease duration';
  end if;
  update public.scheduler_leases set expires_at = clock_timestamp() + make_interval(secs => p_seconds)
  where lease_key = p_key and owner_token = p_owner and expires_at > clock_timestamp()
  returning true into renewed;
  return coalesce(renewed, false);
end;
$$;

create or replace function public.release_scheduler_lease(p_key text, p_owner uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare released boolean;
begin
  delete from public.scheduler_leases where lease_key = p_key and owner_token = p_owner
  returning true into released;
  return coalesce(released, false);
end;
$$;

revoke all on function public.acquire_scheduler_lease(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.renew_scheduler_lease(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_scheduler_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_scheduler_lease(text, uuid, integer) to service_role;
grant execute on function public.renew_scheduler_lease(text, uuid, integer) to service_role;
grant execute on function public.release_scheduler_lease(text, uuid) to service_role;
