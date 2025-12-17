import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type Props = {
  workflow: any;
  steps: any[];
  onClose: () => void;
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

  async function send() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");
    setMessages((m) => [...m, { sender: "user", text: userText }]);

    setLoading(true);

    const { data, error } = await supabase.functions.invoke(
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
      return;
    }

    setMessages((m) => [...m, { sender: "bot", text: data.output }]);

    setState({
      currentStep: data.nextStep,
      variables: data.variables,
      completed: data.completed,
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
