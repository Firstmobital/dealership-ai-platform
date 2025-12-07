-- 1) Drop any old broken constraints
ALTER TABLE bot_personality
  DROP CONSTRAINT IF EXISTS bot_personality_org_suborg_key,
  DROP CONSTRAINT IF EXISTS bot_personality_organization_id_key;

-- 2) Enforce correct uniqueness
ALTER TABLE bot_personality
  ADD CONSTRAINT bot_personality_org_suborg_key
  UNIQUE (organization_id, sub_organization_id);

ALTER TABLE bot_instructions
  DROP CONSTRAINT IF EXISTS bot_instructions_org_suborg_key,
  DROP CONSTRAINT IF EXISTS bot_instructions_organization_id_key;

ALTER TABLE bot_instructions
  ADD CONSTRAINT bot_instructions_org_suborg_key
  UNIQUE (organization_id, sub_organization_id);

