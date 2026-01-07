-- Enable RLS
ALTER TABLE bot_personality ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_instructions ENABLE ROW LEVEL SECURITY;

-- DROP any old policies
DROP POLICY IF EXISTS "Allow select personality" ON bot_personality;
DROP POLICY IF EXISTS "Allow insert personality" ON bot_personality;
DROP POLICY IF EXISTS "Allow update personality" ON bot_personality;

DROP POLICY IF EXISTS "Allow select instructions" ON bot_instructions;
DROP POLICY IF EXISTS "Allow insert instructions" ON bot_instructions;
DROP POLICY IF EXISTS "Allow update instructions" ON bot_instructions;

-----------------------------------------------------------
-- 1) SELECT POLICIES
-----------------------------------------------------------

CREATE POLICY "Allow select personality"
ON bot_personality
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = bot_personality.organization_id
  )
);

CREATE POLICY "Allow select instructions"
ON bot_instructions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = bot_instructions.organization_id
  )
);

-----------------------------------------------------------
-- 2) INSERT POLICIES
-----------------------------------------------------------

CREATE POLICY "Allow insert personality"
ON bot_personality
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = bot_personality.organization_id
  )
);

CREATE POLICY "Allow insert instructions"
ON bot_instructions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = bot_instructions.organization_id
  )
);

-----------------------------------------------------------
-- 3) UPDATE POLICIES
-----------------------------------------------------------

CREATE POLICY "Allow update personality"
ON bot_personality
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = bot_personality.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = bot_personality.organization_id
  )
);

CREATE POLICY "Allow update instructions"
ON bot_instructions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = bot_instructions.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = bot_instructions.organization_id
  )
);
