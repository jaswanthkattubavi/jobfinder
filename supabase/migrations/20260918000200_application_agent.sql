-- Private per-user preparation workspace. Writes go through authenticated server
-- functions with explicit ownership checks; service-only RPCs hold atomic leases.
CREATE TABLE public.agent_settings (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 daily_limit integer NOT NULL DEFAULT 5 CHECK (daily_limit BETWEEN 1 AND 20),
 min_fit integer NOT NULL DEFAULT 70 CHECK (min_fit BETWEEN 50 AND 100),
 include_stretch boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.application_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
 title text NOT NULL, company text NOT NULL, apply_url text NOT NULL,
 verdict text NOT NULL CHECK(verdict IN ('APPLY','STRETCH','SKIP')),
 fit integer NOT NULL CHECK(fit BETWEEN 0 AND 100),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','needs_input','ready','submitted','dismissed','blocked')),
 reasons jsonb NOT NULL DEFAULT '[]', cv_text text, cv_notes jsonb NOT NULL DEFAULT '[]',
 cv_version_id uuid REFERENCES public.cv_versions(id) ON DELETE SET NULL,
 questions jsonb NOT NULL DEFAULT '[]', last_error text,
 source_hash text, cv_source_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,job_id)
);
CREATE INDEX application_tasks_owner ON public.application_tasks(user_id,created_at DESC);
CREATE TABLE public.answer_memory (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 question text NOT NULL CHECK(length(question) BETWEEN 1 AND 500), question_key text NOT NULL,
 answer text NOT NULL CHECK(length(answer) BETWEEN 1 AND 4000), scope text NOT NULL DEFAULT 'global' CHECK(scope='global'),
 confirmed_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 UNIQUE(user_id,question_key)
);
CREATE TABLE public.agent_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 task_id uuid REFERENCES public.application_tasks(id) ON DELETE CASCADE,
 kind text NOT NULL, detail text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_events_owner ON public.agent_events(user_id,created_at DESC);
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_settings,public.application_tasks,public.answer_memory,public.agent_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.agent_settings,public.application_tasks,public.answer_memory,public.agent_events TO authenticated;
GRANT ALL ON public.agent_settings,public.application_tasks,public.answer_memory,public.agent_events TO service_role;
CREATE POLICY agent_settings_read ON public.agent_settings FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY application_tasks_read ON public.application_tasks FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY answer_memory_read ON public.answer_memory FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY agent_events_read ON public.agent_events FOR SELECT TO authenticated USING(auth.uid()=user_id);

-- Serialized per-user preparation. No application submission occurs in this RPC.
CREATE TABLE public.agent_locks (lock_key text PRIMARY KEY, owner uuid NOT NULL, expires_at timestamptz NOT NULL);
ALTER TABLE public.agent_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_locks FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_locks TO service_role;
CREATE FUNCTION public.acquire_agent_lock(p_key text,p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 INSERT INTO public.agent_locks(lock_key,owner,expires_at) VALUES(p_key,p_owner,now()+interval '10 minutes')
 ON CONFLICT(lock_key) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at
 WHERE agent_locks.expires_at<now();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END; $$;
CREATE FUNCTION public.release_agent_lock(p_key text,p_owner uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 DELETE FROM public.agent_locks WHERE lock_key=p_key AND owner=p_owner;
$$;
REVOKE ALL ON FUNCTION public.acquire_agent_lock(text,uuid),public.release_agent_lock(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_agent_lock(text,uuid),public.release_agent_lock(text,uuid) TO service_role;
