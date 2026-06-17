"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, MessageSquarePlus, Pencil, Trash2, UserCircle2 } from "lucide-react";
import {
  addQuoteComment,
  deleteQuoteComment,
  editQuoteComment,
  loadQuoteComments,
  type QuoteCommentRow
} from "@/app/(app)/quotes/comments-actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type CommentThreadProps = {
  quoteId: string;
  initialComments: QuoteCommentRow[];
  currentUser: {
    id: string;
    full_name: string;
    email: string;
  };
  /**
   * Legacy single-textarea comment that pre-dates the comments table.
   * If present and no comments exist, we surface it as a pinned legacy note
   * so the team doesn't lose the previous conversation.
   */
  legacyNote?: string | null;
};

/**
 * Author + timestamp + history timeline for a quote's working notes.
 *
 * Why a separate component: this is reused on the pipeline expanded row and
 * the quote detail page, and Phase 3 needed the textarea-with-no-author-or-
 * history pattern replaced everywhere it was used.
 */
export function CommentThread({ quoteId, initialComments, currentUser, legacyNote }: CommentThreadProps) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  // Group comments into chains by revision_of, then derive the "visible"
  // latest version of each chain. This is what we render in the timeline;
  // the older revisions live behind a "view history" disclosure.
  const { visibleComments, historyByRoot } = useMemo(() => groupComments(comments), [comments]);

  function showError(message: string) {
    setError(message);
    // Auto-clear after a few seconds so it doesn't stay stuck on the screen.
    window.setTimeout(() => setError((current) => (current === message ? null : current)), 6000);
  }

  function handleAdd() {
    const body = draft.trim();
    if (!body) {
      showError("Type something before saving.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await addQuoteComment({ quote_id: quoteId, body });
      if (!result.ok) {
        showError(result.message);
        return;
      }
      setComments((current) => [result.comment, ...current]);
      setDraft("");
      draftRef.current?.focus();
    });
  }

  function handleEditSave(commentId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) {
      showError("Comment cannot be empty.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await editQuoteComment({ comment_id: commentId, body: trimmed });
      if (!result.ok) {
        showError(result.message);
        return;
      }
      // The edit inserts a new row (the revision) and marks the original's
      // edited_at. Refresh state by adding the new row and patching the old.
      setComments((current) => [
        result.comment,
        ...current.map((c) =>
          c.id === commentId ? { ...c, edited_at: new Date().toISOString() } : c
        )
      ]);
      setEditingId(null);
    });
  }

  function handleDelete(commentId: string) {
    if (!confirm("Delete this comment? It will be hidden from the timeline but kept for audit.")) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteQuoteComment({ comment_id: commentId });
      if (!result.ok) {
        showError(result.message);
        return;
      }
      setComments((current) =>
        current.map((c) => (c.id === commentId ? { ...c, deleted_at: new Date().toISOString() } : c))
      );
    });
  }

  const hasLegacy = !!legacyNote?.trim();

  return (
    <div className="space-y-3">
      {/* Add new --------------------------------------------------------- */}
      <div className="rounded-md border border-[#e6ebdc] bg-white p-3">
        <label className="grid gap-2 text-[11px] font-black uppercase tracking-wide text-neutral-500">
          New comment
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Cmd/Ctrl + Enter to save without leaving the box. Common power-user shortcut.
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Call summary, next move, objection, promised follow-up… (Cmd/Ctrl + Enter to save)"
            className="focus-ring min-h-20 w-full rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm text-black"
          />
        </label>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-neutral-500">
            Posted as <span className="font-bold text-neutral-700">{currentUser.full_name}</span>
          </p>
          <Button type="button" onClick={handleAdd} disabled={pending || !draft.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
            Add comment
          </Button>
        </div>
      </div>

      {error ? <Notice tone="red">{error}</Notice> : null}

      {/* Timeline -------------------------------------------------------- */}
      <ol className="space-y-2">
        {visibleComments.map((comment) => {
          const history = historyByRoot.get(rootIdOf(comment, comments)) ?? [];
          const isEditing = editingId === comment.id;
          const isAuthor = comment.author_id === currentUser.id;
          const isDeleted = !!comment.deleted_at;
          const showHistoryToggle = history.length > 1;
          const open = !!historyOpen[comment.id];

          return (
            <li
              key={comment.id}
              className={cn(
                "rounded-md border bg-white p-3 transition",
                isDeleted ? "border-dashed border-[#d9ded1] opacity-70" : "border-[#e6ebdc]"
              )}
            >
              <header className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <UserCircle2 className="h-4 w-4 shrink-0 text-neutral-400" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-black">
                      {comment.author_name ?? "Unknown user"}
                      {comment.author_id === currentUser.id ? (
                        <span className="ml-1 font-normal text-neutral-400">(you)</span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {formatDateTime(comment.created_at)}
                      {comment.revision_of ? <span className="ml-1 text-[#6a912f]">· edited</span> : null}
                    </p>
                  </div>
                </div>

                {isAuthor && !isDeleted && !isEditing ? (
                  <div className="flex items-center gap-1">
                    <IconAction onClick={() => setEditingId(comment.id)} label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </IconAction>
                    <IconAction onClick={() => handleDelete(comment.id)} label="Delete" tone="danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconAction>
                  </div>
                ) : null}
              </header>

              {isDeleted ? (
                <p className="mt-2 text-xs italic text-neutral-500">
                  Comment removed by{" "}
                  {comment.author_id === currentUser.id ? "you" : "the author"} on{" "}
                  {formatDateTime(comment.deleted_at)}.
                </p>
              ) : isEditing ? (
                <CommentEditor
                  initialBody={comment.body}
                  onCancel={() => setEditingId(null)}
                  onSave={(body) => handleEditSave(comment.id, body)}
                  pending={pending}
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">{comment.body}</p>
              )}

              {showHistoryToggle && !isEditing ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setHistoryOpen((current) => ({ ...current, [comment.id]: !current[comment.id] }))
                    }
                    className="focus-ring inline-flex items-center gap-1 text-[11px] font-bold text-neutral-500 hover:text-black"
                  >
                    <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
                    {open ? "Hide history" : `View history (${history.length - 1})`}
                  </button>
                  {open ? (
                    <ol className="mt-2 space-y-2 border-l-2 border-[#e6ebdc] pl-3">
                      {history
                        .filter((revision) => revision.id !== comment.id)
                        .map((revision) => (
                          <li key={revision.id} className="text-xs leading-5 text-neutral-600">
                            <p className="text-[11px] text-neutral-500">{formatDateTime(revision.created_at)}</p>
                            <p className="mt-1 whitespace-pre-wrap">{revision.body}</p>
                          </li>
                        ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}

        {!visibleComments.length && !hasLegacy ? (
          <li className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-xs text-neutral-500">
            No comments yet. The first note you add will start the timeline.
          </li>
        ) : null}
      </ol>

      {hasLegacy ? (
        <div className="rounded-md border border-dashed border-[#d9ded1] bg-[#fbfcf8] p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Legacy note</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{legacyNote}</p>
          <p className="mt-2 text-[11px] text-neutral-500">
            Pre-timeline notes are preserved here. New comments appear above.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CommentEditor({
  initialBody,
  onCancel,
  onSave,
  pending
}: {
  initialBody: string;
  onCancel: () => void;
  onSave: (body: string) => void;
  pending: boolean;
}) {
  const [body, setBody] = useState(initialBody);

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        autoFocus
        className="focus-ring min-h-20 w-full rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm text-black"
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => onSave(body)}
          disabled={pending || !body.trim() || body.trim() === initialBody.trim()}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save edit
        </Button>
      </div>
    </div>
  );
}

function IconAction({
  children,
  onClick,
  label,
  tone
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-[#eef2e6]",
        tone === "danger" && "hover:bg-[#fff0ed] hover:text-[#b42318]"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Build (a) the list of comments to show in the timeline (latest revision of
 * each chain, plus standalone non-edited comments), and (b) a map from root id
 * to the full ordered history of that chain, so the disclosure can render
 * the previous versions.
 */
function groupComments(comments: QuoteCommentRow[]) {
  // index by id for fast chain walking
  const byId = new Map(comments.map((comment) => [comment.id, comment]));

  const childOf = new Map<string, QuoteCommentRow>(); // revision_of -> child
  for (const comment of comments) {
    if (comment.revision_of) childOf.set(comment.revision_of, comment);
  }

  // Find chain roots: comments that are not the revision_of of any other.
  const roots: QuoteCommentRow[] = [];
  for (const comment of comments) {
    if (!comment.revision_of) roots.push(comment);
  }
  // Also include orphan revisions whose parent isn't loaded (very unlikely
  // unless the parent was hard-deleted by an admin).
  for (const comment of comments) {
    if (comment.revision_of && !byId.has(comment.revision_of)) roots.push(comment);
  }

  const historyByRoot = new Map<string, QuoteCommentRow[]>();
  const visibleComments: QuoteCommentRow[] = [];

  for (const root of roots) {
    // Walk down to the latest non-revised version.
    let latest = root;
    const history = [root];
    let child = childOf.get(root.id);
    while (child) {
      history.push(child);
      latest = child;
      child = childOf.get(child.id);
    }
    visibleComments.push(latest);
    // Sort history oldest-first so the disclosure reads naturally top-to-bottom.
    historyByRoot.set(
      root.id,
      [...history].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    );
  }

  // Timeline order: newest activity (created_at OR edited_at) first.
  visibleComments.sort((a, b) => {
    const aTime = new Date(a.edited_at ?? a.created_at).getTime();
    const bTime = new Date(b.edited_at ?? b.created_at).getTime();
    return bTime - aTime;
  });

  return { visibleComments, historyByRoot };
}

function rootIdOf(comment: QuoteCommentRow, allComments: QuoteCommentRow[]): string {
  if (!comment.revision_of) return comment.id;
  const byId = new Map(allComments.map((c) => [c.id, c]));
  let cursor: QuoteCommentRow | undefined = comment;
  const seen = new Set<string>();
  while (cursor?.revision_of && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const parent = byId.get(cursor.revision_of);
    if (!parent) return cursor.revision_of; // orphan: treat parent id as root
    cursor = parent;
  }
  return cursor?.id ?? comment.id;
}

/**
 * Lazy variant for the pipeline: fetches the comment list on first mount so
 * we don't load comments for 250+ quotes upfront. Renders a small skeleton
 * while loading and falls back to the standard CommentThread once loaded.
 *
 * Each instance is short-lived (mounted on row expand, unmounted on collapse),
 * so refetching on next expand is fine and keeps the data fresh.
 */
export function LazyCommentThread({
  quoteId,
  currentUser,
  legacyNote
}: {
  quoteId: string;
  currentUser: CommentThreadProps["currentUser"];
  legacyNote?: string | null;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; comments: QuoteCommentRow[] }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const comments = await loadQuoteComments(quoteId);
        if (!cancelled) setState({ status: "ready", comments });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Could not load comments."
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-[#d9ded1] bg-[#fbfcf8] p-4 text-xs text-neutral-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading comments…
      </div>
    );
  }

  if (state.status === "error") {
    return <Notice tone="red">{state.message}</Notice>;
  }

  return (
    <CommentThread
      quoteId={quoteId}
      initialComments={state.comments}
      currentUser={currentUser}
      legacyNote={legacyNote}
    />
  );
}
