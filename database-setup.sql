-- Выполнить один раз в SQL Editor нового проекта Supabase от имени postgres.
begin;
create schema if not exists gip_private;
revoke all on schema gip_private from public, anon, authenticated;
create table gip_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table gip_private.admins enable row level security;
create table public.gip_appointments (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  ticket_no text generated always as ('ГИП-' || number::text) stored,
  starts_at timestamptz not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('appointment','blocked')),
  full_name text not null check (length(full_name)<=120),
  department text not null check (length(department)<=120),
  topic text not null check (length(topic) between 3 and 500),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (kind='blocked' or (length(btrim(full_name))>=5 and length(btrim(department))>=1))
);
create unique index gip_one_active_slot on public.gip_appointments(starts_at) where cancelled_at is null;
create index gip_user_schedule on public.gip_appointments(user_id,starts_at);
alter table public.gip_appointments enable row level security;
-- Прямой доступ закрыт даже для authenticated. Все операции идут через проверяемые функции.
revoke all on public.gip_appointments from public,anon,authenticated;
revoke all on sequence public.gip_appointments_number_seq from public,anon,authenticated;

create function public.is_gip_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from gip_private.admins a where a.user_id=auth.uid());
$$;

create function public.gip_availability(p_date date)
returns table(starts_at timestamptz,available boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if p_date < (now() at time zone 'Europe/Moscow')::date
     or p_date > (now() at time zone 'Europe/Moscow')::date+30
     or extract(isodow from p_date)>5 then return; end if;
  return query
    select s.t, not exists(select 1 from public.gip_appointments a where a.starts_at=s.t and a.cancelled_at is null)
    from (
      select ((p_date+time '09:00') at time zone 'Europe/Moscow') + n*interval '20 minutes' t
      from generate_series(0,26) n
      where n not between 12 and 14
    ) s where s.t>now() order by s.t;
end;
$$;

create function public.gip_book(p_start timestamptz,p_name text,p_department text,p_topic text,p_blocked boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.gip_appointments; v_date date;
begin
  p_blocked := coalesce(p_blocked,false);
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if p_blocked and not public.is_gip_admin() then raise exception 'not_allowed'; end if;
  -- Сериализация запросов одного сотрудника защищает лимит от параллельных запросов.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if not p_blocked and (select count(*) from public.gip_appointments a where a.user_id=auth.uid()
      and a.starts_at>now() and a.cancelled_at is null and a.kind='appointment')>=5 then
    raise exception 'booking_limit';
  end if;
  if p_start is null then raise exception 'invalid_slot'; end if;
  v_date := (p_start at time zone 'Europe/Moscow')::date;
  if not exists(select 1 from public.gip_availability(v_date) s where s.starts_at=p_start and s.available) then
    raise exception 'slot_unavailable';
  end if;
  insert into public.gip_appointments(starts_at,user_id,kind,full_name,department,topic)
    values(p_start,auth.uid(),case when p_blocked then 'blocked' else 'appointment' end,
      btrim(p_name),btrim(p_department),btrim(p_topic)) returning * into r;
  return to_jsonb(r);
exception when unique_violation then raise exception 'slot_unavailable';
end;
$$;

create function public.gip_bookings(p_date date default null)
returns setof public.gip_appointments
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if p_date is not null then
    if not public.is_gip_admin() then raise exception 'not_allowed'; end if;
    return query select a.* from public.gip_appointments a
      where a.starts_at>=p_date::timestamp at time zone 'Europe/Moscow'
        and a.starts_at<(p_date+1)::timestamp at time zone 'Europe/Moscow' order by a.starts_at,a.created_at;
  else
    return query select a.* from public.gip_appointments a
      where a.user_id=auth.uid() and a.kind='appointment'
      and a.starts_at>now()-interval '90 days' order by a.starts_at desc limit 200;
  end if;
end;
$$;

create function public.gip_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  update public.gip_appointments set cancelled_at=now() where id=p_id and cancelled_at is null and starts_at>now()
    and (user_id=auth.uid() or public.is_gip_admin());
  if not found then raise exception 'not_allowed'; end if;
end;
$$;

revoke all on function public.is_gip_admin() from public,anon;
revoke all on function public.gip_availability(date) from public,anon;
revoke all on function public.gip_book(timestamptz,text,text,text,boolean) from public,anon;
revoke all on function public.gip_bookings(date) from public,anon;
revoke all on function public.gip_cancel(uuid) from public,anon;
grant execute on function public.is_gip_admin(),public.gip_availability(date),
  public.gip_book(timestamptz,text,text,text,boolean),public.gip_bookings(date),public.gip_cancel(uuid) to authenticated;
commit;
