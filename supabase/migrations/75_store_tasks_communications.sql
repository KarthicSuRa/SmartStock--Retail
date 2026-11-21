-- /supabase/migrations/75_store_tasks_communications.sql
-- SmartStock — Store employee daily tasks (cleaning, bin movements, replenishment, counts, receiving)
-- and team communications (announcements, shift notes, messages with read receipts).
-- UI: /tasks

CREATE TABLE IF NOT EXISTS store_tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plant_code    VARCHAR(10) NOT NULL,
    title         TEXT NOT NULL,
    task_type     VARCHAR(20) NOT NULL CHECK (task_type IN ('cleaning', 'bin_movement', 'replenish', 'count', 'receiving', 'other')),
    priority      VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    status        VARCHAR(15) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
    recurrence    VARCHAR(10) NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once', 'daily', 'weekly')),
    task_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    due_time      TIME,
    location      TEXT,                                -- aisle / shelf / bin
    sku           VARCHAR(50),                         -- for bin movement / replenish tasks
    assignee_id   UUID REFERENCES auth.users(id),
    created_by    UUID REFERENCES auth.users(id),
    created_source VARCHAR(20) DEFAULT 'manual' CHECK (created_source IN ('manual', 'replenishment', 'count_prioritizer', 'sap_inbound', 'recurrence')),
    template_id   UUID,                                -- parent recurring task
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    completed_by  UUID REFERENCES auth.users(id),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    CHECK (status <> 'done' OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_store_tasks_day ON store_tasks(tenant_id, plant_code, task_date, status);
CREATE INDEX IF NOT EXISTS idx_store_tasks_assignee ON store_tasks(tenant_id, assignee_id, task_date);

CREATE TABLE IF NOT EXISTS store_task_checklist (
    task_id     UUID NOT NULL REFERENCES store_tasks(id) ON DELETE CASCADE,
    position    SMALLINT NOT NULL,
    text        TEXT NOT NULL,
    is_done     BOOLEAN NOT NULL DEFAULT FALSE,
    done_by     UUID REFERENCES auth.users(id),
    done_at     TIMESTAMPTZ,
    PRIMARY KEY (task_id, position)
);

-- A task cannot be completed while checklist steps are open
CREATE OR REPLACE FUNCTION enforce_task_checklist() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND EXISTS (
        SELECT 1 FROM store_task_checklist WHERE task_id = NEW.id AND NOT is_done
    ) THEN
        RAISE EXCEPTION 'Task % has open checklist steps', NEW.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_checklist ON store_tasks;
CREATE TRIGGER trg_task_checklist BEFORE UPDATE OF status ON store_tasks
    FOR EACH ROW EXECUTE FUNCTION enforce_task_checklist();

CREATE TABLE IF NOT EXISTS store_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plant_code  VARCHAR(10) NOT NULL,
    kind        VARCHAR(15) NOT NULL CHECK (kind IN ('announcement', 'shift_note', 'message')),
    body        TEXT NOT NULL,
    is_pinned   BOOLEAN DEFAULT FALSE,
    author_id   UUID REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_store_messages ON store_messages(tenant_id, plant_code, created_at DESC);

CREATE TABLE IF NOT EXISTS store_message_receipts (
    message_id  UUID NOT NULL REFERENCES store_messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
);

-- Daily completion KPI per store & employee
CREATE OR REPLACE VIEW v_task_completion_daily AS
SELECT tenant_id, plant_code, task_date, assignee_id,
       COUNT(*)                                   AS assigned,
       COUNT(*) FILTER (WHERE status = 'done')    AS completed,
       COUNT(*) FILTER (WHERE status <> 'done' AND due_time IS NOT NULL AND task_date = CURRENT_DATE AND due_time < LOCALTIME) AS overdue
FROM store_tasks
WHERE status <> 'cancelled'
GROUP BY tenant_id, plant_code, task_date, assignee_id;

-- ==================== RLS ====================
ALTER TABLE store_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_task_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_message_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_tasks_tenant_isolation ON store_tasks;
CREATE POLICY store_tasks_tenant_isolation ON store_tasks FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);

DROP POLICY IF EXISTS store_messages_tenant_isolation ON store_messages;
CREATE POLICY store_messages_tenant_isolation ON store_messages FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);

DROP POLICY IF EXISTS store_task_checklist_tenant_isolation ON store_task_checklist;
CREATE POLICY store_task_checklist_tenant_isolation ON store_task_checklist FOR ALL
    USING (EXISTS (SELECT 1 FROM store_tasks t WHERE t.id = task_id AND t.tenant_id = current_setting('app.current_tenant', true)::UUID));

DROP POLICY IF EXISTS store_message_receipts_tenant_isolation ON store_message_receipts;
CREATE POLICY store_message_receipts_tenant_isolation ON store_message_receipts FOR ALL
    USING (EXISTS (SELECT 1 FROM store_messages m WHERE m.id = message_id AND m.tenant_id = current_setting('app.current_tenant', true)::UUID));
