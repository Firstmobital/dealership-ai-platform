/// <reference path="./deno-ambient.d.ts" />

import OpenAI from "https://esm.sh/openai@4.47.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import {
  OPENAI_API_KEY,
  GEMINI_API_KEY,
  OPERATIONAL_SUPABASE_SERVICE_ROLE_KEY,
  OPERATIONAL_SUPABASE_URL,
  PROJECT_URL,
  SERVICE_ROLE_KEY,
} from "./env.ts";


/* ============================================================================
   CLIENTS
============================================================================ */
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
export const gemini = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

export const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export const operationalSupabase = createClient(
  OPERATIONAL_SUPABASE_URL,
  OPERATIONAL_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);
