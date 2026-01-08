///Users/air/dealership-ai-platform/src/modules/bot-personality/BotPersonalityModule.tsx
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";

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
  greeting_message: string;


  // Phase 3
  business_context: string;
  dos: string;
  donts: string;
};

/* ------------------------------------------------------------------ */
/* MODULE                                                             */
/* ------------------------------------------------------------------ */

export function BotPersonalityModule() {
  const { activeOrganization } = useOrganizationStore();

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<PersonalityForm>({
    tone: "Professional",
    language: "English",
    response_length: "Medium",
    short_responses: false,
    emoji_usage: true,
    gender_voice: "Neutral",
    fallback_message:
      "I’m sorry, I don’t have enough information to answer that.",
    greeting_message:"Hello, How can I help you today?",

    business_context: "",
    dos: "",
    donts: "",
  });

  /* ------------------------------------------------------------------ */
  /* LOAD PERSONALITY + INSTRUCTIONS                                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!activeOrganization) return;

    const organizationId = activeOrganization.id;

    const load = async () => {
      let personalityQuery = supabase
        .from("bot_personality")
        .select("*")
        .eq("organization_id", organizationId);

      const { data: personality } = await personalityQuery.maybeSingle();

      if (personality) {
        setForm((prev) => ({
          ...prev,
          tone: personality.tone,
          language: personality.language,
          short_responses: personality.short_responses,
          emoji_usage: personality.emoji_usage,
          gender_voice: personality.gender_voice,
          fallback_message: personality.fallback_message,
          response_length: personality.short_responses ? "Short" : "Medium",

          business_context: personality.business_context ?? "",
          dos: personality.dos ?? "",
          donts: personality.donts ?? "",
        }));
      }
    };

    load().catch(console.error);
  }, [activeOrganization]);

  /* ------------------------------------------------------------------ */
  /* SAVE                                                              */
  /* ------------------------------------------------------------------ */

  const savePersonality = async () => {
    if (!activeOrganization) return;

    setLoading(true);

    const organizationId = activeOrganization.id;

    try {
      const { error: personalityError } = await supabase
        .from("bot_personality")
        .upsert(
          {
            organization_id: organizationId,
            tone: form.tone,
            language: form.language,
            short_responses: form.response_length === "Short",
            emoji_usage: form.emoji_usage,
            gender_voice: form.gender_voice,
            fallback_message: form.fallback_message,
            business_context: form.business_context,
            dos: form.dos,
            donts: form.donts,
          },
          { onConflict: "organization_id" }
        );

      if (personalityError) throw personalityError;

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
    <div className="grid grid-cols-2 gap-6">
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
              onChange={(e) => setForm((p) => ({ ...p, tone: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {tones.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Language
            </label>
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
        <h2 className="text-sm font-semibold text-slate-900">Response Style</h2>

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

          <div className="space-y-2">
  <label className="text-sm font-medium">Greeting Message</label>
  <textarea
    className="w-full rounded-md border p-2 text-sm"
    rows={3}
    placeholder="Hello 👋 How can I help you today?"
    value={form.greeting_message || ""}
    onChange={(e) =>
      setForm((prev) => ({
        ...prev,
        greeting_message: e.target.value,
      }))
    }
  />
  <p className="text-xs text-muted-foreground">
    Used when the customer sends a greeting like “Hi” or “Hello”.
  </p>
</div>

        </div>
      </div>

      {/* RIGHT — PREVIEW + SAVE */}
      <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-900">
          Business Information
        </h3>

        <p className="mt-1 text-xs text-slate-500">
          This context is used by the AI to introduce the business, greet
          customers, and respond correctly.
        </p>

        <textarea
          value={form.business_context}
          onChange={(e) =>
            setForm((p) => ({ ...p, business_context: e.target.value }))
          }
          className="mt-3 h-40 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Describe your business, services, customers, and how the AI should represent you."
        />
      </div>

      <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-900">DOs</h3>

        <textarea
          value={form.dos}
          onChange={(e) => setForm((p) => ({ ...p, dos: e.target.value }))}
          className="mt-3 h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="What should the AI always do?"
        />
      </div>

      <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-900">DON’Ts</h3>

        <textarea
          value={form.donts}
          onChange={(e) => setForm((p) => ({ ...p, donts: e.target.value }))}
          className="mt-3 h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="What should the AI never do?"
        />
      </div>

      <div className="col-span-2 flex justify-end">
        <button
          onClick={savePersonality}
          disabled={loading}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Personality"}
        </button>
      </div>
    </div>
  );
}
