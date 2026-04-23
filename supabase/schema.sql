-- RouteMaster / Supabase schema (Google Auth + per-user data isolation)
-- Apply this in Supabase SQL Editor

create table if not exists public.orders (
    id text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    raw_image_uri text not null,
    address_text text not null,
    status text not null check (status in ('pending', 'completed', 'failed')),
    lat double precision,
    lng double precision,
    sequence integer not null,
    created_at bigint not null,
    completed_at bigint,
    note text,
    updated_at bigint not null default ((extract(epoch from now()) * 1000)::bigint)
);

create index if not exists orders_user_sequence_idx
    on public.orders (user_id, sequence);

create table if not exists public.daily_stats (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    stat_date date not null,
    total_orders integer not null default 0 check (total_orders >= 0),
    completed_count integer not null default 0 check (completed_count >= 0),
    total_distance double precision not null default 0,
    updated_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
    unique (user_id, stat_date)
);

create index if not exists daily_stats_user_date_idx
    on public.daily_stats (user_id, stat_date desc);

create table if not exists public.order_completion_facts (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    order_id text not null,
    created_at_ms bigint not null,
    completed_at_ms bigint not null,
    completed_business_date date not null,
    lat double precision,
    lng double precision,
    route_distance_meters double precision check (route_distance_meters is null or route_distance_meters >= 0),
    route_duration_seconds integer check (route_duration_seconds is null or route_duration_seconds >= 0),
    roi_source_status text not null default 'missing'
        check (roi_source_status in ('missing', 'estimated', 'actual', 'legacy_unknown', 'voided')),
    archived_at_ms bigint,
    voided_at_ms bigint,
    updated_at_ms bigint not null default ((extract(epoch from now()) * 1000)::bigint),
    unique (user_id, order_id)
);

create index if not exists order_completion_facts_user_date_idx
    on public.order_completion_facts (user_id, completed_business_date desc, completed_at_ms desc);

create table if not exists public.daily_completion_stats (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    stat_date date not null,
    completed_count integer not null default 0 check (completed_count >= 0),
    roi_covered_count integer not null default 0 check (roi_covered_count >= 0),
    completed_distance_meters double precision check (completed_distance_meters is null or completed_distance_meters >= 0),
    completed_duration_seconds integer check (completed_duration_seconds is null or completed_duration_seconds >= 0),
    estimated_cost_cents integer check (estimated_cost_cents is null or estimated_cost_cents >= 0),
    roi_source_status text not null default 'missing'
        check (roi_source_status in ('missing', 'partial', 'estimated', 'actual', 'legacy_unknown')),
    updated_at_ms bigint not null default ((extract(epoch from now()) * 1000)::bigint),
    unique (user_id, stat_date)
);

create index if not exists daily_completion_stats_user_date_idx
    on public.daily_completion_stats (user_id, stat_date desc);

create table if not exists public.user_hex_unlocks (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    hex_id text not null,
    first_order_id text,
    unlocked_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
    unique (user_id, hex_id)
);

create index if not exists user_hex_unlocks_user_idx
    on public.user_hex_unlocks (user_id, unlocked_at desc);

alter table public.orders enable row level security;
alter table public.daily_stats enable row level security;
alter table public.order_completion_facts enable row level security;
alter table public.daily_completion_stats enable row level security;
alter table public.user_hex_unlocks enable row level security;

drop policy if exists orders_select_own on public.orders;
drop policy if exists orders_insert_own on public.orders;
drop policy if exists orders_update_own on public.orders;
drop policy if exists orders_delete_own on public.orders;

create policy orders_select_own
    on public.orders
    for select
    using (auth.uid() = user_id);

create policy orders_insert_own
    on public.orders
    for insert
    with check (auth.uid() = user_id);

create policy orders_update_own
    on public.orders
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy orders_delete_own
    on public.orders
    for delete
    using (auth.uid() = user_id);

drop policy if exists daily_stats_select_own on public.daily_stats;
drop policy if exists daily_stats_insert_own on public.daily_stats;
drop policy if exists daily_stats_update_own on public.daily_stats;
drop policy if exists daily_stats_delete_own on public.daily_stats;

create policy daily_stats_select_own
    on public.daily_stats
    for select
    using (auth.uid() = user_id);

create policy daily_stats_insert_own
    on public.daily_stats
    for insert
    with check (auth.uid() = user_id);

create policy daily_stats_update_own
    on public.daily_stats
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy daily_stats_delete_own
    on public.daily_stats
    for delete
    using (auth.uid() = user_id);

drop policy if exists order_completion_facts_select_own on public.order_completion_facts;
drop policy if exists order_completion_facts_insert_own on public.order_completion_facts;
drop policy if exists order_completion_facts_update_own on public.order_completion_facts;
drop policy if exists order_completion_facts_delete_own on public.order_completion_facts;

create policy order_completion_facts_select_own
    on public.order_completion_facts
    for select
    using (auth.uid() = user_id);

create policy order_completion_facts_insert_own
    on public.order_completion_facts
    for insert
    with check (auth.uid() = user_id);

create policy order_completion_facts_update_own
    on public.order_completion_facts
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy order_completion_facts_delete_own
    on public.order_completion_facts
    for delete
    using (auth.uid() = user_id);

drop policy if exists daily_completion_stats_select_own on public.daily_completion_stats;
drop policy if exists daily_completion_stats_insert_own on public.daily_completion_stats;
drop policy if exists daily_completion_stats_update_own on public.daily_completion_stats;
drop policy if exists daily_completion_stats_delete_own on public.daily_completion_stats;

create policy daily_completion_stats_select_own
    on public.daily_completion_stats
    for select
    using (auth.uid() = user_id);

create policy daily_completion_stats_insert_own
    on public.daily_completion_stats
    for insert
    with check (auth.uid() = user_id);

create policy daily_completion_stats_update_own
    on public.daily_completion_stats
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy daily_completion_stats_delete_own
    on public.daily_completion_stats
    for delete
    using (auth.uid() = user_id);

drop policy if exists user_hex_unlocks_select_own on public.user_hex_unlocks;
drop policy if exists user_hex_unlocks_insert_own on public.user_hex_unlocks;
drop policy if exists user_hex_unlocks_update_own on public.user_hex_unlocks;
drop policy if exists user_hex_unlocks_delete_own on public.user_hex_unlocks;

create policy user_hex_unlocks_select_own
    on public.user_hex_unlocks
    for select
    using (auth.uid() = user_id);

create policy user_hex_unlocks_insert_own
    on public.user_hex_unlocks
    for insert
    with check (auth.uid() = user_id);

create policy user_hex_unlocks_update_own
    on public.user_hex_unlocks
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy user_hex_unlocks_delete_own
    on public.user_hex_unlocks
    for delete
    using (auth.uid() = user_id);

-- Self-service account deletion:
-- - Deletes the current auth user
-- - orders / daily_stats / order_completion_facts / daily_completion_stats are removed automatically by ON DELETE CASCADE
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid;
begin
    current_user_id := auth.uid();

    if current_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    delete from auth.users
    where id = current_user_id;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

create table if not exists public.user_entitlements (
    user_id uuid primary key references auth.users(id) on delete cascade,
    plan_type text not null default 'free' check (plan_type in ('free', 'pro')),
    subscription_status text not null default 'inactive'
        check (subscription_status in ('inactive', 'active', 'grace_period', 'canceled', 'billing_issue', 'expired')),
    provider text check (provider in ('revenuecat', 'app_store', 'play_store')),
    product_id text,
    entitlement_id text,
    period_ends_at timestamptz,
    will_renew boolean not null default false,
    last_webhook_event_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.daily_usage_quotas (
    id bigserial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    usage_date date not null,
    plan_type_snapshot text not null default 'free' check (plan_type_snapshot in ('free', 'pro')),
    free_limit integer not null default 3 check (free_limit >= 0),
    used_count integer not null default 0 check (used_count >= 0),
    blocked_count integer not null default 0 check (blocked_count >= 0),
    last_consumed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, usage_date)
);

create index if not exists daily_usage_quotas_user_date_idx
    on public.daily_usage_quotas (user_id, usage_date desc);

create table if not exists public.billing_webhook_events (
    id bigserial primary key,
    provider text not null check (provider in ('revenuecat', 'app_store', 'play_store')),
    event_id text not null,
    event_type text not null,
    payload jsonb not null,
    status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
    error_message text,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    unique (provider, event_id)
);

alter table public.user_entitlements enable row level security;
alter table public.daily_usage_quotas enable row level security;
alter table public.billing_webhook_events enable row level security;

drop policy if exists user_entitlements_select_own on public.user_entitlements;
drop policy if exists user_entitlements_insert_own on public.user_entitlements;
drop policy if exists user_entitlements_update_own on public.user_entitlements;
drop policy if exists user_entitlements_delete_own on public.user_entitlements;

create policy user_entitlements_select_own
    on public.user_entitlements
    for select
    using (auth.uid() = user_id);

drop policy if exists daily_usage_quotas_select_own on public.daily_usage_quotas;
drop policy if exists daily_usage_quotas_insert_own on public.daily_usage_quotas;
drop policy if exists daily_usage_quotas_update_own on public.daily_usage_quotas;
drop policy if exists daily_usage_quotas_delete_own on public.daily_usage_quotas;

create policy daily_usage_quotas_select_own
    on public.daily_usage_quotas
    for select
    using (auth.uid() = user_id);

create or replace function public.app_business_date()
returns date
language sql
stable
as $$
    select (now() at time zone 'Asia/Taipei')::date;
$$;

create or replace function public.app_next_reset_at()
returns timestamptz
language sql
stable
as $$
    select ((public.app_business_date() + 1)::timestamp at time zone 'Asia/Taipei');
$$;

create or replace function public.business_date_from_epoch_ms(input_ms bigint)
returns date
language sql
immutable
as $$
    select timezone('Asia/Taipei', to_timestamp(input_ms::double precision / 1000.0))::date;
$$;

create or replace function public.reconcile_daily_stat(
    p_user_id uuid,
    p_stat_date date,
    p_delta_total_orders integer,
    p_delta_completed_count integer
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    existing_stat public.daily_stats%rowtype;
    now_ms bigint;
    initial_total_orders integer;
    initial_completed_count integer;
begin
    if p_delta_total_orders = 0 and p_delta_completed_count = 0 then
        return;
    end if;

    now_ms := (extract(epoch from now()) * 1000)::bigint;

    select *
    into existing_stat
    from public.daily_stats ds
    where ds.user_id = p_user_id
      and ds.stat_date = p_stat_date
    for update;

    if existing_stat.id is not null then
        update public.daily_stats
        set total_orders = greatest(existing_stat.total_orders + p_delta_total_orders, 0),
            completed_count = greatest(existing_stat.completed_count + p_delta_completed_count, 0),
            updated_at = now_ms
        where id = existing_stat.id;
        return;
    end if;

    initial_total_orders := greatest(p_delta_total_orders, 0);
    initial_completed_count := greatest(p_delta_completed_count, 0);

    if initial_total_orders = 0 and initial_completed_count = 0 then
        return;
    end if;

    insert into public.daily_stats (
        user_id,
        stat_date,
        total_orders,
        completed_count,
        total_distance,
        updated_at
    )
    values (
        p_user_id,
        p_stat_date,
        initial_total_orders,
        initial_completed_count,
        0,
        now_ms
    );
end;
$$;

create or replace function public.ensure_order_completion_fact(
    p_user_id uuid,
    p_order_id text,
    p_created_at_ms bigint,
    p_completed_at_ms bigint,
    p_lat double precision,
    p_lng double precision,
    p_roi_source_status text default 'missing',
    p_archived_at_ms bigint default null,
    p_voided_at_ms bigint default null
)
returns date
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    completed_date date;
    effective_roi_source_status text;
    now_ms bigint;
begin
    if p_completed_at_ms is null then
        raise exception 'COMPLETED_AT_REQUIRED';
    end if;

    completed_date := public.business_date_from_epoch_ms(p_completed_at_ms);
    effective_roi_source_status := case
        when p_voided_at_ms is not null then 'voided'
        else coalesce(p_roi_source_status, 'missing')
    end;
    now_ms := (extract(epoch from now()) * 1000)::bigint;

    insert into public.order_completion_facts (
        user_id,
        order_id,
        created_at_ms,
        completed_at_ms,
        completed_business_date,
        lat,
        lng,
        route_distance_meters,
        route_duration_seconds,
        roi_source_status,
        archived_at_ms,
        voided_at_ms,
        updated_at_ms
    )
    values (
        p_user_id,
        p_order_id,
        p_created_at_ms,
        p_completed_at_ms,
        completed_date,
        p_lat,
        p_lng,
        null,
        null,
        effective_roi_source_status,
        p_archived_at_ms,
        p_voided_at_ms,
        now_ms
    )
    on conflict (user_id, order_id) do update
    set created_at_ms = excluded.created_at_ms,
        completed_at_ms = excluded.completed_at_ms,
        completed_business_date = excluded.completed_business_date,
        lat = coalesce(public.order_completion_facts.lat, excluded.lat),
        lng = coalesce(public.order_completion_facts.lng, excluded.lng),
        route_distance_meters = coalesce(public.order_completion_facts.route_distance_meters, excluded.route_distance_meters),
        route_duration_seconds = coalesce(public.order_completion_facts.route_duration_seconds, excluded.route_duration_seconds),
        archived_at_ms = coalesce(public.order_completion_facts.archived_at_ms, excluded.archived_at_ms),
        voided_at_ms = coalesce(excluded.voided_at_ms, public.order_completion_facts.voided_at_ms),
        roi_source_status = case
            when coalesce(excluded.voided_at_ms, public.order_completion_facts.voided_at_ms) is not null then 'voided'
            when public.order_completion_facts.roi_source_status in ('actual', 'estimated') then public.order_completion_facts.roi_source_status
            else excluded.roi_source_status
        end,
        updated_at_ms = excluded.updated_at_ms;

    return completed_date;
end;
$$;

create or replace function public.refresh_daily_completion_stat(
    p_user_id uuid,
    p_stat_date date
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    total_completed_count integer;
    total_roi_covered_count integer;
    total_distance_meters double precision;
    total_duration_seconds integer;
    legacy_fact_count integer;
    actual_covered_count integer;
    aggregate_roi_source_status text;
    now_ms bigint;
begin
    select
        count(*)::integer,
        count(*) filter (
            where ocf.roi_source_status in ('estimated', 'actual')
              and ocf.route_distance_meters is not null
              and ocf.route_duration_seconds is not null
        )::integer,
        sum(ocf.route_distance_meters) filter (
            where ocf.roi_source_status in ('estimated', 'actual')
              and ocf.route_distance_meters is not null
              and ocf.route_duration_seconds is not null
        ),
        (sum(ocf.route_duration_seconds) filter (
            where ocf.roi_source_status in ('estimated', 'actual')
              and ocf.route_distance_meters is not null
              and ocf.route_duration_seconds is not null
        ))::integer,
        count(*) filter (where ocf.roi_source_status = 'legacy_unknown')::integer,
        count(*) filter (
            where ocf.roi_source_status = 'actual'
              and ocf.route_distance_meters is not null
              and ocf.route_duration_seconds is not null
        )::integer
    into
        total_completed_count,
        total_roi_covered_count,
        total_distance_meters,
        total_duration_seconds,
        legacy_fact_count,
        actual_covered_count
    from public.order_completion_facts ocf
    where ocf.user_id = p_user_id
      and ocf.completed_business_date = p_stat_date
      and ocf.voided_at_ms is null;

    if coalesce(total_completed_count, 0) = 0 then
        delete from public.daily_completion_stats dcs
        where dcs.user_id = p_user_id
          and dcs.stat_date = p_stat_date;
        return;
    end if;

    aggregate_roi_source_status := case
        when coalesce(legacy_fact_count, 0) > 0 then 'legacy_unknown'
        when coalesce(total_roi_covered_count, 0) = 0 then 'missing'
        when total_roi_covered_count < total_completed_count then 'partial'
        when actual_covered_count = total_completed_count then 'actual'
        else 'estimated'
    end;
    now_ms := (extract(epoch from now()) * 1000)::bigint;

    insert into public.daily_completion_stats (
        user_id,
        stat_date,
        completed_count,
        roi_covered_count,
        completed_distance_meters,
        completed_duration_seconds,
        estimated_cost_cents,
        roi_source_status,
        updated_at_ms
    )
    values (
        p_user_id,
        p_stat_date,
        total_completed_count,
        total_roi_covered_count,
        case when total_roi_covered_count = 0 then null else total_distance_meters end,
        case when total_roi_covered_count = 0 then null else total_duration_seconds end,
        null,
        aggregate_roi_source_status,
        now_ms
    )
    on conflict (user_id, stat_date) do update
    set completed_count = excluded.completed_count,
        roi_covered_count = excluded.roi_covered_count,
        completed_distance_meters = excluded.completed_distance_meters,
        completed_duration_seconds = excluded.completed_duration_seconds,
        estimated_cost_cents = excluded.estimated_cost_cents,
        roi_source_status = excluded.roi_source_status,
        updated_at_ms = excluded.updated_at_ms;
end;
$$;

create or replace function public.rebuild_completion_history_aggregates()
returns table (
    refreshed_dates integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid;
    completion_date record;
    refreshed_count integer := 0;
begin
    current_user_id := auth.uid();

    if current_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    delete from public.daily_completion_stats dcs
    where dcs.user_id = current_user_id;

    for completion_date in
        select distinct ocf.completed_business_date
        from public.order_completion_facts ocf
        where ocf.user_id = current_user_id
          and ocf.voided_at_ms is null
        order by ocf.completed_business_date
    loop
        perform public.refresh_daily_completion_stat(
            current_user_id,
            completion_date.completed_business_date
        );
        refreshed_count := refreshed_count + 1;
    end loop;

    return query
    select refreshed_count;
end;
$$;

create or replace function public.complete_order_and_capture_history(p_order_id text)
returns table (
    completed_at_ms bigint,
    lat double precision,
    lng double precision,
    already_completed boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid;
    current_order public.orders%rowtype;
    now_ms bigint;
    created_business_date date;
    completion_business_date date;
begin
    current_user_id := auth.uid();

    if current_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    select *
    into current_order
    from public.orders o
    where o.user_id = current_user_id
      and o.id = p_order_id
    for update;

    if current_order.id is null then
        raise exception 'ORDER_NOT_FOUND';
    end if;

    if current_order.status = 'completed' then
        return query
        select
            current_order.completed_at,
            current_order.lat,
            current_order.lng,
            true;
        return;
    end if;

    now_ms := (extract(epoch from now()) * 1000)::bigint;

    update public.orders
    set status = 'completed',
        completed_at = now_ms,
        updated_at = now_ms
    where id = current_order.id
      and user_id = current_user_id;

    created_business_date := public.business_date_from_epoch_ms(current_order.created_at);
    perform public.reconcile_daily_stat(current_user_id, created_business_date, 0, 1);

    completion_business_date := public.ensure_order_completion_fact(
        current_user_id,
        current_order.id,
        current_order.created_at,
        now_ms,
        current_order.lat,
        current_order.lng,
        'missing',
        null,
        null
    );
    perform public.refresh_daily_completion_stat(current_user_id, completion_business_date);

    return query
    select
        now_ms,
        current_order.lat,
        current_order.lng,
        false;
end;
$$;

create or replace function public.delete_order_and_reconcile_history(p_order_id text)
returns table (
    deleted_order_id text,
    existed boolean,
    was_completed boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid;
    current_order public.orders%rowtype;
    created_business_date date;
    completion_business_date date;
    effective_completed_at_ms bigint;
    now_ms bigint;
    completed_before_delete boolean;
begin
    current_user_id := auth.uid();

    if current_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    select *
    into current_order
    from public.orders o
    where o.user_id = current_user_id
      and o.id = p_order_id
    for update;

    if current_order.id is null then
        return query
        select
            p_order_id,
            false,
            false;
        return;
    end if;

    now_ms := (extract(epoch from now()) * 1000)::bigint;
    created_business_date := public.business_date_from_epoch_ms(current_order.created_at);
    completed_before_delete := current_order.status = 'completed';

    if completed_before_delete then
        effective_completed_at_ms := coalesce(current_order.completed_at, current_order.updated_at, now_ms);
        completion_business_date := public.ensure_order_completion_fact(
            current_user_id,
            current_order.id,
            current_order.created_at,
            effective_completed_at_ms,
            current_order.lat,
            current_order.lng,
            'legacy_unknown',
            null,
            now_ms
        );
        perform public.refresh_daily_completion_stat(current_user_id, completion_business_date);
    end if;

    delete from public.orders o
    where o.user_id = current_user_id
      and o.id = current_order.id;

    perform public.reconcile_daily_stat(
        current_user_id,
        created_business_date,
        -1,
        case when completed_before_delete then -1 else 0 end
    );

    return query
    select
        current_order.id,
        true,
        completed_before_delete;
end;
$$;

create or replace function public.archive_completed_orders()
returns table (
    archived_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid;
    current_order public.orders%rowtype;
    completion_business_date date;
    effective_completed_at_ms bigint;
    now_ms bigint;
    deleted_count integer;
begin
    current_user_id := auth.uid();

    if current_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    now_ms := (extract(epoch from now()) * 1000)::bigint;

    for current_order in
        select *
        from public.orders o
        where o.user_id = current_user_id
          and o.status = 'completed'
    loop
        effective_completed_at_ms := coalesce(current_order.completed_at, current_order.updated_at, now_ms);
        completion_business_date := public.ensure_order_completion_fact(
            current_user_id,
            current_order.id,
            current_order.created_at,
            effective_completed_at_ms,
            current_order.lat,
            current_order.lng,
            'legacy_unknown',
            now_ms,
            null
        );
        perform public.refresh_daily_completion_stat(current_user_id, completion_business_date);
    end loop;

    delete from public.orders o
    where o.user_id = current_user_id
      and o.status = 'completed';

    get diagnostics deleted_count = row_count;

    return query
    select coalesce(deleted_count, 0);
end;
$$;

create or replace function public.capture_completion_route_metrics(
    p_order_id text,
    p_route_distance_meters double precision default null,
    p_route_duration_seconds integer default null,
    p_roi_source_status text default 'estimated'
)
returns table (
    order_id text,
    completed_business_date date,
    roi_source_status text,
    metrics_applied boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid;
    fact_row public.order_completion_facts%rowtype;
    current_order public.orders%rowtype;
    effective_completed_at_ms bigint;
    effective_completed_business_date date;
    effective_roi_source_status text;
    next_route_distance_meters double precision;
    next_route_duration_seconds integer;
    next_roi_source_status text;
    has_complete_metrics boolean;
    now_ms bigint;
    preserve_existing_metrics boolean;
begin
    current_user_id := auth.uid();

    if current_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    if p_route_distance_meters is not null and p_route_distance_meters < 0 then
        raise exception 'NEGATIVE_ROUTE_DISTANCE';
    end if;

    if p_route_duration_seconds is not null and p_route_duration_seconds < 0 then
        raise exception 'NEGATIVE_ROUTE_DURATION';
    end if;

    if coalesce(p_roi_source_status, 'estimated') not in ('missing', 'estimated', 'actual') then
        raise exception 'INVALID_ROI_SOURCE_STATUS';
    end if;

    has_complete_metrics := p_route_distance_meters is not null
        and p_route_duration_seconds is not null;
    effective_roi_source_status := case
        when not has_complete_metrics then 'missing'
        when p_roi_source_status = 'actual' then 'actual'
        else 'estimated'
    end;
    now_ms := (extract(epoch from now()) * 1000)::bigint;

    select *
    into fact_row
    from public.order_completion_facts ocf
    where ocf.user_id = current_user_id
      and ocf.order_id = p_order_id
    for update;

    if fact_row.id is null then
        select *
        into current_order
        from public.orders o
        where o.user_id = current_user_id
          and o.id = p_order_id
          and o.status = 'completed'
        for update;

        if current_order.id is null then
            return query
            select
                p_order_id,
                null::date,
                'missing'::text,
                false;
            return;
        end if;

        effective_completed_at_ms := coalesce(current_order.completed_at, current_order.updated_at, now_ms);
        effective_completed_business_date := public.ensure_order_completion_fact(
            current_user_id,
            current_order.id,
            current_order.created_at,
            effective_completed_at_ms,
            current_order.lat,
            current_order.lng,
            effective_roi_source_status,
            null,
            null
        );

        select *
        into fact_row
        from public.order_completion_facts ocf
        where ocf.user_id = current_user_id
          and ocf.order_id = p_order_id
        for update;
    else
        effective_completed_business_date := fact_row.completed_business_date;
    end if;

    preserve_existing_metrics := fact_row.roi_source_status = 'actual'
        and effective_roi_source_status <> 'actual';

    next_route_distance_meters := case
        when preserve_existing_metrics then fact_row.route_distance_meters
        when has_complete_metrics then coalesce(p_route_distance_meters, fact_row.route_distance_meters)
        else fact_row.route_distance_meters
    end;
    next_route_duration_seconds := case
        when preserve_existing_metrics then fact_row.route_duration_seconds
        when has_complete_metrics then coalesce(p_route_duration_seconds, fact_row.route_duration_seconds)
        else fact_row.route_duration_seconds
    end;
    next_roi_source_status := case
        when fact_row.voided_at_ms is not null then 'voided'
        when next_route_distance_meters is null or next_route_duration_seconds is null then 'missing'
        when fact_row.roi_source_status = 'actual' or effective_roi_source_status = 'actual' then 'actual'
        else 'estimated'
    end;

    update public.order_completion_facts
    set route_distance_meters = next_route_distance_meters,
        route_duration_seconds = next_route_duration_seconds,
        roi_source_status = next_roi_source_status,
        updated_at_ms = now_ms
    where id = fact_row.id;

    perform public.refresh_daily_completion_stat(current_user_id, effective_completed_business_date);

    return query
    select
        p_order_id,
        effective_completed_business_date,
        next_roi_source_status,
        has_complete_metrics;
end;
$$;

create or replace function public.is_user_pro_active(
    current_plan_type text,
    current_subscription_status text,
    current_period_ends_at timestamptz
)
returns boolean
language sql
stable
as $$
    select
        current_plan_type = 'pro'
        and (
            current_subscription_status in ('active', 'grace_period')
            or (
                current_subscription_status = 'canceled'
                and current_period_ends_at is not null
                and current_period_ends_at > now()
            )
        );
$$;

create or replace function public.get_billing_summary()
returns table (
    plan_type text,
    subscription_status text,
    daily_free_limit integer,
    used_today integer,
    remaining_today integer,
    is_unlimited boolean,
    can_optimize boolean,
    reset_at timestamptz,
    period_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid;
    current_date_key date;
    entitlement_plan text;
    entitlement_status text;
    entitlement_period_ends_at timestamptz;
    quota_limit integer;
    quota_used integer;
    quota_remaining integer;
    unlimited_access boolean;
begin
    current_user_id := auth.uid();
    if current_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    current_date_key := public.app_business_date();

    select
        coalesce(ue.plan_type, 'free'),
        coalesce(ue.subscription_status, 'inactive'),
        ue.period_ends_at
    into
        entitlement_plan,
        entitlement_status,
        entitlement_period_ends_at
    from public.user_entitlements ue
    where ue.user_id = current_user_id;

    entitlement_plan := coalesce(entitlement_plan, 'free');
    entitlement_status := coalesce(entitlement_status, 'inactive');

    select
        coalesce(duq.free_limit, 3),
        coalesce(duq.used_count, 0)
    into
        quota_limit,
        quota_used
    from public.daily_usage_quotas duq
    where duq.user_id = current_user_id
      and duq.usage_date = current_date_key;

    quota_limit := coalesce(quota_limit, 3);
    quota_used := coalesce(quota_used, 0);
    quota_remaining := greatest(quota_limit - quota_used, 0);
    unlimited_access := public.is_user_pro_active(
        entitlement_plan,
        entitlement_status,
        entitlement_period_ends_at
    );

    return query
    select
        entitlement_plan,
        entitlement_status,
        quota_limit,
        quota_used,
        case
            when unlimited_access then quota_limit
            else quota_remaining
        end,
        unlimited_access,
        unlimited_access or quota_remaining > 0,
        public.app_next_reset_at(),
        entitlement_period_ends_at;
end;
$$;

create or replace function public.consume_optimization_credit()
returns table (
    allowed boolean,
    consumed boolean,
    block_reason text,
    plan_type text,
    subscription_status text,
    daily_free_limit integer,
    used_today integer,
    remaining_today integer,
    is_unlimited boolean,
    can_optimize boolean,
    reset_at timestamptz,
    period_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid;
    current_date_key date;
    entitlement_plan text;
    entitlement_status text;
    entitlement_period_ends_at timestamptz;
    quota_row public.daily_usage_quotas%rowtype;
    quota_limit integer;
    quota_used integer;
    quota_remaining integer;
    unlimited_access boolean;
begin
    current_user_id := auth.uid();
    if current_user_id is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    current_date_key := public.app_business_date();

    select
        coalesce(ue.plan_type, 'free'),
        coalesce(ue.subscription_status, 'inactive'),
        ue.period_ends_at
    into
        entitlement_plan,
        entitlement_status,
        entitlement_period_ends_at
    from public.user_entitlements ue
    where ue.user_id = current_user_id;

    entitlement_plan := coalesce(entitlement_plan, 'free');
    entitlement_status := coalesce(entitlement_status, 'inactive');
    unlimited_access := public.is_user_pro_active(
        entitlement_plan,
        entitlement_status,
        entitlement_period_ends_at
    );

    if unlimited_access then
        select *
        into quota_row
        from public.daily_usage_quotas duq
        where duq.user_id = current_user_id
          and duq.usage_date = current_date_key;

        quota_limit := coalesce(quota_row.free_limit, 3);
        quota_used := coalesce(quota_row.used_count, 0);

        return query
        select
            true,
            false,
            null::text,
            entitlement_plan,
            entitlement_status,
            quota_limit,
            quota_used,
            quota_limit,
            true,
            true,
            public.app_next_reset_at(),
            entitlement_period_ends_at;
        return;
    end if;

    select *
    into quota_row
    from public.daily_usage_quotas duq
    where duq.user_id = current_user_id
      and duq.usage_date = current_date_key
    for update;

    if quota_row.id is null then
        insert into public.daily_usage_quotas (
            user_id,
            usage_date,
            plan_type_snapshot,
            free_limit,
            used_count,
            blocked_count,
            updated_at
        )
        values (
            current_user_id,
            current_date_key,
            entitlement_plan,
            3,
            0,
            0,
            now()
        )
        returning *
        into quota_row;
    end if;

    quota_limit := coalesce(quota_row.free_limit, 3);
    quota_used := coalesce(quota_row.used_count, 0);

    if quota_used >= quota_limit then
        update public.daily_usage_quotas
        set blocked_count = blocked_count + 1,
            updated_at = now()
        where id = quota_row.id
        returning *
        into quota_row;

        return query
        select
            false,
            false,
            'quota_exhausted'::text,
            entitlement_plan,
            entitlement_status,
            quota_limit,
            quota_row.used_count,
            greatest(quota_limit - quota_row.used_count, 0),
            false,
            false,
            public.app_next_reset_at(),
            entitlement_period_ends_at;
        return;
    end if;

    update public.daily_usage_quotas
    set used_count = used_count + 1,
        last_consumed_at = now(),
        updated_at = now(),
        plan_type_snapshot = entitlement_plan
    where id = quota_row.id
    returning *
    into quota_row;

    quota_remaining := greatest(quota_limit - quota_row.used_count, 0);

    return query
    select
        true,
        true,
        null::text,
        entitlement_plan,
        entitlement_status,
        quota_limit,
        quota_row.used_count,
        quota_remaining,
        false,
        quota_remaining > 0,
        public.app_next_reset_at(),
        entitlement_period_ends_at;
end;
$$;

revoke all on function public.get_billing_summary() from public;
grant execute on function public.get_billing_summary() to authenticated;

revoke all on function public.consume_optimization_credit() from public;
grant execute on function public.consume_optimization_credit() to authenticated;

revoke all on function public.business_date_from_epoch_ms(bigint) from public;
revoke all on function public.reconcile_daily_stat(uuid, date, integer, integer) from public;
revoke all on function public.ensure_order_completion_fact(uuid, text, bigint, bigint, double precision, double precision, text, bigint, bigint) from public;
revoke all on function public.refresh_daily_completion_stat(uuid, date) from public;
revoke all on function public.rebuild_completion_history_aggregates() from public;
grant execute on function public.rebuild_completion_history_aggregates() to authenticated;
revoke all on function public.complete_order_and_capture_history(text) from public;
grant execute on function public.complete_order_and_capture_history(text) to authenticated;

revoke all on function public.capture_completion_route_metrics(text, double precision, integer, text) from public;
grant execute on function public.capture_completion_route_metrics(text, double precision, integer, text) to authenticated;

revoke all on function public.delete_order_and_reconcile_history(text) from public;
grant execute on function public.delete_order_and_reconcile_history(text) to authenticated;

revoke all on function public.archive_completed_orders() from public;
grant execute on function public.archive_completed_orders() to authenticated;
