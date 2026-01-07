import { useEffect } from "react";
import {
  MessageCircle,
  CheckCircle,
  AlertTriangle,
  Clock,
  X,
  Bell,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { usePsfStore } from "../../state/usePsfStore";
import type { PsfCase, PsfSentiment } from "../../types/database";

/* ============================================================================
   HELPERS
============================================================================ */

function replyBadge(psfCase: PsfCase) {
  if (psfCase.last_customer_reply_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-100 text-green-700">
        <CheckCircle size={12} /> Replied
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
    sendReminder,
  } = usePsfStore();

  /* ------------------------------------------------------------------------
     LOAD
  ------------------------------------------------------------------------ */
  useEffect(() => {
    fetchCases();
  }, []);

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
          <p className="text-xs text-gray-500 mt-1">
            Track customer responses and follow-ups
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-4 text-sm text-gray-500">
              Loading PSF cases…
            </div>
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
                    {c.phone}
                  </div>
                  {replyBadge(c)}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  Campaign: {c.campaign_name ?? "—"}
                </div>

                <div className="mt-1 text-xs text-gray-400">
                  Reminders sent: {c.reminders_sent_count ?? 0}
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
            onSendReminder={() => sendReminder(selectedCase.id)}
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
  onSendReminder,
}: {
  psfCase: PsfCase;
  onClose: () => void;
  onOpenChat: () => void;
  onResolve: () => void;
  onSendReminder: () => void;
}) {
  const maxReached =
    typeof psfCase.reminders_sent_count === "number" &&
    (psfCase.reminders_sent_count ?? 0) >= 3
;

  const reminderDisabled =
    psfCase.resolution_status === "resolved" || maxReached;

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b bg-white flex justify-between items-center">
        <div>
          <div className="font-semibold">{psfCase.phone}</div>
          <div className="text-xs text-gray-500">
            Campaign: {psfCase.campaign_name ?? "—"}
          </div>
        </div>

        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <section className="bg-white p-4 rounded border">
          <h4 className="text-sm font-semibold mb-2">Status</h4>

          <div className="flex items-center gap-2 text-sm">
            {replyBadge(psfCase)}
            <span className="text-gray-500">
              Resolution: {psfCase.resolution_status}
            </span>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            Sent at:{" "}
            {psfCase.initial_sent_at
              ? new Date(psfCase.initial_sent_at).toLocaleString()
              : "—"}
          </div>

          <div className="mt-1 text-xs text-gray-500">
            First reply:{" "}
            {psfCase.last_customer_reply_at
              ? new Date(
                  psfCase.last_customer_reply_at
                ).toLocaleString()
              : "No reply yet"}
          </div>
        </section>
      </div>

      {/* Actions */}
      <div className="p-4 border-t bg-white flex justify-between gap-2">
        <button
          onClick={onOpenChat}
          disabled={!psfCase.conversation_id}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          <MessageCircle size={16} />
          Open Chat
        </button>

        <div className="flex gap-2">
          <button
            onClick={onSendReminder}
            disabled={reminderDisabled}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded border bg-white hover:bg-gray-50 disabled:opacity-40"
            title={
              maxReached
                ? "Maximum reminders sent"
                : "Send WhatsApp reminder"
            }
          >
            <Bell size={16} />
            Send Reminder
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
    </div>
  );
}