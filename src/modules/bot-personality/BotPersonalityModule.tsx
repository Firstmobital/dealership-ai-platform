import { useEffect, useState } from 'react';
import { Sparkles, Languages, MessageSquare, Smile, Save } from 'lucide-react';
import { useOrganizationStore } from '../../state/useOrganizationStore';
import { supabase } from '../../lib/supabaseClient';

const tones = ['Professional', 'Friendly', 'Enthusiastic', 'Conversational'];
const languages = ['English', 'Hinglish', 'Hindi'];
const responseLengths = ['Short', 'Medium', 'Detailed'];
const genderVoices = ['Neutral', 'Feminine', 'Masculine'];

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

export function BotPersonalityModule() {
  const { currentOrganization } = useOrganizationStore();
  const [form, setForm] = useState<PersonalityForm>({
    tone: 'Professional',
    language: 'English',
    response_length: 'Medium',
    short_responses: false,
    emoji_usage: true,
    gender_voice: 'Neutral',
    fallback_message: 'I will connect you with a human agent shortly.',
    instructions: JSON.stringify({ guidelines: ['Always greet with dealership name', 'Ask for preferred model'] }, null, 2)
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchPersonality = async () => {
      if (!currentOrganization) return;
      const { data: personality } = await supabase
        .from('bot_personality')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      const { data: instructions } = await supabase
        .from('bot_instructions')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      if (personality) {
        setForm((prev) => ({
          ...prev,
          tone: personality.tone,
          language: personality.language,
          short_responses: personality.short_responses,
          emoji_usage: personality.emoji_usage,
          gender_voice: personality.gender_voice,
          fallback_message: personality.fallback_message,
          response_length: personality.short_responses ? 'Short' : prev.response_length
        }));
      }
      if (instructions) {
        setForm((prev) => ({ ...prev, instructions: JSON.stringify(instructions.rules, null, 2) }));
      }
    };
    fetchPersonality().catch(console.error);
  }, [currentOrganization]);

  const savePersonality = async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const { error: personalityError } = await supabase.from('bot_personality').upsert(
        {
          organization_id: currentOrganization.id,
          tone: form.tone,
          language: form.language,
          short_responses: form.response_length === 'Short',
          emoji_usage: form.emoji_usage,
          gender_voice: form.gender_voice,
          fallback_message: form.fallback_message
        },
        { onConflict: 'organization_id' }
      );
      if (personalityError) throw personalityError;

      const parsed = JSON.parse(form.instructions || '{}');
      const { error: instructionsError } = await supabase.from('bot_instructions').upsert(
        {
          organization_id: currentOrganization.id,
          rules: parsed
        },
        { onConflict: 'organization_id' }
      );
      if (instructionsError) throw instructionsError;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Sparkles size={18} className="text-accent" /> Personality Settings
        </h2>
        <p className="mt-1 text-sm text-slate-400">Configure AI tone, language, and behavior for each dealership.</p>
        <div className="mt-6 space-y-5">
          <div>
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              <Sparkles size={14} /> Tone
            </label>
            <select
              value={form.tone}
              onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value }))}
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            >
              {tones.map((tone) => (
                <option key={tone}>{tone}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              <Languages size={14} /> Language
            </label>
            <select
              value={form.language}
              onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))}
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            >
              {languages.map((language) => (
                <option key={language}>{language}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              <MessageSquare size={14} /> Response Length
            </label>
            <select
              value={form.response_length}
              onChange={(event) => setForm((prev) => ({ ...prev, response_length: event.target.value }))}
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            >
              {responseLengths.map((length) => (
                <option key={length}>{length}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              <Smile size={14} /> Short Responses
            </label>
            <input
              type="checkbox"
              checked={form.short_responses}
              onChange={(event) => setForm((prev) => ({ ...prev, short_responses: event.target.checked }))}
            />
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              Emoji Usage
            </label>
            <input
              type="checkbox"
              checked={form.emoji_usage}
              onChange={(event) => setForm((prev) => ({ ...prev, emoji_usage: event.target.checked }))}
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Bot Voice</label>
            <select
              value={form.gender_voice}
              onChange={(event) => setForm((prev) => ({ ...prev, gender_voice: event.target.value }))}
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            >
              {genderVoices.map((voice) => (
                <option key={voice}>{voice}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Fallback Message</label>
            <textarea
              value={form.fallback_message}
              onChange={(event) => setForm((prev) => ({ ...prev, fallback_message: event.target.value }))}
              className="mt-2 h-24 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Sparkles size={18} className="text-accent" /> Custom Instructions
        </h2>
        <p className="mt-1 text-sm text-slate-400">Provide JSON instructions consumed by the AI engine.</p>
        <textarea
          value={form.instructions}
          onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))}
          className="mt-4 h-96 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-200 focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => savePersonality().catch(console.error)}
          disabled={loading}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent/80 disabled:opacity-50"
        >
          <Save size={16} /> {loading ? 'Saving...' : 'Save Personality'}
        </button>
      </div>
    </div>
  );
}
