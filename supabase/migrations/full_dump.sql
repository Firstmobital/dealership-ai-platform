--
-- PostgreSQL database dump
--

\restrict HBKI4CloiiKHMvjz2LKJKHJ2qzrVlKtgD60KfoLTA0P1H5qdZLKme4CSeQZ6XtL

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Homebrew)

-- Started on 2026-02-09 17:27:01 IST

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 22 (class 2615 OID 18615)
-- Name: _realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA _realtime;


--
-- TOC entry 31 (class 2615 OID 16494)
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- TOC entry 1 (class 3079 OID 84159)
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;


--
-- TOC entry 5556 (class 0 OID 0)
-- Dependencies: 1
-- Name: EXTENSION pg_cron; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';


--
-- TOC entry 36 (class 2615 OID 16388)
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- TOC entry 34 (class 2615 OID 16624)
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- TOC entry 33 (class 2615 OID 16613)
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- TOC entry 8 (class 3079 OID 84245)
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;


--
-- TOC entry 5557 (class 0 OID 0)
-- Dependencies: 8
-- Name: EXTENSION pg_net; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_net IS 'Async HTTP';


--
-- TOC entry 15 (class 2615 OID 16386)
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- TOC entry 23 (class 2615 OID 16605)
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- TOC entry 35 (class 2615 OID 16542)
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- TOC entry 24 (class 2615 OID 18616)
-- Name: supabase_functions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_functions;


--
-- TOC entry 17 (class 2615 OID 17489)
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- TOC entry 32 (class 2615 OID 16653)
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- TOC entry 9 (class 3079 OID 84211)
-- Name: http; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA public;


--
-- TOC entry 5558 (class 0 OID 0)
-- Dependencies: 9
-- Name: EXTENSION http; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION http IS 'HTTP client for PostgreSQL, allows web page retrieval inside the database.';


--
-- TOC entry 4 (class 3079 OID 16689)
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- TOC entry 5559 (class 0 OID 0)
-- Dependencies: 4
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- TOC entry 6 (class 3079 OID 18618)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- TOC entry 5560 (class 0 OID 0)
-- Dependencies: 6
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 3 (class 3079 OID 16654)
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- TOC entry 5561 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- TOC entry 5 (class 3079 OID 18655)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- TOC entry 5562 (class 0 OID 0)
-- Dependencies: 5
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 7 (class 3079 OID 22588)
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- TOC entry 5563 (class 0 OID 0)
-- Dependencies: 7
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- TOC entry 1446 (class 1247 OID 16784)
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- TOC entry 1470 (class 1247 OID 16925)
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- TOC entry 1443 (class 1247 OID 16778)
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- TOC entry 1440 (class 1247 OID 16773)
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- TOC entry 1488 (class 1247 OID 17028)
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- TOC entry 1500 (class 1247 OID 17101)
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- TOC entry 1482 (class 1247 OID 17006)
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- TOC entry 1491 (class 1247 OID 17038)
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- TOC entry 1476 (class 1247 OID 16967)
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- TOC entry 1560 (class 1247 OID 18668)
-- Name: campaign_message_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_message_status AS ENUM (
    'pending',
    'queued',
    'sent',
    'delivered',
    'failed',
    'cancelled',
    'read'
);


--
-- TOC entry 1563 (class 1247 OID 18682)
-- Name: campaign_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_status AS ENUM (
    'draft',
    'scheduled',
    'sending',
    'completed',
    'cancelled',
    'failed'
);


--
-- TOC entry 1566 (class 1247 OID 18696)
-- Name: message_sender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_sender AS ENUM (
    'user',
    'bot',
    'customer',
    'agent'
);


--
-- TOC entry 1692 (class 1247 OID 79066)
-- Name: psf_resolution_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.psf_resolution_status AS ENUM (
    'open',
    'resolved'
);


--
-- TOC entry 1686 (class 1247 OID 79056)
-- Name: psf_sentiment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.psf_sentiment AS ENUM (
    'positive',
    'neutral',
    'negative',
    'no_reply'
);


--
-- TOC entry 1548 (class 1247 OID 17349)
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- TOC entry 1527 (class 1247 OID 17231)
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- TOC entry 1530 (class 1247 OID 17245)
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- TOC entry 1554 (class 1247 OID 17390)
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- TOC entry 1551 (class 1247 OID 17361)
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- TOC entry 1536 (class 1247 OID 17272)
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- TOC entry 583 (class 1255 OID 16540)
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- TOC entry 5564 (class 0 OID 0)
-- Dependencies: 583
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- TOC entry 596 (class 1255 OID 16755)
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- TOC entry 497 (class 1255 OID 16539)
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- TOC entry 5565 (class 0 OID 0)
-- Dependencies: 497
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- TOC entry 530 (class 1255 OID 16538)
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- TOC entry 5566 (class 0 OID 0)
-- Dependencies: 530
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- TOC entry 677 (class 1255 OID 16597)
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- TOC entry 5567 (class 0 OID 0)
-- Dependencies: 677
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- TOC entry 641 (class 1255 OID 16618)
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- TOC entry 5568 (class 0 OID 0)
-- Dependencies: 641
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- TOC entry 564 (class 1255 OID 16599)
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- TOC entry 5569 (class 0 OID 0)
-- Dependencies: 564
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- TOC entry 481 (class 1255 OID 16609)
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- TOC entry 701 (class 1255 OID 16610)
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- TOC entry 509 (class 1255 OID 16620)
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- TOC entry 5570 (class 0 OID 0)
-- Dependencies: 509
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- TOC entry 588 (class 1255 OID 16387)
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 470 (class 1259 OID 94138)
-- Name: background_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.background_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    job_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 550 (class 1255 OID 94161)
-- Name: claim_background_jobs(integer, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_background_jobs(p_limit integer, p_worker_id text, p_lock_ttl_seconds integer DEFAULT 300) RETURNS SETOF public.background_jobs
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with picked as (
    select id
    from public.background_jobs
    where status = 'queued'
      and run_at <= now()
      and (locked_at is null or locked_at < now() - (p_lock_ttl_seconds || ' seconds')::interval)
    order by run_at asc
    for update skip locked
    limit p_limit
  )
  update public.background_jobs bj
  set
    status = 'running',
    locked_at = now(),
    locked_by = p_worker_id,
    attempts = attempts + 1,
    updated_at = now()
  where bj.id in (select id from picked)
  returning *;
$$;


--
-- TOC entry 402 (class 1259 OID 18750)
-- Name: campaign_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    contact_id uuid,
    phone text NOT NULL,
    variables jsonb,
    status public.campaign_message_status DEFAULT 'pending'::public.campaign_message_status NOT NULL,
    error text,
    whatsapp_message_id text,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    replied_at timestamp with time zone,
    reply_whatsapp_message_id text,
    reply_text text,
    rendered_text text,
    raw_row jsonb,
    send_attempts integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone,
    locked_at timestamp with time zone,
    locked_by text,
    last_attempt_at timestamp with time zone,
    CONSTRAINT campaign_messages_send_attempts_nonnegative CHECK ((send_attempts >= 0))
);


--
-- TOC entry 5571 (class 0 OID 0)
-- Dependencies: 402
-- Name: COLUMN campaign_messages.rendered_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_messages.rendered_text IS 'Final resolved message text sent to customer (human readable)';


--
-- TOC entry 594 (class 1255 OID 92854)
-- Name: claim_campaign_messages(uuid, integer, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_campaign_messages(p_campaign_id uuid, p_limit integer, p_worker_id text, p_lock_ttl_seconds integer DEFAULT 300) RETURNS SETOF public.campaign_messages
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_ttl interval := make_interval(secs => greatest(p_lock_ttl_seconds, 30));
begin
  return query
  with candidates as (
    select cm.id
    from public.campaign_messages cm
    where cm.campaign_id = p_campaign_id
      and cm.status in ('pending', 'queued')
      and (cm.next_retry_at is null or cm.next_retry_at <= now())
      and (cm.locked_at is null or cm.locked_at <= now() - v_ttl)
    order by cm.created_at asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.campaign_messages cm
  set
    status = 'queued',
    locked_at = now(),
    locked_by = p_worker_id,
    send_attempts = coalesce(cm.send_attempts, 0) + 1,  -- ✅ FIX
    last_attempt_at = now()
  where cm.id in (select id from candidates)
  returning cm.*;
end;
$$;


--
-- TOC entry 746 (class 1255 OID 94137)
-- Name: consume_ai_quota(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_ai_quota(p_organization_id uuid, p_estimated_tokens integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  limits record;
  win_start timestamptz;
  rowrec record;
begin
  select * into limits
  from public.ai_org_rate_limits
  where organization_id = p_organization_id;

  -- If there is no limits row, allow by default (can be configured later).
  if limits is null or limits.enabled = false then
    return jsonb_build_object('allowed', true, 'window_start', null);
  end if;

  win_start := to_timestamp(
    floor(extract(epoch from now()) / limits.window_seconds) * limits.window_seconds
  );

  insert into public.ai_org_rate_limit_usage (organization_id, window_start, request_count, token_count)
  values (p_organization_id, win_start, 1, greatest(p_estimated_tokens, 0))
  on conflict (organization_id, window_start)
  do update set
    request_count = public.ai_org_rate_limit_usage.request_count + 1,
    token_count   = public.ai_org_rate_limit_usage.token_count + greatest(p_estimated_tokens, 0)
  returning request_count, token_count into rowrec;

  if rowrec.request_count > limits.max_requests or rowrec.token_count > limits.max_tokens then
    raise exception 'ai_rate_limit_exceeded' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'allowed', true,
    'window_start', win_start,
    'request_count', rowrec.request_count,
    'token_count', rowrec.token_count
  );
end;
$$;


--
-- TOC entry 647 (class 1255 OID 77718)
-- Name: create_psf_case_on_campaign_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_psf_case_on_campaign_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  camp public.campaigns;
BEGIN
  SELECT * INTO camp
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  IF camp.campaign_kind = 'psf_initial' THEN
    INSERT INTO public.psf_cases (
      organization_id,
      campaign_id,
      phone,
      uploaded_data,
      initial_sent_at
    )
    VALUES (
      camp.organization_id,
      camp.id,
      NEW.phone,
      COALESCE(NEW.variables, '{}'::jsonb),
      now()
    )
    ON CONFLICT (campaign_id, phone) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


--
-- TOC entry 668 (class 1255 OID 22937)
-- Name: match_knowledge_chunks(public.vector, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_knowledge_chunks(query_embedding public.vector, match_count integer DEFAULT 20, match_threshold double precision DEFAULT 0.3) RETURNS TABLE(id uuid, article_id uuid, chunk text, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
  select
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where kc.embedding <=> query_embedding < 1 - match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;


--
-- TOC entry 545 (class 1255 OID 90369)
-- Name: match_knowledge_chunks(public.vector, double precision, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_knowledge_chunks(query_embedding public.vector, match_threshold double precision, match_count integer, org_id uuid DEFAULT NULL::uuid) RETURNS TABLE(article_id uuid, organization_id uuid, content text, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    kc.article_id,
    kc.organization_id,
    kc.chunk AS content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE
    (org_id IS NULL OR kc.organization_id = org_id)
    AND 1 - (kc.embedding <=> query_embedding) >= match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;


--
-- TOC entry 501 (class 1255 OID 90373)
-- Name: match_knowledge_chunks(public.vector, integer, double precision, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_knowledge_chunks(query_embedding public.vector, match_count integer DEFAULT 20, match_threshold double precision DEFAULT 0.3, p_organization_id uuid DEFAULT NULL::uuid, p_only_published boolean DEFAULT true) RETURNS TABLE(id uuid, article_id uuid, chunk text, similarity double precision, article_title text)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) AS similarity,
    ka.title AS article_title
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_articles ka ON ka.id = kc.article_id
  WHERE (p_organization_id IS NULL OR ka.organization_id = p_organization_id)
    AND (NOT p_only_published OR ka.status = 'published')
    AND kc.embedding <=> query_embedding < 1 - match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;


--
-- TOC entry 499 (class 1255 OID 99154)
-- Name: match_knowledge_chunks_lexical_scoped(text, uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_knowledge_chunks_lexical_scoped(p_query text, p_organization_id uuid, match_count integer, p_only_published boolean) RETURNS TABLE(id uuid, article_id uuid, article_title text, chunk text, rank double precision)
    LANGUAGE sql STABLE
    AS $$
  select
    kc.id,
    kc.article_id,
    ka.title as article_title,
    kc.chunk,
    ts_rank_cd(
      to_tsvector('simple', coalesce(kc.chunk, '')),
      websearch_to_tsquery('simple', coalesce(p_query, ''))
    ) as rank
  from public.knowledge_chunks kc
  join public.knowledge_articles ka on ka.id = kc.article_id
  where
    ka.organization_id = p_organization_id
    and (not p_only_published or ka.status = 'published')
    and to_tsvector('simple', coalesce(kc.chunk, '')) @@ websearch_to_tsquery('simple', coalesce(p_query, ''))
  order by rank desc
  limit match_count;
$$;


--
-- TOC entry 549 (class 1255 OID 92815)
-- Name: match_knowledge_chunks_scoped(public.vector, uuid, integer, double precision, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_knowledge_chunks_scoped(query_embedding public.vector, p_organization_id uuid, match_count integer, match_threshold double precision, p_only_published boolean) RETURNS TABLE(id uuid, article_id uuid, article_title text, chunk text, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
  select
    kc.id,
    kc.article_id,
    ka.title as article_title,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  join knowledge_articles ka on ka.id = kc.article_id
  where
    ka.organization_id = p_organization_id
    and (not p_only_published or ka.status = 'published')
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;


--
-- TOC entry 730 (class 1255 OID 96460)
-- Name: on_message_deleted_recompute_conversation_last_message_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_message_deleted_recompute_conversation_last_message_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.conversation_id is not null then
    perform public.recompute_conversation_last_message_at(old.conversation_id);
  end if;
  return old;
end;
$$;


--
-- TOC entry 510 (class 1255 OID 63897)
-- Name: phase5_create_wallet_for_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase5_create_wallet_for_org() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.wallets (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;


--
-- TOC entry 747 (class 1255 OID 63901)
-- Name: phase5_wallet_apply_transaction(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase5_wallet_apply_transaction() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.direction = 'in' then
    update public.wallets
      set balance = balance + new.amount,
          total_credited = total_credited + new.amount,
          updated_at = now()
    where id = new.wallet_id;
  else
    update public.wallets
      set balance = balance - new.amount,
          total_debited = total_debited + new.amount,
          updated_at = now()
    where id = new.wallet_id;
  end if;

  return new;
end;
$$;


--
-- TOC entry 576 (class 1255 OID 74204)
-- Name: phase5_wallet_manual_credit(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase5_wallet_manual_credit(p_organization_id uuid, p_amount numeric, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid;
  v_role text;
  v_wallet_id uuid;
  v_txn_id uuid;
  v_balance_after numeric(12,4);
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  select ou.role
    into v_role
  from public.organization_users ou
  where ou.organization_id = p_organization_id
    and ou.user_id = v_uid
  limit 1;

  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'Insufficient permissions (owner/admin required)';
  end if;

  select w.id
    into v_wallet_id
  from public.wallets w
  where w.organization_id = p_organization_id
  limit 1;

  if v_wallet_id is null then
    insert into public.wallets (organization_id)
    values (p_organization_id)
    on conflict (organization_id) do update set updated_at = now()
    returning id into v_wallet_id;
  end if;

  insert into public.wallet_transactions (
    wallet_id,
    type,
    direction,
    amount,
    reference_type,
    reference_id,
    metadata,
    purpose,
    created_by,
    created_by_role
  )
  values (
    v_wallet_id,
    'credit',
    'in',
    p_amount,
    'manual',
    null,
    jsonb_build_object('note', p_note),
    'manual_credit',
    v_uid,
    v_role
  )
  returning id, balance_after into v_txn_id, v_balance_after;

  return jsonb_build_object(
    'transaction_id', v_txn_id,
    'wallet_id', v_wallet_id,
    'balance_after', v_balance_after,
    'role', v_role
  );
end;
$$;


--
-- TOC entry 767 (class 1255 OID 63899)
-- Name: phase5_wallet_prevent_negative_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase5_wallet_prevent_negative_balance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_balance numeric(12,4);
begin
  -- Lock wallet row so snapshots are race-free.
  select w.balance
    into v_balance
  from public.wallets w
  where w.id = new.wallet_id
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for wallet_id=%', new.wallet_id;
  end if;

  if new.direction = 'out' then
    if v_balance < new.amount then
      raise exception 'Insufficient wallet balance. Required=%, Available=%',
        new.amount, v_balance;
    end if;

    new.balance_before := v_balance;
    new.balance_after  := v_balance - new.amount;
  else
    new.balance_before := v_balance;
    new.balance_after  := v_balance + new.amount;
  end if;

  return new;
end;
$$;


--
-- TOC entry 663 (class 1255 OID 78909)
-- Name: phase6_log_unanswered_question(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.phase6_log_unanswered_question(p_organization_id uuid, p_conversation_id uuid, p_channel text, p_user_message text, p_ai_response text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.unanswered_questions (
    organization_id,
    conversation_id,
    channel,
    question,
    ai_response,
    status,
    occurrences,
    last_seen_at
  )
  VALUES (
    p_organization_id,
    p_conversation_id,
    p_channel,
    p_user_message,
    p_ai_response,
    'open',
    1,
    now()
  )
  ON CONFLICT (organization_id, question)
  DO UPDATE SET
    occurrences = unanswered_questions.occurrences + 1,
    last_seen_at = now(),
    ai_response = excluded.ai_response;
END;
$$;


--
-- TOC entry 724 (class 1255 OID 96458)
-- Name: recompute_conversation_last_message_at(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_conversation_last_message_at(p_conversation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_last timestamptz;
begin
  select max(coalesce(m.order_at, m.created_at))
    into v_last
  from public.messages m
  where m.conversation_id = p_conversation_id;

  update public.conversations c
     set last_message_at = v_last
   where c.id = p_conversation_id;
end;
$$;


--
-- TOC entry 563 (class 1255 OID 78915)
-- Name: set_active_organization(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_active_organization(p_organization_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- ensure the caller is a member of that org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Not a member of organization';
  END IF;

  UPDATE public.organization_users
  SET last_active_at = now()
  WHERE user_id = auth.uid()
    AND organization_id = p_organization_id;
END;
$$;


--
-- TOC entry 523 (class 1255 OID 92847)
-- Name: set_message_order_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_message_order_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.order_at := coalesce(new.wa_received_at, new.sent_at, new.created_at, now());
  return new;
end;
$$;


--
-- TOC entry 758 (class 1255 OID 92838)
-- Name: set_message_organization_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_message_organization_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT c.organization_id
      INTO NEW.organization_id
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'messages.organization_id is required and could not be derived from conversation_id';
  END IF;

  RETURN NEW;
END;
$$;


--
-- TOC entry 769 (class 1255 OID 74274)
-- Name: set_unanswered_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_unanswered_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- TOC entry 558 (class 1255 OID 74263)
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- TOC entry 716 (class 1255 OID 96459)
-- Name: touch_conversation_last_message_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_conversation_last_message_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_ts timestamptz;
begin
  if (tg_op = 'INSERT') then
    if new.conversation_id is null then
      return new;
    end if;

    v_ts := coalesce(new.order_at, new.created_at, now());
    update public.conversations
       set last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz), v_ts)
     where id = new.conversation_id;
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    -- If conversation changed, recompute both
    if old.conversation_id is distinct from new.conversation_id then
      if old.conversation_id is not null then
        perform public.recompute_conversation_last_message_at(old.conversation_id);
      end if;
      if new.conversation_id is not null then
        perform public.recompute_conversation_last_message_at(new.conversation_id);
      end if;
      return new;
    end if;

    -- Same conversation: only fast-touch if timestamp moved forward; otherwise recompute
    v_ts := coalesce(new.order_at, new.created_at);
    if v_ts is null then
      return new;
    end if;

    update public.conversations
       set last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz), v_ts)
     where id = new.conversation_id;
    return new;
  end if;

  return new;
end;
$$;


--
-- TOC entry 729 (class 1255 OID 77716)
-- Name: update_psf_cases_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_psf_cases_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- TOC entry 645 (class 1255 OID 17383)
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_
        -- Filter by action early - only get subscriptions interested in this action
        -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
        and (subs.action_filter = '*' or subs.action_filter = action::text);

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- TOC entry 660 (class 1255 OID 17466)
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- TOC entry 720 (class 1255 OID 17395)
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- TOC entry 630 (class 1255 OID 17346)
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


--
-- TOC entry 612 (class 1255 OID 17341)
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- TOC entry 537 (class 1255 OID 17391)
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- TOC entry 566 (class 1255 OID 17402)
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- TOC entry 656 (class 1255 OID 17340)
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- TOC entry 680 (class 1255 OID 17465)
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- TOC entry 513 (class 1255 OID 17260)
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- TOC entry 614 (class 1255 OID 17372)
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- TOC entry 568 (class 1255 OID 18703)
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- TOC entry 648 (class 1255 OID 17219)
-- Name: add_prefixes(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    prefixes text[];
BEGIN
    prefixes := "storage"."get_prefixes"("_name");

    IF array_length(prefixes, 1) > 0 THEN
        INSERT INTO storage.prefixes (name, bucket_id)
        SELECT UNNEST(prefixes) as name, "_bucket_id" ON CONFLICT DO NOTHING;
    END IF;
END;
$$;


--
-- TOC entry 744 (class 1255 OID 17145)
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- TOC entry 633 (class 1255 OID 17291)
-- Name: delete_leaf_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_rows_deleted integer;
BEGIN
    LOOP
        WITH candidates AS (
            SELECT DISTINCT
                t.bucket_id,
                unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        ),
        uniq AS (
             SELECT
                 bucket_id,
                 name,
                 storage.get_level(name) AS level
             FROM candidates
             WHERE name <> ''
             GROUP BY bucket_id, name
        ),
        leaf AS (
             SELECT
                 p.bucket_id,
                 p.name,
                 p.level
             FROM storage.prefixes AS p
                  JOIN uniq AS u
                       ON u.bucket_id = p.bucket_id
                           AND u.name = p.name
                           AND u.level = p.level
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM storage.objects AS o
                 WHERE o.bucket_id = p.bucket_id
                   AND o.level = p.level + 1
                   AND o.name COLLATE "C" LIKE p.name || '/%'
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM storage.prefixes AS c
                 WHERE c.bucket_id = p.bucket_id
                   AND c.level = p.level + 1
                   AND c.name COLLATE "C" LIKE p.name || '/%'
             )
        )
        DELETE
        FROM storage.prefixes AS p
            USING leaf AS l
        WHERE p.bucket_id = l.bucket_id
          AND p.name = l.name
          AND p.level = l.level;

        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        EXIT WHEN v_rows_deleted = 0;
    END LOOP;
END;
$$;


--
-- TOC entry 512 (class 1255 OID 17220)
-- Name: delete_prefix(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Check if we can delete the prefix
    IF EXISTS(
        SELECT FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name") + 1
          AND "prefixes"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    )
    OR EXISTS(
        SELECT FROM "storage"."objects"
        WHERE "objects"."bucket_id" = "_bucket_id"
          AND "storage"."get_level"("objects"."name") = "storage"."get_level"("_name") + 1
          AND "objects"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    ) THEN
    -- There are sub-objects, skip deletion
    RETURN false;
    ELSE
        DELETE FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name")
          AND "prefixes"."name" = "_name";
        RETURN true;
    END IF;
END;
$$;


--
-- TOC entry 649 (class 1255 OID 17223)
-- Name: delete_prefix_hierarchy_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix_hierarchy_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    prefix text;
BEGIN
    prefix := "storage"."get_prefix"(OLD."name");

    IF coalesce(prefix, '') != '' THEN
        PERFORM "storage"."delete_prefix"(OLD."bucket_id", prefix);
    END IF;

    RETURN OLD;
END;
$$;


--
-- TOC entry 684 (class 1255 OID 17269)
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- TOC entry 592 (class 1255 OID 17119)
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- TOC entry 615 (class 1255 OID 17118)
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- TOC entry 749 (class 1255 OID 17117)
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- TOC entry 489 (class 1255 OID 17201)
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- TOC entry 619 (class 1255 OID 17217)
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- TOC entry 593 (class 1255 OID 17218)
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- TOC entry 623 (class 1255 OID 17267)
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- TOC entry 590 (class 1255 OID 17184)
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- TOC entry 655 (class 1255 OID 17147)
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


--
-- TOC entry 627 (class 1255 OID 17290)
-- Name: lock_top_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.lock_top_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket text;
    v_top text;
BEGIN
    FOR v_bucket, v_top IN
        SELECT DISTINCT t.bucket_id,
            split_part(t.name, '/', 1) AS top
        FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        WHERE t.name <> ''
        ORDER BY 1, 2
        LOOP
            PERFORM pg_advisory_xact_lock(hashtextextended(v_bucket || '/' || v_top, 0));
        END LOOP;
END;
$$;


--
-- TOC entry 555 (class 1255 OID 17292)
-- Name: objects_delete_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_delete_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket_ids text[];
    v_names      text[];
BEGIN
    IF current_setting('storage.gc.prefixes', true) = '1' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('storage.gc.prefixes', '1', true);

    SELECT COALESCE(array_agg(d.bucket_id), '{}'),
           COALESCE(array_agg(d.name), '{}')
    INTO v_bucket_ids, v_names
    FROM deleted AS d
    WHERE d.name <> '';

    PERFORM storage.lock_top_prefixes(v_bucket_ids, v_names);
    PERFORM storage.delete_leaf_prefixes(v_bucket_ids, v_names);

    RETURN NULL;
END;
$$;


--
-- TOC entry 704 (class 1255 OID 17222)
-- Name: objects_insert_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_insert_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    NEW.level := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- TOC entry 751 (class 1255 OID 17293)
-- Name: objects_update_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    -- NEW - OLD (destinations to create prefixes for)
    v_add_bucket_ids text[];
    v_add_names      text[];

    -- OLD - NEW (sources to prune)
    v_src_bucket_ids text[];
    v_src_names      text[];
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NULL;
    END IF;

    -- 1) Compute NEW−OLD (added paths) and OLD−NEW (moved-away paths)
    WITH added AS (
        SELECT n.bucket_id, n.name
        FROM new_rows n
        WHERE n.name <> '' AND position('/' in n.name) > 0
        EXCEPT
        SELECT o.bucket_id, o.name FROM old_rows o WHERE o.name <> ''
    ),
    moved AS (
         SELECT o.bucket_id, o.name
         FROM old_rows o
         WHERE o.name <> ''
         EXCEPT
         SELECT n.bucket_id, n.name FROM new_rows n WHERE n.name <> ''
    )
    SELECT
        -- arrays for ADDED (dest) in stable order
        COALESCE( (SELECT array_agg(a.bucket_id ORDER BY a.bucket_id, a.name) FROM added a), '{}' ),
        COALESCE( (SELECT array_agg(a.name      ORDER BY a.bucket_id, a.name) FROM added a), '{}' ),
        -- arrays for MOVED (src) in stable order
        COALESCE( (SELECT array_agg(m.bucket_id ORDER BY m.bucket_id, m.name) FROM moved m), '{}' ),
        COALESCE( (SELECT array_agg(m.name      ORDER BY m.bucket_id, m.name) FROM moved m), '{}' )
    INTO v_add_bucket_ids, v_add_names, v_src_bucket_ids, v_src_names;

    -- Nothing to do?
    IF (array_length(v_add_bucket_ids, 1) IS NULL) AND (array_length(v_src_bucket_ids, 1) IS NULL) THEN
        RETURN NULL;
    END IF;

    -- 2) Take per-(bucket, top) locks: ALL prefixes in consistent global order to prevent deadlocks
    DECLARE
        v_all_bucket_ids text[];
        v_all_names text[];
    BEGIN
        -- Combine source and destination arrays for consistent lock ordering
        v_all_bucket_ids := COALESCE(v_src_bucket_ids, '{}') || COALESCE(v_add_bucket_ids, '{}');
        v_all_names := COALESCE(v_src_names, '{}') || COALESCE(v_add_names, '{}');

        -- Single lock call ensures consistent global ordering across all transactions
        IF array_length(v_all_bucket_ids, 1) IS NOT NULL THEN
            PERFORM storage.lock_top_prefixes(v_all_bucket_ids, v_all_names);
        END IF;
    END;

    -- 3) Create destination prefixes (NEW−OLD) BEFORE pruning sources
    IF array_length(v_add_bucket_ids, 1) IS NOT NULL THEN
        WITH candidates AS (
            SELECT DISTINCT t.bucket_id, unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(v_add_bucket_ids, v_add_names) AS t(bucket_id, name)
            WHERE name <> ''
        )
        INSERT INTO storage.prefixes (bucket_id, name)
        SELECT c.bucket_id, c.name
        FROM candidates c
        ON CONFLICT DO NOTHING;
    END IF;

    -- 4) Prune source prefixes bottom-up for OLD−NEW
    IF array_length(v_src_bucket_ids, 1) IS NOT NULL THEN
        -- re-entrancy guard so DELETE on prefixes won't recurse
        IF current_setting('storage.gc.prefixes', true) <> '1' THEN
            PERFORM set_config('storage.gc.prefixes', '1', true);
        END IF;

        PERFORM storage.delete_leaf_prefixes(v_src_bucket_ids, v_src_names);
    END IF;

    RETURN NULL;
END;
$$;


--
-- TOC entry 567 (class 1255 OID 17298)
-- Name: objects_update_level_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_level_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Set the new level
        NEW."level" := "storage"."get_level"(NEW."name");
    END IF;
    RETURN NEW;
END;
$$;


--
-- TOC entry 613 (class 1255 OID 17268)
-- Name: objects_update_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_prefixes TEXT[];
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Retrieve old prefixes
        old_prefixes := "storage"."get_prefixes"(OLD."name");

        -- Remove old prefixes that are only used by this object
        WITH all_prefixes as (
            SELECT unnest(old_prefixes) as prefix
        ),
        can_delete_prefixes as (
             SELECT prefix
             FROM all_prefixes
             WHERE NOT EXISTS (
                 SELECT 1 FROM "storage"."objects"
                 WHERE "bucket_id" = OLD."bucket_id"
                   AND "name" <> OLD."name"
                   AND "name" LIKE (prefix || '%')
             )
         )
        DELETE FROM "storage"."prefixes" WHERE name IN (SELECT prefix FROM can_delete_prefixes);

        -- Add new prefixes
        PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    END IF;
    -- Set the new level
    NEW."level" := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- TOC entry 553 (class 1255 OID 17200)
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- TOC entry 708 (class 1255 OID 17294)
-- Name: prefixes_delete_cleanup(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_delete_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_bucket_ids text[];
    v_names      text[];
BEGIN
    IF current_setting('storage.gc.prefixes', true) = '1' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('storage.gc.prefixes', '1', true);

    SELECT COALESCE(array_agg(d.bucket_id), '{}'),
           COALESCE(array_agg(d.name), '{}')
    INTO v_bucket_ids, v_names
    FROM deleted AS d
    WHERE d.name <> '';

    PERFORM storage.lock_top_prefixes(v_bucket_ids, v_names);
    PERFORM storage.delete_leaf_prefixes(v_bucket_ids, v_names);

    RETURN NULL;
END;
$$;


--
-- TOC entry 664 (class 1255 OID 17221)
-- Name: prefixes_insert_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_insert_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    RETURN NEW;
END;
$$;


--
-- TOC entry 681 (class 1255 OID 17134)
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
declare
    can_bypass_rls BOOLEAN;
begin
    SELECT rolbypassrls
    INTO can_bypass_rls
    FROM pg_roles
    WHERE rolname = coalesce(nullif(current_setting('role', true), 'none'), current_user);

    IF can_bypass_rls THEN
        RETURN QUERY SELECT * FROM storage.search_v1_optimised(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    ELSE
        RETURN QUERY SELECT * FROM storage.search_legacy_v1(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    END IF;
end;
$$;


--
-- TOC entry 731 (class 1255 OID 17265)
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- TOC entry 670 (class 1255 OID 17264)
-- Name: search_v1_optimised(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v1_optimised(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select (string_to_array(name, ''/''))[level] as name
           from storage.prefixes
             where lower(prefixes.name) like lower($2 || $3) || ''%''
               and bucket_id = $4
               and level = $1
           order by name ' || v_sort_order || '
     )
     (select name,
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[level] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where lower(objects.name) like lower($2 || $3) || ''%''
       and bucket_id = $4
       and level = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- TOC entry 739 (class 1255 OID 17289)
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    sort_col text;
    sort_ord text;
    cursor_op text;
    cursor_expr text;
    sort_expr text;
BEGIN
    -- Validate sort_order
    sort_ord := lower(sort_order);
    IF sort_ord NOT IN ('asc', 'desc') THEN
        sort_ord := 'asc';
    END IF;

    -- Determine cursor comparison operator
    IF sort_ord = 'asc' THEN
        cursor_op := '>';
    ELSE
        cursor_op := '<';
    END IF;
    
    sort_col := lower(sort_column);
    -- Validate sort column  
    IF sort_col IN ('updated_at', 'created_at') THEN
        cursor_expr := format(
            '($5 = '''' OR ROW(date_trunc(''milliseconds'', %I), name COLLATE "C") %s ROW(COALESCE(NULLIF($6, '''')::timestamptz, ''epoch''::timestamptz), $5))',
            sort_col, cursor_op
        );
        sort_expr := format(
            'COALESCE(date_trunc(''milliseconds'', %I), ''epoch''::timestamptz) %s, name COLLATE "C" %s',
            sort_col, sort_ord, sort_ord
        );
    ELSE
        cursor_expr := format('($5 = '''' OR name COLLATE "C" %s $5)', cursor_op);
        sort_expr := format('name COLLATE "C" %s', sort_ord);
    END IF;

    RETURN QUERY EXECUTE format(
        $sql$
        SELECT * FROM (
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name,
                    NULL::uuid AS id,
                    updated_at,
                    created_at,
                    NULL::timestamptz AS last_accessed_at,
                    NULL::jsonb AS metadata
                FROM storage.prefixes
                WHERE name COLLATE "C" LIKE $1 || '%%'
                    AND bucket_id = $2
                    AND level = $4
                    AND %s
                ORDER BY %s
                LIMIT $3
            )
            UNION ALL
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name,
                    id,
                    updated_at,
                    created_at,
                    last_accessed_at,
                    metadata
                FROM storage.objects
                WHERE name COLLATE "C" LIKE $1 || '%%'
                    AND bucket_id = $2
                    AND level = $4
                    AND %s
                ORDER BY %s
                LIMIT $3
            )
        ) obj
        ORDER BY %s
        LIMIT $3
        $sql$,
        cursor_expr,    -- prefixes WHERE
        sort_expr,      -- prefixes ORDER BY
        cursor_expr,    -- objects WHERE
        sort_expr,      -- objects ORDER BY
        sort_expr       -- final ORDER BY
    )
    USING prefix, bucket_name, limits, levels, start_after, sort_column_after;
END;
$_$;


--
-- TOC entry 527 (class 1255 OID 17135)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


--
-- TOC entry 397 (class 1259 OID 18705)
-- Name: extensions; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.extensions (
    id uuid NOT NULL,
    type text,
    settings jsonb,
    tenant_external_id text,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL
);


--
-- TOC entry 398 (class 1259 OID 18710)
-- Name: schema_migrations; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- TOC entry 399 (class 1259 OID 18713)
-- Name: tenants; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.tenants (
    id uuid NOT NULL,
    name text,
    external_id text,
    jwt_secret text,
    max_concurrent_users integer DEFAULT 200 NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    max_events_per_second integer DEFAULT 100 NOT NULL,
    postgres_cdc_default text DEFAULT 'postgres_cdc_rls'::text,
    max_bytes_per_second integer DEFAULT 100000 NOT NULL,
    max_channels_per_client integer DEFAULT 100 NOT NULL,
    max_joins_per_second integer DEFAULT 500 NOT NULL,
    suspend boolean DEFAULT false,
    jwt_jwks jsonb,
    notify_private_alpha boolean DEFAULT false,
    private_only boolean DEFAULT false NOT NULL,
    migrations_ran integer DEFAULT 0,
    broadcast_adapter character varying(255) DEFAULT 'gen_rpc'::character varying,
    max_presence_events_per_second integer DEFAULT 1000,
    max_payload_size_in_kb integer DEFAULT 3000
);


--
-- TOC entry 362 (class 1259 OID 16525)
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- TOC entry 5572 (class 0 OID 0)
-- Dependencies: 362
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- TOC entry 379 (class 1259 OID 16929)
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- TOC entry 5573 (class 0 OID 0)
-- Dependencies: 379
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- TOC entry 370 (class 1259 OID 16727)
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 5574 (class 0 OID 0)
-- Dependencies: 370
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- TOC entry 5575 (class 0 OID 0)
-- Dependencies: 370
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- TOC entry 361 (class 1259 OID 16518)
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- TOC entry 5576 (class 0 OID 0)
-- Dependencies: 361
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- TOC entry 374 (class 1259 OID 16816)
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- TOC entry 5577 (class 0 OID 0)
-- Dependencies: 374
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- TOC entry 373 (class 1259 OID 16804)
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- TOC entry 5578 (class 0 OID 0)
-- Dependencies: 373
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- TOC entry 372 (class 1259 OID 16791)
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- TOC entry 5579 (class 0 OID 0)
-- Dependencies: 372
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- TOC entry 5580 (class 0 OID 0)
-- Dependencies: 372
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- TOC entry 382 (class 1259 OID 17041)
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- TOC entry 421 (class 1259 OID 47534)
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- TOC entry 5581 (class 0 OID 0)
-- Dependencies: 421
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- TOC entry 381 (class 1259 OID 17011)
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- TOC entry 383 (class 1259 OID 17074)
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- TOC entry 380 (class 1259 OID 16979)
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- TOC entry 360 (class 1259 OID 16507)
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- TOC entry 5582 (class 0 OID 0)
-- Dependencies: 360
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- TOC entry 359 (class 1259 OID 16506)
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5583 (class 0 OID 0)
-- Dependencies: 359
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- TOC entry 377 (class 1259 OID 16858)
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- TOC entry 5584 (class 0 OID 0)
-- Dependencies: 377
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- TOC entry 378 (class 1259 OID 16876)
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- TOC entry 5585 (class 0 OID 0)
-- Dependencies: 378
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- TOC entry 363 (class 1259 OID 16533)
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- TOC entry 5586 (class 0 OID 0)
-- Dependencies: 363
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- TOC entry 371 (class 1259 OID 16757)
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- TOC entry 5587 (class 0 OID 0)
-- Dependencies: 371
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- TOC entry 5588 (class 0 OID 0)
-- Dependencies: 371
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- TOC entry 5589 (class 0 OID 0)
-- Dependencies: 371
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- TOC entry 5590 (class 0 OID 0)
-- Dependencies: 371
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- TOC entry 376 (class 1259 OID 16843)
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- TOC entry 5591 (class 0 OID 0)
-- Dependencies: 376
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- TOC entry 375 (class 1259 OID 16834)
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- TOC entry 5592 (class 0 OID 0)
-- Dependencies: 375
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- TOC entry 5593 (class 0 OID 0)
-- Dependencies: 375
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- TOC entry 358 (class 1259 OID 16495)
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- TOC entry 5594 (class 0 OID 0)
-- Dependencies: 358
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- TOC entry 5595 (class 0 OID 0)
-- Dependencies: 358
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- TOC entry 467 (class 1259 OID 94090)
-- Name: ai_embeddings_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_embeddings_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    model text NOT NULL,
    text_hash text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 461 (class 1259 OID 93977)
-- Name: ai_turn_traces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_turn_traces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    request_id text,
    channel text,
    caller_type text,
    input_message_id uuid,
    output_message_id uuid,
    user_text text,
    intent text,
    workflow_id uuid,
    kb_used boolean DEFAULT false NOT NULL,
    kb_reason text,
    kb_threshold numeric,
    kb_top_score numeric,
    kb_chunks jsonb DEFAULT '[]'::jsonb NOT NULL,
    model_provider text,
    model_name text,
    prompt_hash text,
    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    estimated_cost_usd numeric,
    decision jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_stage text,
    error jsonb,
    status text DEFAULT 'started'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);


--
-- TOC entry 464 (class 1259 OID 94070)
-- Name: ai_failures_last_24h_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_failures_last_24h_view AS
 SELECT id,
    organization_id,
    conversation_id,
    request_id,
    channel,
    caller_type,
    input_message_id,
    output_message_id,
    user_text,
    intent,
    workflow_id,
    kb_used,
    kb_reason,
    kb_threshold,
    kb_top_score,
    kb_chunks,
    model_provider,
    model_name,
    prompt_hash,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    estimated_cost_usd,
    decision,
    error_stage,
    error,
    status,
    started_at,
    finished_at
   FROM public.ai_turn_traces
  WHERE ((started_at >= (now() - '24:00:00'::interval)) AND (status = 'failed'::text))
  ORDER BY started_at DESC;


--
-- TOC entry 469 (class 1259 OID 94122)
-- Name: ai_org_rate_limit_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_org_rate_limit_usage (
    organization_id uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    token_count integer DEFAULT 0 NOT NULL
);


--
-- TOC entry 468 (class 1259 OID 94107)
-- Name: ai_org_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_org_rate_limits (
    organization_id uuid NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    window_seconds integer DEFAULT 60 NOT NULL,
    max_requests integer DEFAULT 120 NOT NULL,
    max_tokens integer DEFAULT 60000 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 428 (class 1259 OID 63775)
-- Name: ai_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    ai_enabled boolean DEFAULT true NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    kb_search_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_settings_kb_search_type_check CHECK ((kb_search_type = ANY (ARRAY['default'::text, 'hybrid'::text, 'title'::text]))),
    CONSTRAINT ai_settings_provider_check CHECK ((provider = ANY (ARRAY['openai'::text, 'gemini'::text])))
);


--
-- TOC entry 429 (class 1259 OID 63804)
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid,
    message_id uuid,
    provider text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    estimated_cost numeric(10,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    charged_amount numeric(10,4) DEFAULT 0 NOT NULL,
    wallet_transaction_id uuid
);


--
-- TOC entry 435 (class 1259 OID 74279)
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    actor_user_id uuid,
    actor_email text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    before_state jsonb,
    after_state jsonb,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 400 (class 1259 OID 18731)
-- Name: bot_instructions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_instructions (
    organization_id uuid NOT NULL,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 401 (class 1259 OID 18739)
-- Name: bot_personality; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_personality (
    organization_id uuid NOT NULL,
    tone text DEFAULT 'Professional'::text NOT NULL,
    language text DEFAULT 'English'::text NOT NULL,
    short_responses boolean DEFAULT false,
    emoji_usage boolean DEFAULT true,
    gender_voice text DEFAULT 'Neutral'::text NOT NULL,
    fallback_message text DEFAULT 'Let me connect you with an advisor.'::text NOT NULL,
    business_context text,
    dos text,
    donts text,
    greeting_message text,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 403 (class 1259 OID 18758)
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    status public.campaign_status DEFAULT 'draft'::public.campaign_status NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    template_body text NOT NULL,
    template_variables text[],
    total_recipients integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    template_name text,
    whatsapp_template_id uuid,
    launched_at timestamp with time zone,
    variable_mapping jsonb DEFAULT '{}'::jsonb,
    campaign_kind text,
    parent_campaign_id uuid,
    reply_sheet_tab text,
    meta jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT campaigns_campaign_kind_check CHECK ((campaign_kind = ANY (ARRAY['general'::text, 'psf_initial'::text, 'psf_reminder'::text])))
);


--
-- TOC entry 5596 (class 0 OID 0)
-- Dependencies: 403
-- Name: COLUMN campaigns.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaigns.status IS 'draft | scheduled | sending | completed | failed';


--
-- TOC entry 5597 (class 0 OID 0)
-- Dependencies: 403
-- Name: COLUMN campaigns.launched_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaigns.launched_at IS 'Timestamp when campaign was manually launched (Launch Now)';


--
-- TOC entry 5598 (class 0 OID 0)
-- Dependencies: 403
-- Name: COLUMN campaigns.variable_mapping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaigns.variable_mapping IS 'Maps WhatsApp template variables to contact fields. Example: { "1": "first_name", "2": "model" }';


--
-- TOC entry 439 (class 1259 OID 78875)
-- Name: campaign_analytics_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_analytics_summary AS
 SELECT c.organization_id,
    c.id AS campaign_id,
    count(cm.id) AS total_messages,
    count(DISTINCT cm.contact_id) AS total_contacts
   FROM (public.campaigns c
     LEFT JOIN public.campaign_messages cm ON ((cm.campaign_id = c.id)))
  GROUP BY c.organization_id, c.id;


--
-- TOC entry 440 (class 1259 OID 78880)
-- Name: campaign_analytics_summary_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_analytics_summary_v2 AS
 SELECT organization_id,
    campaign_id,
    total_messages,
    total_contacts
   FROM public.campaign_analytics_summary;


--
-- TOC entry 426 (class 1259 OID 57900)
-- Name: campaign_delivery_import; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_delivery_import (
    phone text,
    campaign_name text
);


--
-- TOC entry 447 (class 1259 OID 80233)
-- Name: campaign_delivery_receipt_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_delivery_receipt_failures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    whatsapp_message_id text,
    status text,
    error_title text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_status jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_value jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- TOC entry 436 (class 1259 OID 74295)
-- Name: campaign_message_status_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.campaign_message_status_summary AS
 SELECT campaign_id,
    (count(*))::integer AS total,
    (count(*) FILTER (WHERE (status = 'pending'::public.campaign_message_status)))::integer AS pending_count,
    (count(*) FILTER (WHERE (status = 'queued'::public.campaign_message_status)))::integer AS queued_count,
    (count(*) FILTER (WHERE (status = 'sent'::public.campaign_message_status)))::integer AS sent_count,
    (count(*) FILTER (WHERE (status = 'delivered'::public.campaign_message_status)))::integer AS delivered_count,
    (count(*) FILTER (WHERE (status = 'failed'::public.campaign_message_status)))::integer AS failed_count,
    (count(*) FILTER (WHERE (status = 'cancelled'::public.campaign_message_status)))::integer AS cancelled_count,
    max(dispatched_at) AS last_dispatched_at,
    max(delivered_at) AS last_delivered_at
   FROM public.campaign_messages cm
  GROUP BY campaign_id;


--
-- TOC entry 404 (class 1259 OID 18771)
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    phone text NOT NULL,
    name text,
    labels jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    first_name text,
    last_name text,
    model text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- TOC entry 423 (class 1259 OID 52707)
-- Name: contact_campaign_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.contact_campaign_summary WITH (security_invoker='on') AS
 SELECT ct.id AS contact_id,
    ct.organization_id,
    ct.first_name,
    ct.last_name,
    ct.phone,
    ct.model,
    COALESCE(array_remove(array_agg(DISTINCT COALESCE(c.template_name, c.name)) FILTER (WHERE (cm.status = 'delivered'::public.campaign_message_status)), NULL::text), '{}'::text[]) AS delivered_campaigns,
    COALESCE(array_remove(array_agg(DISTINCT COALESCE(c.template_name, c.name)) FILTER (WHERE (cm.status = 'failed'::public.campaign_message_status)), NULL::text), '{}'::text[]) AS failed_campaigns
   FROM ((public.contacts ct
     LEFT JOIN public.campaign_messages cm ON (((cm.organization_id = ct.organization_id) AND (cm.phone = ct.phone))))
     LEFT JOIN public.campaigns c ON (((c.id = cm.campaign_id) AND (c.organization_id = ct.organization_id))))
  GROUP BY ct.id, ct.organization_id, ct.first_name, ct.last_name, ct.phone, ct.model;


--
-- TOC entry 424 (class 1259 OID 52732)
-- Name: contact_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    file_name text,
    inserted_count integer,
    updated_count integer,
    skipped_count integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 425 (class 1259 OID 55014)
-- Name: conversation_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_state (
    conversation_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    current_step integer DEFAULT 1 NOT NULL,
    variables jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_step_reason text,
    updated_at timestamp with time zone DEFAULT now(),
    organization_id uuid NOT NULL
);


--
-- TOC entry 405 (class 1259 OID 18779)
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    contact_id uuid,
    assigned_to uuid,
    ai_enabled boolean DEFAULT true,
    channel text DEFAULT 'web'::text NOT NULL,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    whatsapp_user_phone text,
    intent text,
    intent_source text DEFAULT 'ai'::text,
    intent_update_count integer DEFAULT 0 NOT NULL,
    ai_summary text,
    ai_last_entities jsonb,
    ai_context_updated_at timestamp with time zone,
    ai_mode text DEFAULT 'auto'::text,
    ai_locked boolean DEFAULT false NOT NULL,
    ai_locked_by uuid,
    ai_locked_at timestamp with time zone,
    ai_lock_reason text,
    ai_locked_until timestamp with time zone,
    campaign_id uuid,
    workflow_id uuid,
    campaign_context jsonb DEFAULT '{}'::jsonb,
    campaign_reply_sheet_tab text,
    CONSTRAINT conversations_ai_mode_check CHECK ((ai_mode = ANY (ARRAY['auto'::text, 'suggest'::text, 'off'::text]))),
    CONSTRAINT conversations_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'whatsapp'::text, 'internal'::text])))
);


--
-- TOC entry 5599 (class 0 OID 0)
-- Dependencies: 405
-- Name: COLUMN conversations.intent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.intent IS 'AI classified intent: sales | service | finance | accessories | general';


--
-- TOC entry 5600 (class 0 OID 0)
-- Dependencies: 405
-- Name: COLUMN conversations.intent_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.intent_source IS 'ai | manual';


--
-- TOC entry 5601 (class 0 OID 0)
-- Dependencies: 405
-- Name: COLUMN conversations.intent_update_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.intent_update_count IS 'How many times intent was updated by AI (caps intent churn).';


--
-- TOC entry 462 (class 1259 OID 94019)
-- Name: message_delivery_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_delivery_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    message_id uuid,
    campaign_message_id uuid,
    event_type text NOT NULL,
    source text NOT NULL,
    event_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- TOC entry 465 (class 1259 OID 94075)
-- Name: delivery_failures_last_24h_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.delivery_failures_last_24h_view AS
 SELECT id,
    organization_id,
    message_id,
    campaign_message_id,
    event_type,
    source,
    event_at,
    payload
   FROM public.message_delivery_events
  WHERE ((event_at >= (now() - '24:00:00'::interval)) AND (event_type = 'failed'::text))
  ORDER BY event_at DESC;


--
-- TOC entry 444 (class 1259 OID 78897)
-- Name: failure_reason_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.failure_reason_summary AS
 SELECT organization_id,
    'unknown'::text AS failure_reason,
    count(*) AS total
   FROM public.campaigns c
  GROUP BY organization_id;


--
-- TOC entry 406 (class 1259 OID 18789)
-- Name: knowledge_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    source_type text DEFAULT 'text'::text NOT NULL,
    source_filename text,
    raw_content text,
    last_processed_at timestamp with time zone,
    processing_error text,
    file_bucket text,
    file_path text,
    mime_type text,
    original_filename text,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'draft'::text,
    published_at timestamp with time zone,
    updated_by uuid,
    processing_status text,
    file_mime_type text,
    CONSTRAINT knowledge_articles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- TOC entry 420 (class 1259 OID 42854)
-- Name: knowledge_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    chunk text NOT NULL,
    embedding public.vector(1536) NOT NULL,
    chunk_index integer DEFAULT 0 NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 460 (class 1259 OID 92855)
-- Name: message_delivery_dlq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_delivery_dlq (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    source text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    reason text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 407 (class 1259 OID 18797)
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    sender public.message_sender NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    text text,
    media_url text,
    channel text DEFAULT 'web'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    mime_type text,
    whatsapp_message_id text,
    wa_received_at timestamp with time zone,
    campaign_id uuid,
    campaign_message_id uuid,
    outbound_dedupe_key text,
    whatsapp_status text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    metadata jsonb,
    organization_id uuid NOT NULL,
    order_at timestamp with time zone,
    CONSTRAINT messages_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'whatsapp'::text, 'internal'::text])))
);


--
-- TOC entry 443 (class 1259 OID 78893)
-- Name: model_analytics_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.model_analytics_summary AS
 SELECT organization_id,
    count(*) AS total_campaigns
   FROM public.campaigns
  GROUP BY organization_id;


--
-- TOC entry 408 (class 1259 OID 18807)
-- Name: organization_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'agent'::text,
    created_at timestamp with time zone DEFAULT now(),
    is_primary boolean DEFAULT true,
    last_active_at timestamp with time zone,
    CONSTRAINT organization_users_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'agent'::text])))
);


--
-- TOC entry 409 (class 1259 OID 18816)
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    logo_url text,
    type text,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    google_sheet_id text,
    CONSTRAINT organizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))
);


--
-- TOC entry 437 (class 1259 OID 77676)
-- Name: psf_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.psf_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    conversation_id uuid,
    phone text NOT NULL,
    uploaded_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    initial_sent_at timestamp with time zone,
    reminder_sent_at timestamp with time zone,
    last_customer_reply_at timestamp with time zone,
    sentiment text,
    ai_summary text,
    action_required boolean DEFAULT false NOT NULL,
    resolution_status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_name text,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    reminder_count integer DEFAULT 0 NOT NULL,
    last_reminder_at timestamp with time zone,
    first_customer_reply_at timestamp with time zone,
    model text,
    CONSTRAINT psf_cases_resolution_status_check CHECK ((resolution_status = ANY (ARRAY['open'::text, 'resolved'::text]))),
    CONSTRAINT psf_cases_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text])))
);


--
-- TOC entry 446 (class 1259 OID 79077)
-- Name: psf_cases_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.psf_cases_view WITH (security_invoker='true') AS
 SELECT pc.id,
    pc.organization_id,
    pc.phone,
    pc.customer_name,
    pc.uploaded_data,
    pc.sentiment,
    pc.ai_summary,
    pc.action_required,
    pc.resolution_status,
    pc.resolved_at,
    pc.reminder_count,
    pc.last_reminder_at,
    pc.initial_sent_at,
    pc.first_customer_reply_at,
    pc.last_customer_reply_at,
    pc.created_at,
    c.id AS conversation_id,
    c.channel,
    c.last_message_at
   FROM (public.psf_cases pc
     LEFT JOIN public.conversations c ON ((c.id = pc.conversation_id)));


--
-- TOC entry 433 (class 1259 OID 74205)
-- Name: razorpay_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.razorpay_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    amount_paise integer NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    receipt text NOT NULL,
    status text DEFAULT 'created'::text NOT NULL,
    razorpay_order_id text NOT NULL,
    notes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT razorpay_orders_amount_paise_check CHECK ((amount_paise > 0))
);


--
-- TOC entry 434 (class 1259 OID 74234)
-- Name: razorpay_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.razorpay_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    razorpay_order_id text NOT NULL,
    razorpay_payment_id text NOT NULL,
    amount_paise integer NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status text NOT NULL,
    raw_event jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT razorpay_payments_amount_paise_check CHECK ((amount_paise > 0))
);


--
-- TOC entry 463 (class 1259 OID 94049)
-- Name: replay_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.replay_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    requested_by uuid DEFAULT auth.uid(),
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    last_error text,
    result jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- TOC entry 466 (class 1259 OID 94079)
-- Name: stuck_campaign_messages_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stuck_campaign_messages_view AS
 SELECT id,
    organization_id,
    campaign_id,
    contact_id,
    phone,
    variables,
    status,
    error,
    whatsapp_message_id,
    dispatched_at,
    delivered_at,
    created_at,
    replied_at,
    reply_whatsapp_message_id,
    reply_text,
    rendered_text,
    raw_row,
    send_attempts,
    next_retry_at,
    locked_at,
    locked_by,
    last_attempt_at
   FROM public.campaign_messages cm
  WHERE ((status = ANY (ARRAY['pending'::public.campaign_message_status, 'queued'::public.campaign_message_status])) AND (((locked_at IS NOT NULL) AND (locked_at < (now() - '00:10:00'::interval))) OR ((next_retry_at IS NOT NULL) AND (next_retry_at < (now() - '00:10:00'::interval)))))
  ORDER BY created_at;


--
-- TOC entry 441 (class 1259 OID 78884)
-- Name: template_analytics_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.template_analytics_summary AS
 SELECT c.organization_id,
    c.whatsapp_template_id,
    count(cm.id) AS total_messages
   FROM (public.campaigns c
     JOIN public.campaign_messages cm ON ((cm.campaign_id = c.id)))
  GROUP BY c.organization_id, c.whatsapp_template_id;


--
-- TOC entry 442 (class 1259 OID 78889)
-- Name: template_analytics_summary_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.template_analytics_summary_v2 AS
 SELECT organization_id,
    whatsapp_template_id,
    total_messages
   FROM public.template_analytics_summary;


--
-- TOC entry 410 (class 1259 OID 18823)
-- Name: unanswered_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unanswered_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    question text NOT NULL,
    occurrences integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    conversation_id uuid,
    channel text,
    status text DEFAULT 'open'::text NOT NULL,
    ai_response text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolution_article_id uuid,
    resolved_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT unanswered_status_check CHECK ((status = ANY (ARRAY['open'::text, 'answered'::text, 'ignored'::text])))
);


--
-- TOC entry 445 (class 1259 OID 78911)
-- Name: user_active_organization; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_active_organization AS
 SELECT DISTINCT ON (ou.user_id) ou.user_id,
    ou.organization_id,
    o.name,
    COALESCE(ou.last_active_at, ou.created_at) AS active_at
   FROM (public.organization_users ou
     JOIN public.organizations o ON ((o.id = ou.organization_id)))
  ORDER BY ou.user_id, COALESCE(ou.last_active_at, ou.created_at) DESC;


--
-- TOC entry 432 (class 1259 OID 63911)
-- Name: wallet_alert_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_alert_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    alert_type text NOT NULL,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_alert_logs_alert_type_check CHECK ((alert_type = ANY (ARRAY['low'::text, 'critical'::text, 'inactive'::text])))
);


--
-- TOC entry 431 (class 1259 OID 63868)
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL,
    type text NOT NULL,
    direction text NOT NULL,
    amount numeric(12,4) NOT NULL,
    reference_type text,
    reference_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    purpose text DEFAULT 'ai_chat'::text NOT NULL,
    created_by uuid,
    created_by_role text DEFAULT 'system'::text NOT NULL,
    balance_before numeric(12,4),
    balance_after numeric(12,4),
    organization_id uuid NOT NULL,
    CONSTRAINT wallet_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT wallet_transactions_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT wallet_transactions_type_check CHECK ((type = ANY (ARRAY['credit'::text, 'debit'::text, 'adjustment'::text]))),
    CONSTRAINT wallet_txn_debit_requires_reference CHECK (((type <> 'debit'::text) OR ((reference_type = ANY (ARRAY['ai_usage'::text, 'campaign'::text, 'voice'::text])) AND (reference_id IS NOT NULL)))),
    CONSTRAINT wallet_txn_type_direction_check CHECK ((((type = 'credit'::text) AND (direction = 'in'::text)) OR ((type = 'debit'::text) AND (direction = 'out'::text)) OR ((type = 'adjustment'::text) AND (direction = ANY (ARRAY['in'::text, 'out'::text])))))
);


--
-- TOC entry 430 (class 1259 OID 63844)
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    balance numeric(12,4) DEFAULT 0 NOT NULL,
    total_credited numeric(12,4) DEFAULT 0 NOT NULL,
    total_debited numeric(12,4) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    low_balance_threshold numeric DEFAULT 50,
    critical_balance_threshold numeric DEFAULT 10,
    CONSTRAINT wallet_threshold_sanity_check CHECK ((critical_balance_threshold <= low_balance_threshold)),
    CONSTRAINT wallets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);


--
-- TOC entry 422 (class 1259 OID 50952)
-- Name: whatsapp_bulk_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_bulk_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    template text NOT NULL,
    status text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    organization_id uuid NOT NULL
);


--
-- TOC entry 438 (class 1259 OID 78870)
-- Name: whatsapp_overview_daily_v1; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_overview_daily_v1 AS
 SELECT c.organization_id,
    date_trunc('day'::text, m.created_at) AS day,
    count(*) AS total_messages,
    count(DISTINCT c.id) AS total_conversations,
    count(DISTINCT c.contact_id) AS total_contacts
   FROM (public.conversations c
     JOIN public.messages m ON ((m.conversation_id = c.id)))
  GROUP BY c.organization_id, (date_trunc('day'::text, m.created_at));


--
-- TOC entry 411 (class 1259 OID 18831)
-- Name: whatsapp_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    phone_number text,
    api_token text,
    verify_token text,
    whatsapp_phone_id text,
    whatsapp_business_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 427 (class 1259 OID 59183)
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'MARKETING'::text,
    language text DEFAULT 'en'::text,
    header_type text,
    header_text text,
    body text,
    footer text,
    status text DEFAULT 'draft'::text NOT NULL,
    meta_template_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    header_media_url text,
    header_media_mime text,
    header_variable_count integer DEFAULT 0 NOT NULL,
    header_variable_indices integer[],
    body_variable_count integer DEFAULT 0 NOT NULL,
    body_variable_indices integer[],
    CONSTRAINT whatsapp_templates_body_var_check CHECK ((((body_variable_count = 0) AND (body_variable_indices IS NULL)) OR ((body_variable_count > 0) AND (cardinality(body_variable_indices) = body_variable_count)))),
    CONSTRAINT whatsapp_templates_header_var_check CHECK ((((header_variable_count = 0) AND (header_variable_indices IS NULL)) OR ((header_variable_count > 0) AND (cardinality(header_variable_indices) = header_variable_count))))
);


--
-- TOC entry 412 (class 1259 OID 18840)
-- Name: workflow_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid,
    conversation_id uuid,
    step_id uuid,
    data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    current_step_number integer,
    variables jsonb DEFAULT '{}'::jsonb,
    completed boolean DEFAULT false NOT NULL,
    organization_id uuid NOT NULL
);


--
-- TOC entry 413 (class 1259 OID 18847)
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid,
    step_order integer NOT NULL,
    action jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    instruction_text text,
    expected_user_input text,
    ai_action text DEFAULT 'give_information'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    organization_id uuid NOT NULL,
    CONSTRAINT workflow_steps_ai_action_check CHECK ((ai_action = ANY (ARRAY['ask_question'::text, 'give_information'::text, 'use_knowledge_base'::text, 'save_user_response'::text, 'branch'::text, 'end'::text])))
);


--
-- TOC entry 414 (class 1259 OID 18854)
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    name text NOT NULL,
    description text,
    trigger jsonb,
    created_at timestamp with time zone DEFAULT now(),
    mode text DEFAULT 'strict'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    trigger_type text DEFAULT 'keyword'::text NOT NULL,
    CONSTRAINT workflows_mode_check CHECK ((mode = ANY (ARRAY['strict'::text, 'smart'::text]))),
    CONSTRAINT workflows_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['keyword'::text, 'intent'::text, 'always'::text])))
);


--
-- TOC entry 415 (class 1259 OID 18861)
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- TOC entry 471 (class 1259 OID 110950)
-- Name: messages_2026_02_04; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_04 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 472 (class 1259 OID 112130)
-- Name: messages_2026_02_05; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_05 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 473 (class 1259 OID 113563)
-- Name: messages_2026_02_06; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_06 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 474 (class 1259 OID 115556)
-- Name: messages_2026_02_07; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_07 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 475 (class 1259 OID 116976)
-- Name: messages_2026_02_08; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_08 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 476 (class 1259 OID 118096)
-- Name: messages_2026_02_09; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_09 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 477 (class 1259 OID 119219)
-- Name: messages_2026_02_10; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_10 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 478 (class 1259 OID 121438)
-- Name: messages_2026_02_11; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_11 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 479 (class 1259 OID 121450)
-- Name: messages_2026_02_12; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_12 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- TOC entry 384 (class 1259 OID 17112)
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- TOC entry 390 (class 1259 OID 17247)
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- TOC entry 389 (class 1259 OID 17246)
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 364 (class 1259 OID 16546)
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- TOC entry 5602 (class 0 OID 0)
-- Dependencies: 364
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- TOC entry 391 (class 1259 OID 17278)
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- TOC entry 392 (class 1259 OID 17305)
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 366 (class 1259 OID 16588)
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- TOC entry 365 (class 1259 OID 16561)
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    level integer
);


--
-- TOC entry 5603 (class 0 OID 0)
-- Dependencies: 365
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- TOC entry 387 (class 1259 OID 17202)
-- Name: prefixes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.prefixes (
    bucket_id text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    level integer GENERATED ALWAYS AS (storage.get_level(name)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 385 (class 1259 OID 17149)
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- TOC entry 386 (class 1259 OID 17163)
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 393 (class 1259 OID 17315)
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 416 (class 1259 OID 18931)
-- Name: hooks; Type: TABLE; Schema: supabase_functions; Owner: -
--

CREATE TABLE supabase_functions.hooks (
    id bigint NOT NULL,
    hook_table_id integer NOT NULL,
    hook_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id bigint
);


--
-- TOC entry 5604 (class 0 OID 0)
-- Dependencies: 416
-- Name: TABLE hooks; Type: COMMENT; Schema: supabase_functions; Owner: -
--

COMMENT ON TABLE supabase_functions.hooks IS 'Supabase Functions Hooks: Audit trail for triggered hooks.';


--
-- TOC entry 417 (class 1259 OID 18937)
-- Name: hooks_id_seq; Type: SEQUENCE; Schema: supabase_functions; Owner: -
--

CREATE SEQUENCE supabase_functions.hooks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5605 (class 0 OID 0)
-- Dependencies: 417
-- Name: hooks_id_seq; Type: SEQUENCE OWNED BY; Schema: supabase_functions; Owner: -
--

ALTER SEQUENCE supabase_functions.hooks_id_seq OWNED BY supabase_functions.hooks.id;


--
-- TOC entry 418 (class 1259 OID 18938)
-- Name: migrations; Type: TABLE; Schema: supabase_functions; Owner: -
--

CREATE TABLE supabase_functions.migrations (
    version text NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 419 (class 1259 OID 18944)
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


--
-- TOC entry 396 (class 1259 OID 17497)
-- Name: seed_files; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.seed_files (
    path text NOT NULL,
    hash text NOT NULL
);


--
-- TOC entry 4310 (class 0 OID 0)
-- Name: messages_2026_02_04; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_04 FOR VALUES FROM ('2026-02-04 00:00:00') TO ('2026-02-05 00:00:00');


--
-- TOC entry 4311 (class 0 OID 0)
-- Name: messages_2026_02_05; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_05 FOR VALUES FROM ('2026-02-05 00:00:00') TO ('2026-02-06 00:00:00');


--
-- TOC entry 4312 (class 0 OID 0)
-- Name: messages_2026_02_06; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_06 FOR VALUES FROM ('2026-02-06 00:00:00') TO ('2026-02-07 00:00:00');


--
-- TOC entry 4313 (class 0 OID 0)
-- Name: messages_2026_02_07; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_07 FOR VALUES FROM ('2026-02-07 00:00:00') TO ('2026-02-08 00:00:00');


--
-- TOC entry 4314 (class 0 OID 0)
-- Name: messages_2026_02_08; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_08 FOR VALUES FROM ('2026-02-08 00:00:00') TO ('2026-02-09 00:00:00');


--
-- TOC entry 4315 (class 0 OID 0)
-- Name: messages_2026_02_09; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_09 FOR VALUES FROM ('2026-02-09 00:00:00') TO ('2026-02-10 00:00:00');


--
-- TOC entry 4316 (class 0 OID 0)
-- Name: messages_2026_02_10; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_10 FOR VALUES FROM ('2026-02-10 00:00:00') TO ('2026-02-11 00:00:00');


--
-- TOC entry 4317 (class 0 OID 0)
-- Name: messages_2026_02_11; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_11 FOR VALUES FROM ('2026-02-11 00:00:00') TO ('2026-02-12 00:00:00');


--
-- TOC entry 4318 (class 0 OID 0)
-- Name: messages_2026_02_12; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_12 FOR VALUES FROM ('2026-02-12 00:00:00') TO ('2026-02-13 00:00:00');


--
-- TOC entry 4328 (class 2604 OID 16510)
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- TOC entry 4476 (class 2604 OID 18949)
-- Name: hooks id; Type: DEFAULT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.hooks ALTER COLUMN id SET DEFAULT nextval('supabase_functions.hooks_id_seq'::regclass);


--
-- TOC entry 4826 (class 2606 OID 18952)
-- Name: extensions extensions_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.extensions
    ADD CONSTRAINT extensions_pkey PRIMARY KEY (id);


--
-- TOC entry 4830 (class 2606 OID 18954)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 4833 (class 2606 OID 18956)
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- TOC entry 4753 (class 2606 OID 16829)
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- TOC entry 4707 (class 2606 OID 16531)
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- TOC entry 4776 (class 2606 OID 16935)
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- TOC entry 4731 (class 2606 OID 16953)
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- TOC entry 4733 (class 2606 OID 16963)
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- TOC entry 4705 (class 2606 OID 16524)
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- TOC entry 4755 (class 2606 OID 16822)
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- TOC entry 4751 (class 2606 OID 16810)
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- TOC entry 4743 (class 2606 OID 17003)
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- TOC entry 4745 (class 2606 OID 16797)
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- TOC entry 4789 (class 2606 OID 17062)
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- TOC entry 4791 (class 2606 OID 17060)
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- TOC entry 4793 (class 2606 OID 17058)
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- TOC entry 4944 (class 2606 OID 47540)
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- TOC entry 4786 (class 2606 OID 17022)
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- TOC entry 4797 (class 2606 OID 17084)
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- TOC entry 4799 (class 2606 OID 17086)
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- TOC entry 4780 (class 2606 OID 16988)
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 4699 (class 2606 OID 16514)
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 4702 (class 2606 OID 16740)
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- TOC entry 4765 (class 2606 OID 16869)
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- TOC entry 4767 (class 2606 OID 16867)
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- TOC entry 4772 (class 2606 OID 16883)
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- TOC entry 4710 (class 2606 OID 16537)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 4738 (class 2606 OID 16761)
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 4762 (class 2606 OID 16850)
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- TOC entry 4757 (class 2606 OID 16841)
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- TOC entry 4692 (class 2606 OID 16923)
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- TOC entry 4694 (class 2606 OID 16501)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5037 (class 2606 OID 94100)
-- Name: ai_embeddings_cache ai_embeddings_cache_organization_id_model_text_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_embeddings_cache
    ADD CONSTRAINT ai_embeddings_cache_organization_id_model_text_hash_key UNIQUE (organization_id, model, text_hash);


--
-- TOC entry 5039 (class 2606 OID 94098)
-- Name: ai_embeddings_cache ai_embeddings_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_embeddings_cache
    ADD CONSTRAINT ai_embeddings_cache_pkey PRIMARY KEY (id);


--
-- TOC entry 5043 (class 2606 OID 94128)
-- Name: ai_org_rate_limit_usage ai_org_rate_limit_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_org_rate_limit_usage
    ADD CONSTRAINT ai_org_rate_limit_usage_pkey PRIMARY KEY (organization_id, window_start);


--
-- TOC entry 5041 (class 2606 OID 94116)
-- Name: ai_org_rate_limits ai_org_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_org_rate_limits
    ADD CONSTRAINT ai_org_rate_limits_pkey PRIMARY KEY (organization_id);


--
-- TOC entry 4956 (class 2606 OID 101928)
-- Name: ai_settings ai_settings_organization_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_settings
    ADD CONSTRAINT ai_settings_organization_id_unique UNIQUE (organization_id);


--
-- TOC entry 4958 (class 2606 OID 63787)
-- Name: ai_settings ai_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_settings
    ADD CONSTRAINT ai_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 5027 (class 2606 OID 93989)
-- Name: ai_turn_traces ai_turn_traces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_turn_traces
    ADD CONSTRAINT ai_turn_traces_pkey PRIMARY KEY (id);


--
-- TOC entry 4961 (class 2606 OID 63816)
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5000 (class 2606 OID 74288)
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5046 (class 2606 OID 94152)
-- Name: background_jobs background_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_pkey PRIMARY KEY (id);


--
-- TOC entry 4835 (class 2606 OID 81375)
-- Name: bot_personality bot_personality_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_personality
    ADD CONSTRAINT bot_personality_org_unique UNIQUE (organization_id);


--
-- TOC entry 4837 (class 2606 OID 81378)
-- Name: bot_personality bot_personality_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_personality
    ADD CONSTRAINT bot_personality_pkey PRIMARY KEY (id);


--
-- TOC entry 5013 (class 2606 OID 80243)
-- Name: campaign_delivery_receipt_failures campaign_delivery_receipt_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_delivery_receipt_failures
    ADD CONSTRAINT campaign_delivery_receipt_failures_pkey PRIMARY KEY (id);


--
-- TOC entry 4840 (class 2606 OID 18964)
-- Name: campaign_messages campaign_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_pkey PRIMARY KEY (id);


--
-- TOC entry 4852 (class 2606 OID 18966)
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- TOC entry 4948 (class 2606 OID 52740)
-- Name: contact_uploads contact_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_uploads
    ADD CONSTRAINT contact_uploads_pkey PRIMARY KEY (id);


--
-- TOC entry 4860 (class 2606 OID 18968)
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- TOC entry 4950 (class 2606 OID 55023)
-- Name: conversation_state conversation_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_state
    ADD CONSTRAINT conversation_state_pkey PRIMARY KEY (conversation_id);


--
-- TOC entry 4870 (class 2606 OID 18970)
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- TOC entry 4887 (class 2606 OID 18972)
-- Name: knowledge_articles knowledge_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_articles
    ADD CONSTRAINT knowledge_articles_pkey PRIMARY KEY (id);


--
-- TOC entry 4941 (class 2606 OID 42861)
-- Name: knowledge_chunks knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_pkey PRIMARY KEY (id);


--
-- TOC entry 5023 (class 2606 OID 92864)
-- Name: message_delivery_dlq message_delivery_dlq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_delivery_dlq
    ADD CONSTRAINT message_delivery_dlq_pkey PRIMARY KEY (id);


--
-- TOC entry 5032 (class 2606 OID 94028)
-- Name: message_delivery_events message_delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_delivery_events
    ADD CONSTRAINT message_delivery_events_pkey PRIMARY KEY (id);


--
-- TOC entry 4897 (class 2606 OID 18974)
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- TOC entry 4902 (class 2606 OID 18976)
-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_pkey PRIMARY KEY (id);


--
-- TOC entry 4904 (class 2606 OID 18978)
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- TOC entry 5009 (class 2606 OID 77692)
-- Name: psf_cases psf_cases_campaign_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.psf_cases
    ADD CONSTRAINT psf_cases_campaign_id_phone_key UNIQUE (campaign_id, phone);


--
-- TOC entry 5011 (class 2606 OID 77690)
-- Name: psf_cases psf_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.psf_cases
    ADD CONSTRAINT psf_cases_pkey PRIMARY KEY (id);


--
-- TOC entry 4986 (class 2606 OID 74218)
-- Name: razorpay_orders razorpay_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_orders
    ADD CONSTRAINT razorpay_orders_pkey PRIMARY KEY (id);


--
-- TOC entry 4988 (class 2606 OID 74220)
-- Name: razorpay_orders razorpay_orders_razorpay_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_orders
    ADD CONSTRAINT razorpay_orders_razorpay_order_id_key UNIQUE (razorpay_order_id);


--
-- TOC entry 4993 (class 2606 OID 74245)
-- Name: razorpay_payments razorpay_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_pkey PRIMARY KEY (id);


--
-- TOC entry 4995 (class 2606 OID 74247)
-- Name: razorpay_payments razorpay_payments_razorpay_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_razorpay_payment_id_key UNIQUE (razorpay_payment_id);


--
-- TOC entry 5035 (class 2606 OID 94060)
-- Name: replay_requests replay_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replay_requests
    ADD CONSTRAINT replay_requests_pkey PRIMARY KEY (id);


--
-- TOC entry 4908 (class 2606 OID 18980)
-- Name: unanswered_questions unanswered_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unanswered_questions
    ADD CONSTRAINT unanswered_questions_pkey PRIMARY KEY (id);


--
-- TOC entry 4981 (class 2606 OID 63921)
-- Name: wallet_alert_logs wallet_alert_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_alert_logs
    ADD CONSTRAINT wallet_alert_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4976 (class 2606 OID 63882)
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- TOC entry 4674 (class 2606 OID 74202)
-- Name: wallet_transactions wallet_txn_balance_snapshots_present; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.wallet_transactions
    ADD CONSTRAINT wallet_txn_balance_snapshots_present CHECK (((balance_before IS NOT NULL) AND (balance_after IS NOT NULL))) NOT VALID;


--
-- TOC entry 4967 (class 2606 OID 63861)
-- Name: wallets wallets_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_organization_id_key UNIQUE (organization_id);


--
-- TOC entry 4969 (class 2606 OID 63859)
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- TOC entry 4946 (class 2606 OID 50960)
-- Name: whatsapp_bulk_logs whatsapp_bulk_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_bulk_logs
    ADD CONSTRAINT whatsapp_bulk_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4910 (class 2606 OID 80252)
-- Name: whatsapp_settings whatsapp_settings_organization_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_settings
    ADD CONSTRAINT whatsapp_settings_organization_unique UNIQUE (organization_id);


--
-- TOC entry 4912 (class 2606 OID 18982)
-- Name: whatsapp_settings whatsapp_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_settings
    ADD CONSTRAINT whatsapp_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4954 (class 2606 OID 59195)
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 4918 (class 2606 OID 18984)
-- Name: workflow_logs workflow_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_logs
    ADD CONSTRAINT workflow_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4920 (class 2606 OID 18986)
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- TOC entry 4922 (class 2606 OID 18988)
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- TOC entry 4925 (class 2606 OID 18990)
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5050 (class 2606 OID 110958)
-- Name: messages_2026_02_04 messages_2026_02_04_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_04
    ADD CONSTRAINT messages_2026_02_04_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5053 (class 2606 OID 112138)
-- Name: messages_2026_02_05 messages_2026_02_05_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_05
    ADD CONSTRAINT messages_2026_02_05_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5056 (class 2606 OID 113571)
-- Name: messages_2026_02_06 messages_2026_02_06_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_06
    ADD CONSTRAINT messages_2026_02_06_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5059 (class 2606 OID 115564)
-- Name: messages_2026_02_07 messages_2026_02_07_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_07
    ADD CONSTRAINT messages_2026_02_07_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5062 (class 2606 OID 116984)
-- Name: messages_2026_02_08 messages_2026_02_08_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_08
    ADD CONSTRAINT messages_2026_02_08_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5065 (class 2606 OID 118104)
-- Name: messages_2026_02_09 messages_2026_02_09_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_09
    ADD CONSTRAINT messages_2026_02_09_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5068 (class 2606 OID 119227)
-- Name: messages_2026_02_10 messages_2026_02_10_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_10
    ADD CONSTRAINT messages_2026_02_10_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5071 (class 2606 OID 121446)
-- Name: messages_2026_02_11 messages_2026_02_11_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_11
    ADD CONSTRAINT messages_2026_02_11_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 5074 (class 2606 OID 121458)
-- Name: messages_2026_02_12 messages_2026_02_12_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_12
    ADD CONSTRAINT messages_2026_02_12_pkey PRIMARY KEY (id, inserted_at);


--
-- TOC entry 4813 (class 2606 OID 17255)
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- TOC entry 4802 (class 2606 OID 17116)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 4816 (class 2606 OID 17338)
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- TOC entry 4713 (class 2606 OID 16554)
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- TOC entry 4819 (class 2606 OID 17314)
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- TOC entry 4723 (class 2606 OID 16595)
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- TOC entry 4725 (class 2606 OID 16593)
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 4721 (class 2606 OID 16571)
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- TOC entry 4810 (class 2606 OID 17211)
-- Name: prefixes prefixes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (bucket_id, level, name);


--
-- TOC entry 4807 (class 2606 OID 17172)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- TOC entry 4805 (class 2606 OID 17157)
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- TOC entry 4822 (class 2606 OID 17324)
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- TOC entry 4927 (class 2606 OID 19006)
-- Name: hooks hooks_pkey; Type: CONSTRAINT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.hooks
    ADD CONSTRAINT hooks_pkey PRIMARY KEY (id);


--
-- TOC entry 4931 (class 2606 OID 19008)
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 4933 (class 2606 OID 19010)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 4824 (class 2606 OID 17503)
-- Name: seed_files seed_files_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.seed_files
    ADD CONSTRAINT seed_files_pkey PRIMARY KEY (path);


--
-- TOC entry 4827 (class 1259 OID 19011)
-- Name: extensions_tenant_external_id_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE INDEX extensions_tenant_external_id_index ON _realtime.extensions USING btree (tenant_external_id);


--
-- TOC entry 4828 (class 1259 OID 19012)
-- Name: extensions_tenant_external_id_type_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX extensions_tenant_external_id_type_index ON _realtime.extensions USING btree (tenant_external_id, type);


--
-- TOC entry 4831 (class 1259 OID 19013)
-- Name: tenants_external_id_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX tenants_external_id_index ON _realtime.tenants USING btree (external_id);


--
-- TOC entry 4708 (class 1259 OID 16532)
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- TOC entry 4682 (class 1259 OID 16750)
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4683 (class 1259 OID 16752)
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4684 (class 1259 OID 16753)
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4741 (class 1259 OID 16831)
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- TOC entry 4774 (class 1259 OID 16939)
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- TOC entry 4729 (class 1259 OID 16919)
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- TOC entry 5608 (class 0 OID 0)
-- Dependencies: 4729
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- TOC entry 4734 (class 1259 OID 16747)
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- TOC entry 4777 (class 1259 OID 16936)
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- TOC entry 4942 (class 1259 OID 47541)
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- TOC entry 4778 (class 1259 OID 16937)
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- TOC entry 4749 (class 1259 OID 16942)
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- TOC entry 4746 (class 1259 OID 16803)
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- TOC entry 4747 (class 1259 OID 16948)
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- TOC entry 4787 (class 1259 OID 17073)
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- TOC entry 4784 (class 1259 OID 17026)
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- TOC entry 4794 (class 1259 OID 17099)
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 4795 (class 1259 OID 17097)
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- TOC entry 4800 (class 1259 OID 17098)
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- TOC entry 4781 (class 1259 OID 16995)
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- TOC entry 4782 (class 1259 OID 16994)
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- TOC entry 4783 (class 1259 OID 16996)
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- TOC entry 4685 (class 1259 OID 16754)
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4686 (class 1259 OID 16751)
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- TOC entry 4695 (class 1259 OID 16515)
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- TOC entry 4696 (class 1259 OID 16516)
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- TOC entry 4697 (class 1259 OID 16746)
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- TOC entry 4700 (class 1259 OID 16833)
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- TOC entry 4703 (class 1259 OID 16938)
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- TOC entry 4768 (class 1259 OID 16875)
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- TOC entry 4769 (class 1259 OID 16940)
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- TOC entry 4770 (class 1259 OID 16890)
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- TOC entry 4773 (class 1259 OID 16889)
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- TOC entry 4735 (class 1259 OID 16941)
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- TOC entry 4736 (class 1259 OID 17111)
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- TOC entry 4739 (class 1259 OID 16832)
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- TOC entry 4760 (class 1259 OID 16857)
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- TOC entry 4763 (class 1259 OID 16856)
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- TOC entry 4758 (class 1259 OID 16842)
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- TOC entry 4759 (class 1259 OID 17004)
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- TOC entry 4748 (class 1259 OID 17001)
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- TOC entry 4740 (class 1259 OID 16830)
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- TOC entry 4687 (class 1259 OID 16910)
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- TOC entry 5609 (class 0 OID 0)
-- Dependencies: 4687
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- TOC entry 4688 (class 1259 OID 16748)
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- TOC entry 4689 (class 1259 OID 16505)
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- TOC entry 4690 (class 1259 OID 16965)
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- TOC entry 5024 (class 1259 OID 94016)
-- Name: ai_turn_traces_conv_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_turn_traces_conv_started_at_idx ON public.ai_turn_traces USING btree (conversation_id, started_at DESC);


--
-- TOC entry 5025 (class 1259 OID 94015)
-- Name: ai_turn_traces_org_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_turn_traces_org_started_at_idx ON public.ai_turn_traces USING btree (organization_id, started_at DESC);


--
-- TOC entry 4996 (class 1259 OID 74291)
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);


--
-- TOC entry 4997 (class 1259 OID 74290)
-- Name: audit_logs_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);


--
-- TOC entry 4998 (class 1259 OID 74289)
-- Name: audit_logs_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_org_idx ON public.audit_logs USING btree (organization_id);


--
-- TOC entry 5044 (class 1259 OID 94159)
-- Name: background_jobs_org_status_run_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX background_jobs_org_status_run_at_idx ON public.background_jobs USING btree (organization_id, status, run_at);


--
-- TOC entry 5047 (class 1259 OID 94158)
-- Name: background_jobs_status_run_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX background_jobs_status_run_at_idx ON public.background_jobs USING btree (status, run_at);


--
-- TOC entry 4838 (class 1259 OID 92853)
-- Name: campaign_messages_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_claim_idx ON public.campaign_messages USING btree (campaign_id, status, next_retry_at, created_at);


--
-- TOC entry 5014 (class 1259 OID 80246)
-- Name: cdrf_org_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cdrf_org_received_idx ON public.campaign_delivery_receipt_failures USING btree (organization_id, received_at DESC);


--
-- TOC entry 4858 (class 1259 OID 62632)
-- Name: contacts_org_phone_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_org_phone_uq ON public.contacts USING btree (organization_id, phone);


--
-- TOC entry 4866 (class 1259 OID 80205)
-- Name: conversations_ai_locked_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_ai_locked_idx ON public.conversations USING btree (organization_id, ai_locked);


--
-- TOC entry 4867 (class 1259 OID 80247)
-- Name: conversations_ai_locked_until_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_ai_locked_until_idx ON public.conversations USING btree (organization_id, ai_locked_until);


--
-- TOC entry 4868 (class 1259 OID 94086)
-- Name: conversations_org_last_message_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_org_last_message_at_idx ON public.conversations USING btree (organization_id, last_message_at DESC);


--
-- TOC entry 4871 (class 1259 OID 95327)
-- Name: conversations_unique_contact_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversations_unique_contact_channel ON public.conversations USING btree (organization_id, contact_id, channel);


--
-- TOC entry 4872 (class 1259 OID 62644)
-- Name: conversations_whatsapp_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversations_whatsapp_unique ON public.conversations USING btree (organization_id, contact_id) WHERE (channel = 'whatsapp'::text);


--
-- TOC entry 4959 (class 1259 OID 63800)
-- Name: idx_ai_settings_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_settings_org ON public.ai_settings USING btree (organization_id);


--
-- TOC entry 4962 (class 1259 OID 63838)
-- Name: idx_ai_usage_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_created ON public.ai_usage_logs USING btree (created_at);


--
-- TOC entry 4963 (class 1259 OID 63837)
-- Name: idx_ai_usage_logs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_org ON public.ai_usage_logs USING btree (organization_id);


--
-- TOC entry 4841 (class 1259 OID 19014)
-- Name: idx_campaign_messages_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_campaign ON public.campaign_messages USING btree (campaign_id);


--
-- TOC entry 4842 (class 1259 OID 62595)
-- Name: idx_campaign_messages_campaign_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_campaign_status ON public.campaign_messages USING btree (campaign_id, status);


--
-- TOC entry 4843 (class 1259 OID 62597)
-- Name: idx_campaign_messages_delivered_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_delivered_at ON public.campaign_messages USING btree (delivered_at);


--
-- TOC entry 4844 (class 1259 OID 62596)
-- Name: idx_campaign_messages_dispatched_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_dispatched_at ON public.campaign_messages USING btree (dispatched_at);


--
-- TOC entry 4845 (class 1259 OID 52706)
-- Name: idx_campaign_messages_org_phone_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_org_phone_status ON public.campaign_messages USING btree (organization_id, phone, status);


--
-- TOC entry 4846 (class 1259 OID 19015)
-- Name: idx_campaign_messages_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_org_status ON public.campaign_messages USING btree (organization_id, status);


--
-- TOC entry 4847 (class 1259 OID 62598)
-- Name: idx_campaign_messages_replied_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_replied_at ON public.campaign_messages USING btree (replied_at);


--
-- TOC entry 4848 (class 1259 OID 60340)
-- Name: idx_campaign_messages_reply; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_reply ON public.campaign_messages USING btree (organization_id, replied_at);


--
-- TOC entry 4849 (class 1259 OID 19016)
-- Name: idx_campaign_messages_send_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_send_queue ON public.campaign_messages USING btree (status, campaign_id, created_at);


--
-- TOC entry 4850 (class 1259 OID 74294)
-- Name: idx_campaign_messages_whatsapp_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_messages_whatsapp_message_id ON public.campaign_messages USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);


--
-- TOC entry 4853 (class 1259 OID 19017)
-- Name: idx_campaigns_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_org ON public.campaigns USING btree (organization_id);


--
-- TOC entry 4854 (class 1259 OID 19018)
-- Name: idx_campaigns_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_org_status ON public.campaigns USING btree (organization_id, status);


--
-- TOC entry 4855 (class 1259 OID 52704)
-- Name: idx_campaigns_org_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_org_template ON public.campaigns USING btree (organization_id, template_name);


--
-- TOC entry 4856 (class 1259 OID 19019)
-- Name: idx_campaigns_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_scheduled_at ON public.campaigns USING btree (status, scheduled_at);


--
-- TOC entry 4857 (class 1259 OID 59230)
-- Name: idx_campaigns_whatsapp_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_whatsapp_template_id ON public.campaigns USING btree (whatsapp_template_id);


--
-- TOC entry 4861 (class 1259 OID 84150)
-- Name: idx_contacts_org_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_org_metadata ON public.contacts USING gin (metadata);


--
-- TOC entry 4862 (class 1259 OID 52702)
-- Name: idx_contacts_org_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_org_model ON public.contacts USING btree (organization_id, model);


--
-- TOC entry 4863 (class 1259 OID 61487)
-- Name: idx_contacts_org_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_org_name ON public.contacts USING btree (organization_id, name);


--
-- TOC entry 4864 (class 1259 OID 52701)
-- Name: idx_contacts_org_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_org_phone ON public.contacts USING btree (organization_id, phone);


--
-- TOC entry 4873 (class 1259 OID 75418)
-- Name: idx_conversations_ai_context; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_ai_context ON public.conversations USING btree (ai_context_updated_at);


--
-- TOC entry 4874 (class 1259 OID 87668)
-- Name: idx_conversations_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_campaign_id ON public.conversations USING btree (campaign_id);


--
-- TOC entry 4875 (class 1259 OID 61483)
-- Name: idx_conversations_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_intent ON public.conversations USING btree (intent);


--
-- TOC entry 4876 (class 1259 OID 61489)
-- Name: idx_conversations_org_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_org_assigned ON public.conversations USING btree (organization_id, assigned_to);


--
-- TOC entry 4877 (class 1259 OID 62600)
-- Name: idx_conversations_org_channel_last; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_org_channel_last ON public.conversations USING btree (organization_id, channel, last_message_at);


--
-- TOC entry 4878 (class 1259 OID 61486)
-- Name: idx_conversations_org_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_org_intent ON public.conversations USING btree (organization_id, intent);


--
-- TOC entry 4879 (class 1259 OID 61488)
-- Name: idx_conversations_org_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_org_last_message_at ON public.conversations USING btree (organization_id, last_message_at DESC);


--
-- TOC entry 4880 (class 1259 OID 87669)
-- Name: idx_conversations_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_workflow_id ON public.conversations USING btree (workflow_id);


--
-- TOC entry 4934 (class 1259 OID 42868)
-- Name: idx_kb_chunks_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_embedding ON public.knowledge_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- TOC entry 4935 (class 1259 OID 90372)
-- Name: idx_kb_chunks_org_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_org_article ON public.knowledge_chunks USING btree (organization_id, article_id);


--
-- TOC entry 4881 (class 1259 OID 74267)
-- Name: idx_kb_keywords_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_keywords_gin ON public.knowledge_articles USING gin (keywords);


--
-- TOC entry 4882 (class 1259 OID 92831)
-- Name: idx_knowledge_articles_org_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_articles_org_updated ON public.knowledge_articles USING btree (organization_id, updated_at DESC);


--
-- TOC entry 4883 (class 1259 OID 75419)
-- Name: idx_knowledge_articles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_articles_status ON public.knowledge_articles USING btree (status);


--
-- TOC entry 4936 (class 1259 OID 89951)
-- Name: idx_knowledge_chunks_article_chunk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_article_chunk ON public.knowledge_chunks USING btree (article_id, chunk_index);


--
-- TOC entry 4937 (class 1259 OID 89957)
-- Name: idx_knowledge_chunks_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_chunks_org ON public.knowledge_chunks USING btree (organization_id);


--
-- TOC entry 4888 (class 1259 OID 95302)
-- Name: idx_messages_campaign_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_campaign_message_id ON public.messages USING btree (campaign_message_id) WHERE (campaign_message_id IS NOT NULL);


--
-- TOC entry 4889 (class 1259 OID 62599)
-- Name: idx_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_created ON public.messages USING btree (conversation_id, created_at);


--
-- TOC entry 4890 (class 1259 OID 92837)
-- Name: idx_messages_org_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_org_conversation_created ON public.messages USING btree (organization_id, conversation_id, created_at);


--
-- TOC entry 4891 (class 1259 OID 80254)
-- Name: idx_messages_whatsapp_receipts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_whatsapp_receipts ON public.messages USING btree (whatsapp_status) WHERE (whatsapp_status IS NOT NULL);


--
-- TOC entry 4900 (class 1259 OID 78910)
-- Name: idx_org_users_user_last_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_users_user_last_active ON public.organization_users USING btree (user_id, last_active_at DESC);


--
-- TOC entry 5001 (class 1259 OID 79075)
-- Name: idx_psf_cases_action_required; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psf_cases_action_required ON public.psf_cases USING btree (action_required) WHERE (action_required = true);


--
-- TOC entry 5002 (class 1259 OID 79073)
-- Name: idx_psf_cases_campaign_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psf_cases_campaign_phone ON public.psf_cases USING btree (campaign_id, phone);


--
-- TOC entry 5003 (class 1259 OID 79074)
-- Name: idx_psf_cases_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psf_cases_conversation ON public.psf_cases USING btree (conversation_id);


--
-- TOC entry 5004 (class 1259 OID 77713)
-- Name: idx_psf_cases_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psf_cases_org ON public.psf_cases USING btree (organization_id);


--
-- TOC entry 5005 (class 1259 OID 79072)
-- Name: idx_psf_cases_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psf_cases_org_created ON public.psf_cases USING btree (organization_id, created_at DESC);


--
-- TOC entry 5006 (class 1259 OID 77715)
-- Name: idx_psf_cases_resolution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psf_cases_resolution ON public.psf_cases USING btree (resolution_status);


--
-- TOC entry 5007 (class 1259 OID 77714)
-- Name: idx_psf_cases_sentiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_psf_cases_sentiment ON public.psf_cases USING btree (sentiment);


--
-- TOC entry 4982 (class 1259 OID 74233)
-- Name: idx_razorpay_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_razorpay_orders_created ON public.razorpay_orders USING btree (created_at);


--
-- TOC entry 4983 (class 1259 OID 74231)
-- Name: idx_razorpay_orders_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_razorpay_orders_org ON public.razorpay_orders USING btree (organization_id);


--
-- TOC entry 4984 (class 1259 OID 74232)
-- Name: idx_razorpay_orders_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_razorpay_orders_wallet ON public.razorpay_orders USING btree (wallet_id);


--
-- TOC entry 4989 (class 1259 OID 74260)
-- Name: idx_razorpay_payments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_razorpay_payments_order ON public.razorpay_payments USING btree (razorpay_order_id);


--
-- TOC entry 4990 (class 1259 OID 74258)
-- Name: idx_razorpay_payments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_razorpay_payments_org ON public.razorpay_payments USING btree (organization_id);


--
-- TOC entry 4991 (class 1259 OID 74259)
-- Name: idx_razorpay_payments_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_razorpay_payments_wallet ON public.razorpay_payments USING btree (wallet_id);


--
-- TOC entry 4905 (class 1259 OID 74273)
-- Name: idx_unanswered_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unanswered_last_seen ON public.unanswered_questions USING btree (last_seen_at DESC);


--
-- TOC entry 4906 (class 1259 OID 74272)
-- Name: idx_unanswered_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unanswered_org_status ON public.unanswered_questions USING btree (organization_id, status);


--
-- TOC entry 4977 (class 1259 OID 63933)
-- Name: idx_wallet_alerts_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_alerts_org ON public.wallet_alert_logs USING btree (organization_id);


--
-- TOC entry 4978 (class 1259 OID 63934)
-- Name: idx_wallet_alerts_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_alerts_wallet ON public.wallet_alert_logs USING btree (wallet_id);


--
-- TOC entry 4970 (class 1259 OID 63889)
-- Name: idx_wallet_transactions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_transactions_created ON public.wallet_transactions USING btree (created_at);


--
-- TOC entry 4971 (class 1259 OID 74200)
-- Name: idx_wallet_transactions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_transactions_created_by ON public.wallet_transactions USING btree (created_by);


--
-- TOC entry 4972 (class 1259 OID 74199)
-- Name: idx_wallet_transactions_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_transactions_purpose ON public.wallet_transactions USING btree (purpose);


--
-- TOC entry 4973 (class 1259 OID 63890)
-- Name: idx_wallet_transactions_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_transactions_reference ON public.wallet_transactions USING btree (reference_type, reference_id);


--
-- TOC entry 4974 (class 1259 OID 63888)
-- Name: idx_wallet_transactions_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_transactions_wallet ON public.wallet_transactions USING btree (wallet_id);


--
-- TOC entry 4965 (class 1259 OID 63867)
-- Name: idx_wallets_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallets_org ON public.wallets USING btree (organization_id);


--
-- TOC entry 4951 (class 1259 OID 59207)
-- Name: idx_whatsapp_templates_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_templates_org ON public.whatsapp_templates USING btree (organization_id);


--
-- TOC entry 4913 (class 1259 OID 35855)
-- Name: idx_workflow_logs_conversation_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_logs_conversation_active ON public.workflow_logs USING btree (conversation_id, completed);


--
-- TOC entry 4914 (class 1259 OID 92845)
-- Name: idx_workflow_logs_org_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_logs_org_conversation_created ON public.workflow_logs USING btree (organization_id, conversation_id, created_at);


--
-- TOC entry 4915 (class 1259 OID 35856)
-- Name: idx_workflow_logs_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_logs_workflow ON public.workflow_logs USING btree (workflow_id);


--
-- TOC entry 4884 (class 1259 OID 89934)
-- Name: knowledge_articles_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_articles_org_status_idx ON public.knowledge_articles USING btree (organization_id, status);


--
-- TOC entry 4885 (class 1259 OID 94089)
-- Name: knowledge_articles_org_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_articles_org_updated_at_idx ON public.knowledge_articles USING btree (organization_id, updated_at DESC);


--
-- TOC entry 4938 (class 1259 OID 99155)
-- Name: knowledge_chunks_chunk_tsv_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_chunks_chunk_tsv_gin ON public.knowledge_chunks USING gin (to_tsvector('simple'::regconfig, COALESCE(chunk, ''::text)));


--
-- TOC entry 4939 (class 1259 OID 89936)
-- Name: knowledge_chunks_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_chunks_embedding_hnsw ON public.knowledge_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- TOC entry 5021 (class 1259 OID 92870)
-- Name: message_delivery_dlq_org_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_delivery_dlq_org_created_at_idx ON public.message_delivery_dlq USING btree (organization_id, created_at DESC);


--
-- TOC entry 5028 (class 1259 OID 94046)
-- Name: message_delivery_events_campaign_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_delivery_events_campaign_message_idx ON public.message_delivery_events USING btree (campaign_message_id, event_at DESC);


--
-- TOC entry 5029 (class 1259 OID 94045)
-- Name: message_delivery_events_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_delivery_events_message_idx ON public.message_delivery_events USING btree (message_id, event_at DESC);


--
-- TOC entry 5030 (class 1259 OID 94044)
-- Name: message_delivery_events_org_event_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_delivery_events_org_event_at_idx ON public.message_delivery_events USING btree (organization_id, event_at DESC);


--
-- TOC entry 4892 (class 1259 OID 92849)
-- Name: messages_conversation_order_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_order_at_idx ON public.messages USING btree (conversation_id, order_at);


--
-- TOC entry 4893 (class 1259 OID 94087)
-- Name: messages_org_conversation_order_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_org_conversation_order_at_idx ON public.messages USING btree (organization_id, conversation_id, order_at DESC);


--
-- TOC entry 4894 (class 1259 OID 94088)
-- Name: messages_org_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_org_created_at_idx ON public.messages USING btree (organization_id, created_at DESC);


--
-- TOC entry 4895 (class 1259 OID 92850)
-- Name: messages_org_outbound_dedupe_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX messages_org_outbound_dedupe_key_uniq ON public.messages USING btree (organization_id, outbound_dedupe_key) WHERE (outbound_dedupe_key IS NOT NULL);


--
-- TOC entry 5033 (class 1259 OID 94066)
-- Name: replay_requests_org_requested_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX replay_requests_org_requested_at_idx ON public.replay_requests USING btree (organization_id, requested_at DESC);


--
-- TOC entry 4865 (class 1259 OID 62630)
-- Name: uniq_contacts_org_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_contacts_org_phone ON public.contacts USING btree (organization_id, phone);


--
-- TOC entry 4898 (class 1259 OID 80232)
-- Name: uniq_messages_outbound_dedupe_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_messages_outbound_dedupe_key ON public.messages USING btree (conversation_id, outbound_dedupe_key) WHERE (outbound_dedupe_key IS NOT NULL);


--
-- TOC entry 4899 (class 1259 OID 24136)
-- Name: uniq_messages_whatsapp_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_messages_whatsapp_message_id ON public.messages USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);


--
-- TOC entry 4964 (class 1259 OID 63896)
-- Name: uq_ai_usage_logs_wallet_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ai_usage_logs_wallet_transaction_id ON public.ai_usage_logs USING btree (wallet_transaction_id) WHERE (wallet_transaction_id IS NOT NULL);


--
-- TOC entry 4979 (class 1259 OID 63932)
-- Name: uq_wallet_active_alert; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_wallet_active_alert ON public.wallet_alert_logs USING btree (wallet_id, alert_type) WHERE (resolved_at IS NULL);


--
-- TOC entry 4952 (class 1259 OID 84153)
-- Name: whatsapp_templates_org_name_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_templates_org_name_lang ON public.whatsapp_templates USING btree (organization_id, name, language);


--
-- TOC entry 4916 (class 1259 OID 95326)
-- Name: workflow_logs_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workflow_logs_active_unique ON public.workflow_logs USING btree (organization_id, conversation_id, workflow_id) WHERE (completed = false);


--
-- TOC entry 4811 (class 1259 OID 17484)
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- TOC entry 4923 (class 1259 OID 19020)
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5048 (class 1259 OID 110959)
-- Name: messages_2026_02_04_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_04_inserted_at_topic_idx ON realtime.messages_2026_02_04 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5051 (class 1259 OID 112139)
-- Name: messages_2026_02_05_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_05_inserted_at_topic_idx ON realtime.messages_2026_02_05 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5054 (class 1259 OID 113572)
-- Name: messages_2026_02_06_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_06_inserted_at_topic_idx ON realtime.messages_2026_02_06 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5057 (class 1259 OID 115565)
-- Name: messages_2026_02_07_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_07_inserted_at_topic_idx ON realtime.messages_2026_02_07 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5060 (class 1259 OID 116985)
-- Name: messages_2026_02_08_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_08_inserted_at_topic_idx ON realtime.messages_2026_02_08 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5063 (class 1259 OID 118105)
-- Name: messages_2026_02_09_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_09_inserted_at_topic_idx ON realtime.messages_2026_02_09 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5066 (class 1259 OID 119228)
-- Name: messages_2026_02_10_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_10_inserted_at_topic_idx ON realtime.messages_2026_02_10 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5069 (class 1259 OID 121447)
-- Name: messages_2026_02_11_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_11_inserted_at_topic_idx ON realtime.messages_2026_02_11 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 5072 (class 1259 OID 121459)
-- Name: messages_2026_02_12_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_12_inserted_at_topic_idx ON realtime.messages_2026_02_12 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- TOC entry 4814 (class 1259 OID 115554)
-- Name: subscription_subscription_id_entity_filters_action_filter_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);


--
-- TOC entry 4711 (class 1259 OID 16560)
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- TOC entry 4714 (class 1259 OID 16582)
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- TOC entry 4817 (class 1259 OID 17339)
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- TOC entry 4803 (class 1259 OID 17183)
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- TOC entry 4715 (class 1259 OID 17229)
-- Name: idx_name_bucket_level_unique; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level);


--
-- TOC entry 4716 (class 1259 OID 17148)
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- TOC entry 4717 (class 1259 OID 17262)
-- Name: idx_objects_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level);


--
-- TOC entry 4808 (class 1259 OID 17263)
-- Name: idx_prefixes_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops);


--
-- TOC entry 4718 (class 1259 OID 16583)
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- TOC entry 4719 (class 1259 OID 17259)
-- Name: objects_bucket_id_level_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C");


--
-- TOC entry 4820 (class 1259 OID 17330)
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- TOC entry 4928 (class 1259 OID 19028)
-- Name: supabase_functions_hooks_h_table_id_h_name_idx; Type: INDEX; Schema: supabase_functions; Owner: -
--

CREATE INDEX supabase_functions_hooks_h_table_id_h_name_idx ON supabase_functions.hooks USING btree (hook_table_id, hook_name);


--
-- TOC entry 4929 (class 1259 OID 19029)
-- Name: supabase_functions_hooks_request_id_idx; Type: INDEX; Schema: supabase_functions; Owner: -
--

CREATE INDEX supabase_functions_hooks_request_id_idx ON supabase_functions.hooks USING btree (request_id);


--
-- TOC entry 5075 (class 0 OID 0)
-- Name: messages_2026_02_04_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_04_inserted_at_topic_idx;


--
-- TOC entry 5076 (class 0 OID 0)
-- Name: messages_2026_02_04_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_04_pkey;


--
-- TOC entry 5077 (class 0 OID 0)
-- Name: messages_2026_02_05_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_05_inserted_at_topic_idx;


--
-- TOC entry 5078 (class 0 OID 0)
-- Name: messages_2026_02_05_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_05_pkey;


--
-- TOC entry 5079 (class 0 OID 0)
-- Name: messages_2026_02_06_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_06_inserted_at_topic_idx;


--
-- TOC entry 5080 (class 0 OID 0)
-- Name: messages_2026_02_06_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_06_pkey;


--
-- TOC entry 5081 (class 0 OID 0)
-- Name: messages_2026_02_07_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_07_inserted_at_topic_idx;


--
-- TOC entry 5082 (class 0 OID 0)
-- Name: messages_2026_02_07_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_07_pkey;


--
-- TOC entry 5083 (class 0 OID 0)
-- Name: messages_2026_02_08_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_08_inserted_at_topic_idx;


--
-- TOC entry 5084 (class 0 OID 0)
-- Name: messages_2026_02_08_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_08_pkey;


--
-- TOC entry 5085 (class 0 OID 0)
-- Name: messages_2026_02_09_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_09_inserted_at_topic_idx;


--
-- TOC entry 5086 (class 0 OID 0)
-- Name: messages_2026_02_09_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_09_pkey;


--
-- TOC entry 5087 (class 0 OID 0)
-- Name: messages_2026_02_10_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_10_inserted_at_topic_idx;


--
-- TOC entry 5088 (class 0 OID 0)
-- Name: messages_2026_02_10_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_10_pkey;


--
-- TOC entry 5089 (class 0 OID 0)
-- Name: messages_2026_02_11_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_11_inserted_at_topic_idx;


--
-- TOC entry 5090 (class 0 OID 0)
-- Name: messages_2026_02_11_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_11_pkey;


--
-- TOC entry 5091 (class 0 OID 0)
-- Name: messages_2026_02_12_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_12_inserted_at_topic_idx;


--
-- TOC entry 5092 (class 0 OID 0)
-- Name: messages_2026_02_12_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_12_pkey;


--
-- TOC entry 5182 (class 2620 OID 77719)
-- Name: campaign_messages trg_create_psf_case; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_create_psf_case AFTER INSERT ON public.campaign_messages FOR EACH ROW EXECUTE FUNCTION public.create_psf_case_on_campaign_message();


--
-- TOC entry 5183 (class 2620 OID 96462)
-- Name: messages trg_messages_recompute_conversation_last_message_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_messages_recompute_conversation_last_message_at AFTER DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.on_message_deleted_recompute_conversation_last_message_at();


--
-- TOC entry 5184 (class 2620 OID 92848)
-- Name: messages trg_messages_set_order_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_messages_set_order_at BEFORE INSERT OR UPDATE OF wa_received_at, sent_at, created_at ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_message_order_at();


--
-- TOC entry 5185 (class 2620 OID 96461)
-- Name: messages trg_messages_touch_conversation_last_message_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_messages_touch_conversation_last_message_at AFTER INSERT OR UPDATE OF conversation_id, order_at, created_at ON public.messages FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_last_message_at();


--
-- TOC entry 5187 (class 2620 OID 63898)
-- Name: organizations trg_phase5_create_wallet_for_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_phase5_create_wallet_for_org AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.phase5_create_wallet_for_org();


--
-- TOC entry 5189 (class 2620 OID 63902)
-- Name: wallet_transactions trg_phase5_wallet_apply_transaction; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_phase5_wallet_apply_transaction AFTER INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.phase5_wallet_apply_transaction();


--
-- TOC entry 5190 (class 2620 OID 63900)
-- Name: wallet_transactions trg_phase5_wallet_prevent_negative_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_phase5_wallet_prevent_negative_balance BEFORE INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.phase5_wallet_prevent_negative_balance();


--
-- TOC entry 5192 (class 2620 OID 79076)
-- Name: psf_cases trg_psf_cases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_psf_cases_updated_at BEFORE UPDATE ON public.psf_cases FOR EACH ROW EXECUTE FUNCTION public.update_psf_cases_updated_at();


--
-- TOC entry 5191 (class 2620 OID 74264)
-- Name: razorpay_orders trg_razorpay_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_razorpay_orders_updated_at BEFORE UPDATE ON public.razorpay_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 5186 (class 2620 OID 92839)
-- Name: messages trg_set_message_organization_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_message_organization_id BEFORE INSERT OR UPDATE OF conversation_id, organization_id ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_message_organization_id();


--
-- TOC entry 5188 (class 2620 OID 74275)
-- Name: unanswered_questions trg_unanswered_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_unanswered_updated_at BEFORE UPDATE ON public.unanswered_questions FOR EACH ROW EXECUTE FUNCTION public.set_unanswered_updated_at();


--
-- TOC entry 5181 (class 2620 OID 19030)
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- TOC entry 5174 (class 2620 OID 19031)
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- TOC entry 5175 (class 2620 OID 19032)
-- Name: objects objects_delete_delete_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- TOC entry 5176 (class 2620 OID 19033)
-- Name: objects objects_insert_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();


--
-- TOC entry 5177 (class 2620 OID 19034)
-- Name: objects objects_update_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();


--
-- TOC entry 5179 (class 2620 OID 19035)
-- Name: prefixes prefixes_create_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();


--
-- TOC entry 5180 (class 2620 OID 19036)
-- Name: prefixes prefixes_delete_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- TOC entry 5178 (class 2620 OID 19037)
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- TOC entry 5115 (class 2606 OID 19038)
-- Name: extensions extensions_tenant_external_id_fkey; Type: FK CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.extensions
    ADD CONSTRAINT extensions_tenant_external_id_fkey FOREIGN KEY (tenant_external_id) REFERENCES _realtime.tenants(external_id) ON DELETE CASCADE;


--
-- TOC entry 5095 (class 2606 OID 16734)
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5100 (class 2606 OID 16823)
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- TOC entry 5099 (class 2606 OID 16811)
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- TOC entry 5098 (class 2606 OID 16798)
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5106 (class 2606 OID 17063)
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- TOC entry 5107 (class 2606 OID 17068)
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5108 (class 2606 OID 17092)
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- TOC entry 5109 (class 2606 OID 17087)
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5105 (class 2606 OID 16989)
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5093 (class 2606 OID 16767)
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- TOC entry 5102 (class 2606 OID 16870)
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 5103 (class 2606 OID 16943)
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- TOC entry 5104 (class 2606 OID 16884)
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 5096 (class 2606 OID 17106)
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- TOC entry 5097 (class 2606 OID 16762)
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 5101 (class 2606 OID 16851)
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- TOC entry 5170 (class 2606 OID 94101)
-- Name: ai_embeddings_cache ai_embeddings_cache_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_embeddings_cache
    ADD CONSTRAINT ai_embeddings_cache_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5172 (class 2606 OID 94129)
-- Name: ai_org_rate_limit_usage ai_org_rate_limit_usage_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_org_rate_limit_usage
    ADD CONSTRAINT ai_org_rate_limit_usage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5171 (class 2606 OID 94117)
-- Name: ai_org_rate_limits ai_org_rate_limits_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_org_rate_limits
    ADD CONSTRAINT ai_org_rate_limits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5144 (class 2606 OID 63790)
-- Name: ai_settings ai_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_settings
    ADD CONSTRAINT ai_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5161 (class 2606 OID 93995)
-- Name: ai_turn_traces ai_turn_traces_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_turn_traces
    ADD CONSTRAINT ai_turn_traces_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- TOC entry 5162 (class 2606 OID 94000)
-- Name: ai_turn_traces ai_turn_traces_input_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_turn_traces
    ADD CONSTRAINT ai_turn_traces_input_message_id_fkey FOREIGN KEY (input_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- TOC entry 5163 (class 2606 OID 93990)
-- Name: ai_turn_traces ai_turn_traces_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_turn_traces
    ADD CONSTRAINT ai_turn_traces_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5164 (class 2606 OID 94005)
-- Name: ai_turn_traces ai_turn_traces_output_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_turn_traces
    ADD CONSTRAINT ai_turn_traces_output_message_id_fkey FOREIGN KEY (output_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- TOC entry 5165 (class 2606 OID 94010)
-- Name: ai_turn_traces ai_turn_traces_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_turn_traces
    ADD CONSTRAINT ai_turn_traces_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE SET NULL;


--
-- TOC entry 5145 (class 2606 OID 63827)
-- Name: ai_usage_logs ai_usage_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- TOC entry 5146 (class 2606 OID 63832)
-- Name: ai_usage_logs ai_usage_logs_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- TOC entry 5147 (class 2606 OID 63817)
-- Name: ai_usage_logs ai_usage_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5148 (class 2606 OID 63891)
-- Name: ai_usage_logs ai_usage_logs_wallet_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;


--
-- TOC entry 5173 (class 2606 OID 94153)
-- Name: background_jobs background_jobs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5116 (class 2606 OID 19043)
-- Name: bot_instructions bot_instructions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_instructions
    ADD CONSTRAINT bot_instructions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5117 (class 2606 OID 19048)
-- Name: bot_personality bot_personality_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_personality
    ADD CONSTRAINT bot_personality_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5118 (class 2606 OID 19053)
-- Name: campaign_messages campaign_messages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 5119 (class 2606 OID 19058)
-- Name: campaign_messages campaign_messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- TOC entry 5120 (class 2606 OID 19063)
-- Name: campaign_messages campaign_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_messages
    ADD CONSTRAINT campaign_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5121 (class 2606 OID 19068)
-- Name: campaigns campaigns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5122 (class 2606 OID 77666)
-- Name: campaigns campaigns_parent_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_parent_campaign_id_fkey FOREIGN KEY (parent_campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- TOC entry 5123 (class 2606 OID 59225)
-- Name: campaigns campaigns_whatsapp_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_whatsapp_template_id_fkey FOREIGN KEY (whatsapp_template_id) REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL;


--
-- TOC entry 5124 (class 2606 OID 19073)
-- Name: contacts contacts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5125 (class 2606 OID 19078)
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- TOC entry 5126 (class 2606 OID 19083)
-- Name: conversations conversations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5127 (class 2606 OID 19088)
-- Name: knowledge_articles knowledge_articles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_articles
    ADD CONSTRAINT knowledge_articles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5140 (class 2606 OID 42862)
-- Name: knowledge_chunks knowledge_chunks_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.knowledge_articles(id) ON DELETE CASCADE;


--
-- TOC entry 5141 (class 2606 OID 89952)
-- Name: knowledge_chunks knowledge_chunks_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_chunks
    ADD CONSTRAINT knowledge_chunks_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5160 (class 2606 OID 92865)
-- Name: message_delivery_dlq message_delivery_dlq_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_delivery_dlq
    ADD CONSTRAINT message_delivery_dlq_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5166 (class 2606 OID 94039)
-- Name: message_delivery_events message_delivery_events_campaign_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_delivery_events
    ADD CONSTRAINT message_delivery_events_campaign_message_id_fkey FOREIGN KEY (campaign_message_id) REFERENCES public.campaign_messages(id) ON DELETE SET NULL;


--
-- TOC entry 5167 (class 2606 OID 94034)
-- Name: message_delivery_events message_delivery_events_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_delivery_events
    ADD CONSTRAINT message_delivery_events_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- TOC entry 5168 (class 2606 OID 94029)
-- Name: message_delivery_events message_delivery_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_delivery_events
    ADD CONSTRAINT message_delivery_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5128 (class 2606 OID 77671)
-- Name: messages messages_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- TOC entry 5129 (class 2606 OID 19093)
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- TOC entry 5130 (class 2606 OID 92832)
-- Name: messages messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5131 (class 2606 OID 19098)
-- Name: organization_users organization_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5157 (class 2606 OID 77703)
-- Name: psf_cases psf_cases_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.psf_cases
    ADD CONSTRAINT psf_cases_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 5158 (class 2606 OID 77708)
-- Name: psf_cases psf_cases_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.psf_cases
    ADD CONSTRAINT psf_cases_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- TOC entry 5159 (class 2606 OID 77693)
-- Name: psf_cases psf_cases_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.psf_cases
    ADD CONSTRAINT psf_cases_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5153 (class 2606 OID 74221)
-- Name: razorpay_orders razorpay_orders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_orders
    ADD CONSTRAINT razorpay_orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5154 (class 2606 OID 74226)
-- Name: razorpay_orders razorpay_orders_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_orders
    ADD CONSTRAINT razorpay_orders_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- TOC entry 5155 (class 2606 OID 74248)
-- Name: razorpay_payments razorpay_payments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5156 (class 2606 OID 74253)
-- Name: razorpay_payments razorpay_payments_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razorpay_payments
    ADD CONSTRAINT razorpay_payments_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- TOC entry 5169 (class 2606 OID 94061)
-- Name: replay_requests replay_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replay_requests
    ADD CONSTRAINT replay_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5132 (class 2606 OID 19103)
-- Name: unanswered_questions unanswered_questions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unanswered_questions
    ADD CONSTRAINT unanswered_questions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5151 (class 2606 OID 63922)
-- Name: wallet_alert_logs wallet_alert_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_alert_logs
    ADD CONSTRAINT wallet_alert_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5152 (class 2606 OID 63927)
-- Name: wallet_alert_logs wallet_alert_logs_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_alert_logs
    ADD CONSTRAINT wallet_alert_logs_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- TOC entry 5150 (class 2606 OID 63883)
-- Name: wallet_transactions wallet_transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;


--
-- TOC entry 5149 (class 2606 OID 63862)
-- Name: wallets wallets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5142 (class 2606 OID 80214)
-- Name: whatsapp_bulk_logs whatsapp_bulk_logs_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_bulk_logs
    ADD CONSTRAINT whatsapp_bulk_logs_org_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- TOC entry 5133 (class 2606 OID 19108)
-- Name: whatsapp_settings whatsapp_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_settings
    ADD CONSTRAINT whatsapp_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5143 (class 2606 OID 59196)
-- Name: whatsapp_templates whatsapp_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5134 (class 2606 OID 19113)
-- Name: workflow_logs workflow_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_logs
    ADD CONSTRAINT workflow_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- TOC entry 5135 (class 2606 OID 92840)
-- Name: workflow_logs workflow_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_logs
    ADD CONSTRAINT workflow_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5136 (class 2606 OID 19118)
-- Name: workflow_logs workflow_logs_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_logs
    ADD CONSTRAINT workflow_logs_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.workflow_steps(id) ON DELETE SET NULL;


--
-- TOC entry 5137 (class 2606 OID 19123)
-- Name: workflow_logs workflow_logs_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_logs
    ADD CONSTRAINT workflow_logs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- TOC entry 5138 (class 2606 OID 19128)
-- Name: workflow_steps workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- TOC entry 5139 (class 2606 OID 19133)
-- Name: workflows workflows_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- TOC entry 5094 (class 2606 OID 16572)
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 5113 (class 2606 OID 17212)
-- Name: prefixes prefixes_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT "prefixes_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 5110 (class 2606 OID 17158)
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 5111 (class 2606 OID 17178)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- TOC entry 5112 (class 2606 OID 17173)
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- TOC entry 5114 (class 2606 OID 17325)
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- TOC entry 5356 (class 0 OID 16525)
-- Dependencies: 362
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5370 (class 0 OID 16929)
-- Dependencies: 379
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5361 (class 0 OID 16727)
-- Dependencies: 370
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5355 (class 0 OID 16518)
-- Dependencies: 361
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5365 (class 0 OID 16816)
-- Dependencies: 374
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5364 (class 0 OID 16804)
-- Dependencies: 373
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5363 (class 0 OID 16791)
-- Dependencies: 372
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5371 (class 0 OID 16979)
-- Dependencies: 380
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5354 (class 0 OID 16507)
-- Dependencies: 360
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5368 (class 0 OID 16858)
-- Dependencies: 377
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5369 (class 0 OID 16876)
-- Dependencies: 378
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5357 (class 0 OID 16533)
-- Dependencies: 363
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5362 (class 0 OID 16757)
-- Dependencies: 371
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5367 (class 0 OID 16843)
-- Dependencies: 376
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5366 (class 0 OID 16834)
-- Dependencies: 375
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5353 (class 0 OID 16495)
-- Dependencies: 358
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5475 (class 3256 OID 41553)
-- Name: bot_instructions Allow insert instructions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert instructions" ON public.bot_instructions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_instructions.organization_id)))));


--
-- TOC entry 5474 (class 3256 OID 41552)
-- Name: bot_personality Allow insert personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert personality" ON public.bot_personality FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_personality.organization_id)))));


--
-- TOC entry 5473 (class 3256 OID 41551)
-- Name: bot_instructions Allow select instructions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow select instructions" ON public.bot_instructions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_instructions.organization_id)))));


--
-- TOC entry 5472 (class 3256 OID 41550)
-- Name: bot_personality Allow select personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow select personality" ON public.bot_personality FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_personality.organization_id)))));


--
-- TOC entry 5478 (class 3256 OID 41556)
-- Name: bot_instructions Allow update instructions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow update instructions" ON public.bot_instructions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_instructions.organization_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_instructions.organization_id)))));


--
-- TOC entry 5476 (class 3256 OID 41554)
-- Name: bot_personality Allow update personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow update personality" ON public.bot_personality FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_personality.organization_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_personality.organization_id)))));


--
-- TOC entry 5414 (class 0 OID 94090)
-- Dependencies: 467
-- Name: ai_embeddings_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_embeddings_cache ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5541 (class 3256 OID 94106)
-- Name: ai_embeddings_cache ai_embeddings_cache_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_embeddings_cache_service_only ON public.ai_embeddings_cache USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5416 (class 0 OID 94122)
-- Dependencies: 469
-- Name: ai_org_rate_limit_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_org_rate_limit_usage ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5544 (class 3256 OID 94136)
-- Name: ai_org_rate_limit_usage ai_org_rate_limit_usage_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_org_rate_limit_usage_service_only ON public.ai_org_rate_limit_usage USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5415 (class 0 OID 94107)
-- Dependencies: 468
-- Name: ai_org_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_org_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5542 (class 3256 OID 94134)
-- Name: ai_org_rate_limits ai_org_rate_limits_read_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_org_rate_limits_read_org ON public.ai_org_rate_limits FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_org_rate_limits.organization_id)))));


--
-- TOC entry 5543 (class 3256 OID 94135)
-- Name: ai_org_rate_limits ai_org_rate_limits_write_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_org_rate_limits_write_service_only ON public.ai_org_rate_limits USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5400 (class 0 OID 63775)
-- Dependencies: 428
-- Name: ai_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5498 (class 3256 OID 78940)
-- Name: ai_settings ai_settings_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_settings_members_all ON public.ai_settings USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_settings.organization_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_settings.organization_id)))));


--
-- TOC entry 5411 (class 0 OID 93977)
-- Dependencies: 461
-- Name: ai_turn_traces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_turn_traces ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5534 (class 3256 OID 94017)
-- Name: ai_turn_traces ai_turn_traces_read_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_turn_traces_read_org ON public.ai_turn_traces FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_turn_traces.organization_id)))));


--
-- TOC entry 5535 (class 3256 OID 94018)
-- Name: ai_turn_traces ai_turn_traces_write_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_turn_traces_write_service_only ON public.ai_turn_traces USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5401 (class 0 OID 63804)
-- Dependencies: 429
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5499 (class 3256 OID 78942)
-- Name: ai_usage_logs ai_usage_logs_members_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_logs_members_read ON public.ai_usage_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_usage_logs.organization_id)))));


--
-- TOC entry 5407 (class 0 OID 74279)
-- Dependencies: 435
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5491 (class 3256 OID 74293)
-- Name: audit_logs audit_logs_insert_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_insert_service_role ON public.audit_logs FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5490 (class 3256 OID 74292)
-- Name: audit_logs audit_logs_read_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_read_org ON public.audit_logs FOR SELECT USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));


--
-- TOC entry 5417 (class 0 OID 94138)
-- Dependencies: 470
-- Name: background_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5545 (class 3256 OID 94160)
-- Name: background_jobs background_jobs_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY background_jobs_service_only ON public.background_jobs USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5378 (class 0 OID 18731)
-- Dependencies: 400
-- Name: bot_instructions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bot_instructions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5445 (class 3256 OID 19425)
-- Name: bot_instructions bot_instructions_mod_service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bot_instructions_mod_service_role_only ON public.bot_instructions USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5477 (class 3256 OID 78863)
-- Name: bot_instructions bot_instructions_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bot_instructions_org_access ON public.bot_instructions USING ((organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid));


--
-- TOC entry 5379 (class 0 OID 18739)
-- Dependencies: 401
-- Name: bot_personality; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bot_personality ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5444 (class 3256 OID 19423)
-- Name: bot_personality bot_personality_mod_service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bot_personality_mod_service_role_only ON public.bot_personality USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5452 (class 3256 OID 78862)
-- Name: bot_personality bot_personality_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bot_personality_org_access ON public.bot_personality USING ((organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid));


--
-- TOC entry 5398 (class 0 OID 57900)
-- Dependencies: 426
-- Name: campaign_delivery_import; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_delivery_import ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5520 (class 3256 OID 80231)
-- Name: campaign_delivery_import campaign_delivery_import_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_delivery_import_service_role_all ON public.campaign_delivery_import TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 5409 (class 0 OID 80233)
-- Dependencies: 447
-- Name: campaign_delivery_receipt_failures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_delivery_receipt_failures ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5380 (class 0 OID 18750)
-- Dependencies: 402
-- Name: campaign_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5495 (class 3256 OID 78945)
-- Name: campaign_messages campaign_messages_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_messages_members_all ON public.campaign_messages USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = campaign_messages.organization_id)))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = campaign_messages.organization_id))))));


--
-- TOC entry 5381 (class 0 OID 18758)
-- Dependencies: 403
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5500 (class 3256 OID 78943)
-- Name: campaigns campaigns_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_members_all ON public.campaigns USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = campaigns.organization_id)))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = campaigns.organization_id))))));


--
-- TOC entry 5521 (class 3256 OID 80244)
-- Name: campaign_delivery_receipt_failures cdrf_select_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cdrf_select_org ON public.campaign_delivery_receipt_failures FOR SELECT TO authenticated USING ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));


--
-- TOC entry 5522 (class 3256 OID 80245)
-- Name: campaign_delivery_receipt_failures cdrf_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cdrf_service_role_all ON public.campaign_delivery_receipt_failures TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 5396 (class 0 OID 52732)
-- Dependencies: 424
-- Name: contact_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_uploads ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5518 (class 3256 OID 80228)
-- Name: contact_uploads contact_uploads_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_uploads_members_all ON public.contact_uploads TO authenticated USING ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))) WITH CHECK ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));


--
-- TOC entry 5519 (class 3256 OID 80230)
-- Name: contact_uploads contact_uploads_service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_uploads_service_role_all ON public.contact_uploads TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 5382 (class 0 OID 18771)
-- Dependencies: 404
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5440 (class 3256 OID 19388)
-- Name: contacts contacts_delete_org_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_delete_org_members ON public.contacts FOR DELETE USING (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));


--
-- TOC entry 5438 (class 3256 OID 19385)
-- Name: contacts contacts_insert_org_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_insert_org_members ON public.contacts FOR INSERT WITH CHECK (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));


--
-- TOC entry 5501 (class 3256 OID 78947)
-- Name: contacts contacts_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_members_all ON public.contacts USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = contacts.organization_id)))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = contacts.organization_id))))));


--
-- TOC entry 5437 (class 3256 OID 19384)
-- Name: contacts contacts_select_org_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_select_org_members ON public.contacts FOR SELECT USING (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));


--
-- TOC entry 5439 (class 3256 OID 19386)
-- Name: contacts contacts_update_org_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_update_org_members ON public.contacts FOR UPDATE USING (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));


--
-- TOC entry 5397 (class 0 OID 55014)
-- Dependencies: 425
-- Name: conversation_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5511 (class 3256 OID 80219)
-- Name: conversation_state conversation_state_select_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_state_select_org ON public.conversation_state FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.conversations conv
     JOIN public.organization_users ou ON ((ou.organization_id = conv.organization_id)))
  WHERE ((conv.id = conversation_state.conversation_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5512 (class 3256 OID 80221)
-- Name: conversation_state conversation_state_write_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_state_write_service_role ON public.conversation_state TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 5383 (class 0 OID 18779)
-- Dependencies: 405
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5502 (class 3256 OID 78949)
-- Name: conversations conversations_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversations_members_all ON public.conversations USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = conversations.organization_id)))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = conversations.organization_id))))));


--
-- TOC entry 5384 (class 0 OID 18789)
-- Dependencies: 406
-- Name: knowledge_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5504 (class 3256 OID 78954)
-- Name: knowledge_articles knowledge_articles_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_articles_members_all ON public.knowledge_articles USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = knowledge_articles.organization_id)))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = knowledge_articles.organization_id))))));


--
-- TOC entry 5394 (class 0 OID 42854)
-- Dependencies: 420
-- Name: knowledge_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5532 (class 3256 OID 92816)
-- Name: knowledge_chunks knowledge_chunks_select_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_chunks_select_members ON public.knowledge_chunks FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_chunks.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5410 (class 0 OID 92855)
-- Dependencies: 460
-- Name: message_delivery_dlq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_delivery_dlq ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5533 (class 3256 OID 92871)
-- Name: message_delivery_dlq message_delivery_dlq_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_delivery_dlq_service_only ON public.message_delivery_dlq USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5412 (class 0 OID 94019)
-- Dependencies: 462
-- Name: message_delivery_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_delivery_events ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5536 (class 3256 OID 94047)
-- Name: message_delivery_events message_delivery_events_read_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_delivery_events_read_org ON public.message_delivery_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = message_delivery_events.organization_id)))));


--
-- TOC entry 5537 (class 3256 OID 94048)
-- Name: message_delivery_events message_delivery_events_write_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_delivery_events_write_service_only ON public.message_delivery_events USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5385 (class 0 OID 18797)
-- Dependencies: 407
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5503 (class 3256 OID 78951)
-- Name: messages messages_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_members_all ON public.messages USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid()))))));


--
-- TOC entry 5471 (class 3256 OID 24330)
-- Name: organizations org_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_admin_update ON public.organizations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.organization_users
  WHERE ((organization_users.organization_id = organizations.id) AND (organization_users.user_id = auth.uid()) AND (organization_users.role = 'admin'::text)))));


--
-- TOC entry 5523 (class 3256 OID 81394)
-- Name: bot_personality org_admin_update_bot_personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_admin_update_bot_personality ON public.bot_personality FOR UPDATE USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND ((organization_users.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (organization_users.is_primary = true)))))) WITH CHECK ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND ((organization_users.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (organization_users.is_primary = true))))));


--
-- TOC entry 5418 (class 3256 OID 19138)
-- Name: campaign_messages org_members_can_manage_campaign_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_can_manage_campaign_messages ON public.campaign_messages USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaign_messages.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaign_messages.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5419 (class 3256 OID 19140)
-- Name: campaigns org_members_can_manage_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_can_manage_campaigns ON public.campaigns USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5420 (class 3256 OID 19142)
-- Name: bot_instructions org_members_manage_bot_instructions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_bot_instructions ON public.bot_instructions USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_instructions.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_instructions.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5421 (class 3256 OID 19144)
-- Name: bot_personality org_members_manage_bot_personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_bot_personality ON public.bot_personality USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5422 (class 3256 OID 19146)
-- Name: contacts org_members_manage_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_contacts ON public.contacts USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5424 (class 3256 OID 19148)
-- Name: conversations org_members_manage_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_conversations ON public.conversations USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5425 (class 3256 OID 19150)
-- Name: knowledge_articles org_members_manage_knowledge_articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_knowledge_articles ON public.knowledge_articles USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5426 (class 3256 OID 19152)
-- Name: messages org_members_manage_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_messages ON public.messages USING ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5427 (class 3256 OID 19154)
-- Name: unanswered_questions org_members_manage_unanswered_questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_unanswered_questions ON public.unanswered_questions USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5428 (class 3256 OID 19156)
-- Name: whatsapp_settings org_members_manage_whatsapp_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_whatsapp_settings ON public.whatsapp_settings USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5430 (class 3256 OID 19158)
-- Name: workflow_logs org_members_manage_workflow_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_workflow_logs ON public.workflow_logs USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_logs.workflow_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_logs.workflow_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5431 (class 3256 OID 19160)
-- Name: workflow_steps org_members_manage_workflow_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_workflow_steps ON public.workflow_steps USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_steps.workflow_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_steps.workflow_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5432 (class 3256 OID 19162)
-- Name: workflows org_members_manage_workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_manage_workflows ON public.workflows USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5469 (class 3256 OID 22976)
-- Name: bot_personality org_members_modify_bot_personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_bot_personality ON public.bot_personality USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5467 (class 3256 OID 22972)
-- Name: campaign_messages org_members_modify_campaign_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_campaign_messages ON public.campaign_messages USING ((EXISTS ( SELECT 1
   FROM (public.campaigns c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = campaign_messages.campaign_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.campaigns c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = campaign_messages.campaign_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5465 (class 3256 OID 22968)
-- Name: campaigns org_members_modify_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_campaigns ON public.campaigns USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5451 (class 3256 OID 22949)
-- Name: contacts org_members_modify_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_contacts ON public.contacts USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5454 (class 3256 OID 22952)
-- Name: conversations org_members_modify_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_conversations ON public.conversations USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5460 (class 3256 OID 22961)
-- Name: knowledge_articles org_members_modify_kb_articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_kb_articles ON public.knowledge_articles USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5456 (class 3256 OID 22955)
-- Name: messages org_members_modify_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_messages ON public.messages USING ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5463 (class 3256 OID 22965)
-- Name: unanswered_questions org_members_modify_unanswered; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_unanswered ON public.unanswered_questions USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5458 (class 3256 OID 22958)
-- Name: whatsapp_settings org_members_modify_wa_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_wa_settings ON public.whatsapp_settings USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5470 (class 3256 OID 22979)
-- Name: workflows org_members_modify_workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_modify_workflows ON public.workflows USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5488 (class 3256 OID 74261)
-- Name: razorpay_orders org_members_read_razorpay_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_read_razorpay_orders ON public.razorpay_orders FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = razorpay_orders.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5489 (class 3256 OID 74262)
-- Name: razorpay_payments org_members_read_razorpay_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_read_razorpay_payments ON public.razorpay_payments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = razorpay_payments.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5468 (class 3256 OID 22975)
-- Name: bot_personality org_members_select_bot_personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_bot_personality ON public.bot_personality FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5466 (class 3256 OID 22970)
-- Name: campaign_messages org_members_select_campaign_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_campaign_messages ON public.campaign_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.campaigns c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = campaign_messages.campaign_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5464 (class 3256 OID 22967)
-- Name: campaigns org_members_select_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_campaigns ON public.campaigns FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5450 (class 3256 OID 22948)
-- Name: contacts org_members_select_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_contacts ON public.contacts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5453 (class 3256 OID 22951)
-- Name: conversations org_members_select_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_conversations ON public.conversations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5459 (class 3256 OID 22960)
-- Name: knowledge_articles org_members_select_kb_articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_kb_articles ON public.knowledge_articles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5455 (class 3256 OID 22954)
-- Name: messages org_members_select_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_messages ON public.messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5447 (class 3256 OID 22938)
-- Name: organizations org_members_select_organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_organizations ON public.organizations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = organizations.id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5461 (class 3256 OID 22964)
-- Name: unanswered_questions org_members_select_unanswered; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_unanswered ON public.unanswered_questions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5457 (class 3256 OID 22957)
-- Name: whatsapp_settings org_members_select_wa_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_wa_settings ON public.whatsapp_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5480 (class 3256 OID 59209)
-- Name: whatsapp_templates org_members_select_whatsapp_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_whatsapp_templates ON public.whatsapp_templates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_templates.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5462 (class 3256 OID 22978)
-- Name: workflows org_members_select_workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_members_select_workflows ON public.workflows FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5434 (class 3256 OID 19375)
-- Name: organizations org_mod_service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_mod_service_role_only ON public.organizations USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5433 (class 3256 OID 19374)
-- Name: organizations org_select_visible_to_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_select_visible_to_members ON public.organizations FOR SELECT USING (((auth.role() = 'service_role'::text) OR (id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));


--
-- TOC entry 5436 (class 3256 OID 19377)
-- Name: organization_users org_users_mod_service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_users_mod_service_role_only ON public.organization_users USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5435 (class 3256 OID 19376)
-- Name: organization_users org_users_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_users_select_self ON public.organization_users FOR SELECT USING (((auth.role() = 'service_role'::text) OR (user_id = auth.uid())));


--
-- TOC entry 5386 (class 0 OID 18807)
-- Dependencies: 408
-- Name: organization_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5387 (class 0 OID 18816)
-- Dependencies: 409
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5509 (class 3256 OID 79083)
-- Name: psf_cases psf insert org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "psf insert org" ON public.psf_cases FOR INSERT WITH CHECK ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));


--
-- TOC entry 5508 (class 3256 OID 79082)
-- Name: psf_cases psf read org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "psf read org" ON public.psf_cases FOR SELECT USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));


--
-- TOC entry 5510 (class 3256 OID 79084)
-- Name: psf_cases psf update org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "psf update org" ON public.psf_cases FOR UPDATE USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid())))) WITH CHECK ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));


--
-- TOC entry 5408 (class 0 OID 77676)
-- Dependencies: 437
-- Name: psf_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.psf_cases ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5441 (class 3256 OID 78865)
-- Name: psf_cases psf_cases_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY psf_cases_org_access ON public.psf_cases USING ((organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid));


--
-- TOC entry 5492 (class 3256 OID 77725)
-- Name: psf_cases psf_cases_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY psf_cases_org_read ON public.psf_cases FOR SELECT USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));


--
-- TOC entry 5493 (class 3256 OID 77726)
-- Name: psf_cases psf_cases_org_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY psf_cases_org_write ON public.psf_cases FOR UPDATE USING ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));


--
-- TOC entry 5405 (class 0 OID 74205)
-- Dependencies: 433
-- Name: razorpay_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.razorpay_orders ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5406 (class 0 OID 74234)
-- Dependencies: 434
-- Name: razorpay_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.razorpay_payments ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5413 (class 0 OID 94049)
-- Dependencies: 463
-- Name: replay_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.replay_requests ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5539 (class 3256 OID 94068)
-- Name: replay_requests replay_requests_insert_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY replay_requests_insert_org ON public.replay_requests FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = replay_requests.organization_id)))));


--
-- TOC entry 5538 (class 3256 OID 94067)
-- Name: replay_requests replay_requests_read_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY replay_requests_read_org ON public.replay_requests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = replay_requests.organization_id)))));


--
-- TOC entry 5540 (class 3256 OID 94069)
-- Name: replay_requests replay_requests_update_service_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY replay_requests_update_service_only ON public.replay_requests FOR UPDATE USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5525 (class 3256 OID 89958)
-- Name: knowledge_chunks service role can manage knowledge chunks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role can manage knowledge chunks" ON public.knowledge_chunks TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 5531 (class 3256 OID 91563)
-- Name: knowledge_articles service role read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role read" ON public.knowledge_articles FOR SELECT TO service_role USING (true);


--
-- TOC entry 5524 (class 3256 OID 81533)
-- Name: wallet_transactions service_role_insert_wallet_txn; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_insert_wallet_txn ON public.wallet_transactions FOR INSERT WITH CHECK (true);


--
-- TOC entry 5479 (class 3256 OID 42867)
-- Name: knowledge_chunks service_role_kb_chunks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_kb_chunks ON public.knowledge_chunks TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 5388 (class 0 OID 18823)
-- Dependencies: 410
-- Name: unanswered_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5443 (class 3256 OID 78869)
-- Name: unanswered_questions unanswered_questions_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY unanswered_questions_org_access ON public.unanswered_questions USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = unanswered_questions.conversation_id) AND (c.organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid)))));


--
-- TOC entry 5429 (class 3256 OID 22942)
-- Name: organization_users user_delete_own_org_membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_delete_own_org_membership ON public.organization_users FOR DELETE USING ((user_id = auth.uid()));


--
-- TOC entry 5449 (class 3256 OID 22940)
-- Name: organization_users user_insert_own_org_membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_insert_own_org_membership ON public.organization_users FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 5448 (class 3256 OID 22939)
-- Name: organization_users user_select_own_org_membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_select_own_org_membership ON public.organization_users FOR SELECT USING ((user_id = auth.uid()));


--
-- TOC entry 5423 (class 3256 OID 22941)
-- Name: organization_users user_update_own_org_membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_update_own_org_membership ON public.organization_users FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 5446 (class 3256 OID 19427)
-- Name: whatsapp_settings wa_settings_mod_service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wa_settings_mod_service_role_only ON public.whatsapp_settings USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- TOC entry 5404 (class 0 OID 63911)
-- Dependencies: 432
-- Name: wallet_alert_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_alert_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5442 (class 3256 OID 78867)
-- Name: wallet_alert_logs wallet_alert_logs_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_alert_logs_org_access ON public.wallet_alert_logs USING ((EXISTS ( SELECT 1
   FROM public.wallets w
  WHERE ((w.id = wallet_alert_logs.wallet_id) AND (w.organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid)))));


--
-- TOC entry 5513 (class 3256 OID 80222)
-- Name: wallet_alert_logs wallet_alert_logs_select_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_alert_logs_select_org ON public.wallet_alert_logs FOR SELECT TO authenticated USING ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));


--
-- TOC entry 5514 (class 3256 OID 80223)
-- Name: wallet_alert_logs wallet_alert_logs_update_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_alert_logs_update_org ON public.wallet_alert_logs FOR UPDATE TO authenticated USING ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))) WITH CHECK ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));


--
-- TOC entry 5515 (class 3256 OID 80225)
-- Name: wallet_alert_logs wallet_alert_logs_write_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_alert_logs_write_service_role ON public.wallet_alert_logs TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 5403 (class 0 OID 63868)
-- Dependencies: 431
-- Name: wallet_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5486 (class 3256 OID 63904)
-- Name: wallet_transactions wallet_transactions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_transactions_read ON public.wallet_transactions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.wallets w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = wallet_transactions.wallet_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5402 (class 0 OID 63844)
-- Dependencies: 430
-- Name: wallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5497 (class 3256 OID 78939)
-- Name: wallets wallets_members_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallets_members_read ON public.wallets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = wallets.organization_id)))));


--
-- TOC entry 5485 (class 3256 OID 63903)
-- Name: wallets wallets_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallets_read ON public.wallets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = wallets.organization_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5395 (class 0 OID 50952)
-- Dependencies: 422
-- Name: whatsapp_bulk_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_bulk_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5516 (class 3256 OID 80226)
-- Name: whatsapp_bulk_logs whatsapp_bulk_logs_select_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_bulk_logs_select_org ON public.whatsapp_bulk_logs FOR SELECT TO authenticated USING ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));


--
-- TOC entry 5517 (class 3256 OID 80227)
-- Name: whatsapp_bulk_logs whatsapp_bulk_logs_write_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_bulk_logs_write_service_role ON public.whatsapp_bulk_logs TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 5389 (class 0 OID 18831)
-- Dependencies: 411
-- Name: whatsapp_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5505 (class 3256 OID 78956)
-- Name: whatsapp_settings whatsapp_settings_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_settings_members_all ON public.whatsapp_settings USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = whatsapp_settings.organization_id)))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = whatsapp_settings.organization_id))))));


--
-- TOC entry 5399 (class 0 OID 59183)
-- Dependencies: 427
-- Name: whatsapp_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5506 (class 3256 OID 78958)
-- Name: whatsapp_templates whatsapp_templates_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_templates_members_all ON public.whatsapp_templates USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = whatsapp_templates.organization_id)))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = whatsapp_templates.organization_id))))));


--
-- TOC entry 5390 (class 0 OID 18840)
-- Dependencies: 412
-- Name: workflow_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5496 (class 3256 OID 78937)
-- Name: workflow_logs workflow_logs_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_logs_members_all ON public.workflow_logs USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_logs.workflow_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_logs.workflow_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5391 (class 0 OID 18847)
-- Dependencies: 413
-- Name: workflow_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5494 (class 3256 OID 78935)
-- Name: workflow_steps workflow_steps_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_steps_members_all ON public.workflow_steps USING ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_steps.workflow_id) AND (ou.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_steps.workflow_id) AND (ou.user_id = auth.uid())))));


--
-- TOC entry 5392 (class 0 OID 18854)
-- Dependencies: 414
-- Name: workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5507 (class 3256 OID 78960)
-- Name: workflows workflows_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflows_members_all ON public.workflows USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = workflows.organization_id)))))) WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = workflows.organization_id))))));


--
-- TOC entry 5393 (class 0 OID 18861)
-- Dependencies: 415
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5487 (class 3256 OID 65074)
-- Name: objects Authenticated users can upload knowledge documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload knowledge documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'knowledge-documents'::text));


--
-- TOC entry 5526 (class 3256 OID 90374)
-- Name: objects Service role can access knowledge base; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Service role can access knowledge base" ON storage.objects TO service_role USING ((bucket_id = 'knowledge-base'::text)) WITH CHECK ((bucket_id = 'knowledge-base'::text));


--
-- TOC entry 5484 (class 3256 OID 65073)
-- Name: objects Service role can access knowledge documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Service role can access knowledge documents" ON storage.objects TO service_role USING ((bucket_id = 'knowledge-documents'::text)) WITH CHECK ((bucket_id = 'knowledge-documents'::text));


--
-- TOC entry 5358 (class 0 OID 16546)
-- Dependencies: 364
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5375 (class 0 OID 17278)
-- Dependencies: 391
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5376 (class 0 OID 17305)
-- Dependencies: 392
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5530 (class 3256 OID 90379)
-- Name: objects kb_auth_delete_scoped; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY kb_auth_delete_scoped ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));


--
-- TOC entry 5528 (class 3256 OID 90376)
-- Name: objects kb_auth_insert_scoped; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY kb_auth_insert_scoped ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));


--
-- TOC entry 5527 (class 3256 OID 90375)
-- Name: objects kb_auth_read_scoped; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY kb_auth_read_scoped ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));


--
-- TOC entry 5529 (class 3256 OID 90377)
-- Name: objects kb_auth_update_scoped; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY kb_auth_update_scoped ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2))))))) WITH CHECK (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));


--
-- TOC entry 5360 (class 0 OID 16588)
-- Dependencies: 366
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5359 (class 0 OID 16561)
-- Dependencies: 365
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5374 (class 0 OID 17202)
-- Dependencies: 387
-- Name: prefixes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5483 (class 3256 OID 62647)
-- Name: objects public read template media; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "public read template media" ON storage.objects FOR SELECT USING ((bucket_id = ANY (ARRAY['whatsapp-template-images'::text, 'whatsapp-template-documents'::text])));


--
-- TOC entry 5372 (class 0 OID 17149)
-- Dependencies: 385
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5373 (class 0 OID 17163)
-- Dependencies: 386
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5482 (class 3256 OID 62646)
-- Name: objects upload template documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "upload template documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'whatsapp-template-documents'::text));


--
-- TOC entry 5481 (class 3256 OID 62645)
-- Name: objects upload template images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "upload template images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'whatsapp-template-images'::text));


--
-- TOC entry 5377 (class 0 OID 17315)
-- Dependencies: 393
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 5547 (class 6104 OID 19164)
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- TOC entry 5546 (class 6104 OID 19165)
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- TOC entry 5550 (class 6106 OID 43116)
-- Name: supabase_realtime conversations; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.conversations;


--
-- TOC entry 5549 (class 6106 OID 43115)
-- Name: supabase_realtime messages; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.messages;


--
-- TOC entry 5548 (class 6106 OID 19166)
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- TOC entry 4298 (class 3466 OID 16621)
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- TOC entry 4303 (class 3466 OID 16700)
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- TOC entry 4297 (class 3466 OID 16619)
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- TOC entry 4304 (class 3466 OID 16703)
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- TOC entry 4299 (class 3466 OID 16622)
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- TOC entry 4300 (class 3466 OID 16623)
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


-- Completed on 2026-02-09 17:27:18 IST

--
-- PostgreSQL database dump complete
--

\unrestrict HBKI4CloiiKHMvjz2LKJKHJ2qzrVlKtgD60KfoLTA0P1H5qdZLKme4CSeQZ6XtL

