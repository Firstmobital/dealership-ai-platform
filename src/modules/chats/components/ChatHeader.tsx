import { Brain, Lightbulb, PauseCircle } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useState } from "react";

type AiMode = "auto" | "suggest" | "off";

type Props = {
  conversation: {
    id: string;
    ai_mode?: AiMode | null;
    ai_enabled?: boolean | null;
  };
};

export function ChatHeader({ conversation }: Props) {
  const [aiMode, setAiMode] = useState<AiMode>(
    (conversation.ai_mode as AiMode) || "auto"
  );

  async function updateAiMode(mode: AiMode) {
    setAiMode(mode); // optimistic

    const { error } = await supabase
      .from("conversations")
      .update({ ai_mode: mode })
      .eq("id", conversation.id);

    if (error) {
      console.error("Failed to update AI mode", error);
      setAiMode((conversation.ai_mode as AiMode) || "auto");
    }
  }

  if (conversation.ai_enabled === false) return null;

  return (
    <div className="flex items-center justify-between border-b bg-background px-4 py-2">
      {/* Left */}
      <div className="text-sm font-medium text-muted-foreground">
        Conversation Controls
      </div>

      {/* Right — AI Mode Toggle */}
      <div className="flex items-center gap-1 rounded-md border bg-muted p-1">
        <button
          onClick={() => updateAiMode("auto")}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
            aiMode === "auto"
              ? "bg-green-600 text-white"
              : "text-muted-foreground hover:bg-muted"
          }`}
          title="AI replies automatically"
        >
          <Brain size={14} />
          Auto
        </button>

        <button
          onClick={() => updateAiMode("suggest")}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
            aiMode === "suggest"
              ? "bg-yellow-500 text-white"
              : "text-muted-foreground hover:bg-muted"
          }`}
          title="AI suggests replies only"
        >
          <Lightbulb size={14} />
          Suggest
        </button>

        <button
          onClick={() => updateAiMode("off")}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
            aiMode === "off"
              ? "bg-red-600 text-white"
              : "text-muted-foreground hover:bg-muted"
          }`}
          title="AI disabled"
        >
          <PauseCircle size={14} />
          Off
        </button>
      </div>
    </div>
  );
}
