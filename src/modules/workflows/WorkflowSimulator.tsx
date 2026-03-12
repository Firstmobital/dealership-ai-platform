import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type Props = {
  workflow: any;
  steps: any[];
  onClose: () => void;
};

type SimulationResponse = {
  output?: string;
  generated_reply?: string;
  nextStep?: number;
  next_step?: number;
  current_step?: number;
  variables?: Record<string, unknown>;
  completed?: boolean;
  step_would_advance?: boolean;
  would_advance?: boolean;
  directive_action?: string;
  skipped_steps?: number[];
};

type SimulationTrace = {
  currentStep: number;
  generatedReply: string;
  wouldAdvance: boolean;
  nextStep: number;
  directiveAction: string;
  skippedSteps: number[];
};

export function WorkflowSimulator({ workflow, steps, onClose }: Props) {
  const [messages, setMessages] = useState<
    { sender: "user" | "bot"; text: string }[]
  >([]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [state, setState] = useState({
    currentStep: 1,
    variables: {},
    completed: false,
  });
  const [lastTrace, setLastTrace] = useState<SimulationTrace | null>(null);

  async function send() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");
    setMessages((m) => [...m, { sender: "user", text: userText }]);

    setLoading(true);

    const { data, error } = await supabase.functions.invoke<SimulationResponse>(
      "workflow-simulate",
      {
        body: {
          workflow: {
            id: workflow.id,
            mode: workflow.mode,
          },
          steps,
          state,
          user_message: userText,
        },
      }
    );

    setLoading(false);

    if (error || !data) {
      setMessages((m) => [
        ...m,
        { sender: "bot", text: "Simulation failed." },
      ]);
      setLastTrace(null);
      return;
    }

    const generatedReply = data.generated_reply ?? data.output ?? "";
    const nextStep = data.next_step ?? data.nextStep ?? state.currentStep;
    const currentStep = data.current_step ?? state.currentStep;
    const wouldAdvance = data.step_would_advance ?? data.would_advance ?? false;
    const directiveAction = data.directive_action ?? "unknown";
    const skippedSteps = Array.isArray(data.skipped_steps) ? data.skipped_steps : [];

    setMessages((m) => [...m, { sender: "bot", text: generatedReply || "(No output)" }]);

    setState({
      currentStep: nextStep,
      variables: (data.variables as Record<string, unknown>) ?? {},
      completed: Boolean(data.completed),
    });

    setLastTrace({
      currentStep,
      generatedReply: generatedReply || "(No output)",
      wouldAdvance,
      nextStep,
      directiveAction,
      skippedSteps,
    });
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] rounded-xl border border-slate-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="text-sm font-semibold">🧪 Workflow Simulator</div>
        <button onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="h-[360px] overflow-y-auto px-3 py-2 space-y-2 text-sm">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          <div>
            <span className="font-semibold">Current Step:</span> {state.currentStep}
          </div>
          <div>
            <span className="font-semibold">Completed:</span> {state.completed ? "Yes" : "No"}
          </div>
        </div>

        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 ${
              m.sender === "user"
                ? "ml-auto bg-blue-600 text-white"
                : "bg-slate-100 text-slate-900"
            }`}
          >
            {m.text}
          </div>
        ))}

        {lastTrace && !loading && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-slate-700">
            <div>
              <span className="font-semibold">Current Step:</span> {lastTrace.currentStep}
            </div>
            <div>
              <span className="font-semibold">Generated Reply:</span> {lastTrace.generatedReply}
            </div>
            <div>
              <span className="font-semibold">Would Advance:</span> {lastTrace.wouldAdvance ? "Yes" : "No"}
            </div>
            <div>
              <span className="font-semibold">Next Step:</span> {lastTrace.nextStep}
            </div>
            <div>
              <span className="font-semibold">Directive:</span> {lastTrace.directiveAction}
            </div>
            {lastTrace.skippedSteps.length > 0 && (
              <div>
                <span className="font-semibold">Auto-skipped:</span> {lastTrace.skippedSteps.join(", ")}
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="text-xs text-slate-400">Thinking…</div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          placeholder="Type a message…"
        />
        <button
          onClick={send}
          className="rounded-md bg-blue-600 px-3 text-sm text-white"
        >
          Send
        </button>
      </div>
    </div>
  );
}
