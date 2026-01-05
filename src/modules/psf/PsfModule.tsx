import { useEffect, useState } from "react";
import {
  MessageCircle,
  CheckCircle,
  AlertTriangle,
  Clock,
  X,
} from "lucide-react";

import { usePsfStore, PsfCase, PsfSentiment } from "../../state/usePsfStore";
import { useNavigate } from "react-router-dom";

/* ============================================================================
   HELPERS
============================================================================ */

function sentimentBadge(sentiment: PsfSentiment) {
  if (sentiment === "positive") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-100 text-green-700">
        <CheckCircle size={12} /> Positive
      </span>
    );
  }

  if (sentiment === "negative") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-100 text-red-700">
        <AlertTriangle size={12} /> Negative
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
      <Clock size={12} /> No Reply
    </span>
  );
}

/* ============================================================================
   MODULE
============================================================================ */

export function PsfModule() {
  const navigate = useNavigate();

  const {
    cases,
    loading,
    selectedCase,
    fetchCases,
    selectCase,
    markResolved,
  } = usePsfStore();

  const [sentimentFilter, setSentimentFilter] =
    useState<PsfSentiment | "all">("all");

  /* ------------------------------------------------------------------------
     LOAD
  ------------------------------------------------------------------------ */
  useEffect(() => {
    if (sentimentFilter === "all") {
      fetchCases();
    } else {
      fetchCases({ sentiment: sentimentFilter });
    }
  }, [sentimentFilter]);

  /* ------------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------------ */
  return (
    <div className="flex h-full">
      {/* =========================================================
          LEFT: PSF LIST
      ========================================================= */}
      <div className="w-[420px] border-r bg-white flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Post Service Feedback</h2>

          <div className="mt-3 flex gap-2">
            {["all", "positive", "negative", null].map((f) => (
              <button
                key={String(f)}
                onClick={() => setSentimentFilter(f as any)}
                className={`text-xs px-3 py-1 rounded border ${
                  sentimentFilter === f
                    ? "bg-black text-white"
                    : "bg-white text-gray-600"
                }`}
              >
                {f === "all"
                  ? "All"
                  : f === null
                  ? "No Reply"
                  : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-4 text-sm text-gray-500">Loading PSF cases…</div>
          )}

          {!loading && cases.length === 0 && (
            <div className="p-4 text-sm text-gray-500">
              No PSF cases found.
            </div>
          )}

          {!loading &&
            cases.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCase(c)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${
                  selectedCase?.id === c.id ? "bg-gray-100" : ""
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="font-medium text-sm">
                    {c.uploaded_data?.name || c.phone}
                  </div>
                  {sentimentBadge(c.sentiment)}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  {c.uploaded_data?.vehicle ||
                    c.uploaded_data?.model ||
                    "—"}
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* =========================================================
          RIGHT: DETAIL VIEW
      ========================================================= */}
      <div className="flex-1 bg-gray-50">
        {!selectedCase && (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Select a PSF case to view details
          </div>
        )}

        {selectedCase && (
          <PsfDetail
            psfCase={selectedCase}
            onClose={() => selectCase(null)}
            onOpenChat={() =>
              selectedCase.conversation_id &&
              navigate(
                `/chats?conversation_id=${selectedCase.conversation_id}`
              )
            }
            onResolve={() => markResolved(selectedCase.id)}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   DETAIL PANEL
============================================================================ */

function PsfDetail({
  psfCase,
  onClose,
  onOpenChat,
  onResolve,
}: {
  psfCase: PsfCase;
  onClose: () => void;
  onOpenChat: () => void;
  onResolve: () => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b bg-white flex justify-between items-center">
        <div>
          <div className="font-semibold">
            {psfCase.uploaded_data?.name || psfCase.phone}
          </div>
          <div className="text-xs text-gray-500">{psfCase.phone}</div>
        </div>

        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Uploaded Data */}
        <section className="bg-white p-4 rounded border">
          <h4 className="text-sm font-semibold mb-2">Service Details</h4>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
            {JSON.stringify(psfCase.uploaded_data, null, 2)}
          </pre>
        </section>

        {/* AI Summary */}
        <section className="bg-white p-4 rounded border">
          <h4 className="text-sm font-semibold mb-2">Feedback Summary</h4>
          <div className="mb-2">{sentimentBadge(psfCase.sentiment)}</div>
          <p className="text-sm text-gray-700">
            {psfCase.ai_summary || "No feedback received yet."}
          </p>
        </section>
      </div>

      {/* Actions */}
      <div className="p-4 border-t bg-white flex justify-between">
        <button
          onClick={onOpenChat}
          disabled={!psfCase.conversation_id}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          <MessageCircle size={16} />
          Open Chat
        </button>

        {psfCase.resolution_status !== "resolved" && (
          <button
            onClick={onResolve}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700"
          >
            <CheckCircle size={16} />
            Mark Resolved
          </button>
        )}
      </div>
    </div>
  );
}
