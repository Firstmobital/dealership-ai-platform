-- BOT PERSONALITY FIX ---------------------------------------------------------

ALTER TABLE bot_personality
  DROP CONSTRAINT IF EXISTS bot_personality_pkey;

-- Remove ID column if it exists
ALTER TABLE bot_personality
  DROP COLUMN IF EXISTS id;

-- Add composite primary key
ALTER TABLE bot_personality
  ADD PRIMARY KEY (organization_id, sub_organization_id);

-- BOT INSTRUCTIONS FIX --------------------------------------------------------

ALTER TABLE bot_instructions
  DROP CONSTRAINT IF EXISTS bot_instructions_pkey;

ALTER TABLE bot_instructions
  DROP COLUMN IF EXISTS id;

ALTER TABLE bot_instructions
  ADD PRIMARY KEY (organization_id, sub_organization_id);
