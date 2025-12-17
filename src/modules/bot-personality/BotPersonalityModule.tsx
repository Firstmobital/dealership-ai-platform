///Users/air/dealership-ai-platform/src/modules/bot-personality/BotPersonalityModule.tsx
import { useEffect, useState } from "react";
import {
  Sparkles,
  Languages,
  MessageSquare,
  Smile,
  Save,
} from "lucide-react";
import toast from "react-hot-toast";

import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

/* ------------------------------------------------------------------ */
/* CONSTANTS                                                          */
/* ------------------------------------------------------------------ */

const tones = ["Professional", "Friendly", "Enthusiastic", "Conversational"];
const languages = ["English", "Hinglish", "Hindi"];
const responseLengths = ["Short", "Medium", "Detailed"];
const genderVoices = ["Neutral", "Feminine", "Masculine"];

/* ------------------------------------------------------------------ */
/* TYPES                                                              */
/* ------------------------------------------------------------------ */

type PersonalityForm = {
  tone: string;
  language: string;
  response_length: string;
  short_responses: boolean;
  emoji_usage: boolean;
  gender_voice: string;
  fallback_message: string;
  instructions: string;
};

/* ------------------------------------------------------------------ */
/* MODULE                                                             */
/* ------------------------------------------------------------------ */

export function BotPersonalityModule() {
  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<PersonalityForm>({
    tone: "Professional",
    language: "English",
    response_length: "Medium",
    short_responses: false,
    emoji_usage: true,
    gender_voice: "Neutral",
    fallback_message: "I’m sorry, I don’t have enough information to answer that.",
    instructions: JSON.stringify(
      {
        guidelines: [
          "Always greet with dealership name",
          "Ask for preferred model",
        ],
      },
      null,
      2
    ),
  });

  /* ------------------------------------------------------------------ */
  /* LOAD PERSONALITY + INSTRUCTIONS                                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!currentOrganization) return;

    const organizationId = currentOrganization.id;
    const subOrgId = activeSubOrg?.id ?? null;

    const load = async () => {
      let personalityQuery = supabase
        .from("bot_personality")
        .select("*")
        .eq("organization_id", organizationId);

      personalityQuery =
        subOrgId === null
          ? personalityQuery.is("sub_organization_id", null)
          : personalityQuery.eq("sub_organization_id", subOrgId);

      const { data: personality } = await personalityQuery.maybeSingle();

      let instructionQuery = supabase
        .from("bot_instructions")
        .select("*")
        .eq("organization_id", organizationId);

      instructionQuery =
        subOrgId === null
          ? instructionQuery.is("sub_organization_id", null)
          : instructionQuery.eq("sub_organization_id", subOrgId);

      const { data: instructions } = await instructionQuery.maybeSingle();

      if (personality) {
        setForm((prev) => ({
          ...prev,
          tone: personality.tone,
          language: personality.language,
          short_responses: personality.short_responses,
          emoji_usage: personality.emoji_usage,
          gender_voice: personality.gender_voice,
          fallback_message: personality.fallback_message,
          response_length: personality.short_responses ? "Short" : prev.response_length,
        }));
      }

      if (instructions) {
        setForm((prev) => ({
          ...prev,
          instructions: JSON.stringify(instructions.rules, null, 2),
        }));
      }
    };

    load().catch(console.error);
  }, [currentOrganization, activeSubOrg?.id]);

  /* ------------------------------------------------------------------ */
  /* SAVE                                                              */
  /* ------------------------------------------------------------------ */

  const savePersonality = async () => {
    if (!currentOrganization) return;

    setLoading(true);

    const organizationId = currentOrganization.id;
    const subOrgId = activeSubOrg?.id ?? null;

    try {
      const { error: personalityError } = await supabase
        .from("bot_personality")
        .upsert(
          {
            organization_id: organizationId,
            sub_organization_id: subOrgId,
            tone: form.tone,
            language: form.language,
            short_responses: form.response_length === "Short",
            emoji_usage: form.emoji_usage,
            gender_voice: form.gender_voice,
            fallback_message: form.fallback_message,
          },
          { onConflict: "organization_id,sub_organization_id" }
        );

      if (personalityError) throw personalityError;

      const parsedRules = JSON.parse(form.instructions || "{}");

      const { error: instructionError } = await supabase
        .from("bot_instructions")
        .upsert(
          {
            organization_id: organizationId,
            sub_organization_id: subOrgId,
            rules: parsedRules,
          },
          { onConflict: "organization_id,sub_organization_id" }
        );

      if (instructionError) throw instructionError;

      toast.success("Bot personality saved successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save bot personality");
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* UI                                                                */
  /* ------------------------------------------------------------------ */

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* LEFT — TONE & LANGUAGE */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Tone & Language
        </h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Tone</label>
            <select
              value={form.tone}
              onChange={(e) =>
                setForm((p) => ({ ...p, tone: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {tones.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Language</label>
            <select
              value={form.language}
              onChange={(e) =>
                setForm((p) => ({ ...p, language: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {languages.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Voice</label>
            <select
              value={form.gender_voice}
              onChange={(e) =>
                setForm((p) => ({ ...p, gender_voice: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {genderVoices.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* MIDDLE — RESPONSE STYLE */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Response Style
        </h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">
              Response Length
            </label>
            <select
              value={form.response_length}
              onChange={(e) =>
                setForm((p) => ({ ...p, response_length: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {responseLengths.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.emoji_usage}
              onChange={(e) =>
                setForm((p) => ({ ...p, emoji_usage: e.target.checked }))
              }
            />
            Emojis allowed
          </label>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Fallback Message
            </label>
            <textarea
              value={form.fallback_message}
              onChange={(e) =>
                setForm((p) => ({ ...p, fallback_message: e.target.value }))
              }
              className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* RIGHT — PREVIEW + SAVE */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col">
        <h2 className="text-sm font-semibold text-slate-900">Live Preview</h2>

        <div className="mt-4 text-sm space-y-3">
          <div className="text-slate-500">Customer:</div>
          <div className="rounded-md bg-slate-100 px-3 py-2">
            Hi, I want to know the price
          </div>

          <div className="text-slate-500 mt-3">Bot:</div>
          <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-900">
            {form.tone === "Friendly" ? "Sure 😊" : "Certainly."} How can I help you?
          </div>
        </div>

        <button
          onClick={savePersonality}
          disabled={loading}
          className="mt-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Personality"}
        </button>
      </div>

      {/* ADVANCED JSON INSTRUCTIONS */}
      <div className="col-span-3 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-900">
          Advanced Instructions (JSON)
        </h3>

        <textarea
          value={form.instructions}
          onChange={(e) =>
            setForm((p) => ({ ...p, instructions: e.target.value }))
          }
          className="mt-3 h-64 w-full rounded-md border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-xs"
        />
      </div>
    </div>
  );
}
