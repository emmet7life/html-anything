"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diffLines, type ChangeObject } from "diff";
import { selectActiveTask, useStore } from "@/lib/store";
import {
  deleteRun,
  listRuns,
  updateNote,
  MAX_VERSIONS_PER_TASK,
  type RunRecord,
} from "@/lib/history/db";
import { isCurrentRun } from "@/lib/history/is-current";
import { previewHtml } from "@/lib/extract-html";
import { relativeTime, useMounted } from "@/lib/use-autosave";
import { useT } from "@/lib/i18n";

type Mode = "list" | "diff";

/**
 * Per-task version timeline. Reads from IndexedDB so the full HTML payloads
 * for past runs don't bloat localStorage. Lets the user inspect, restore,
 * or side-by-side compare any of the last `MAX_VERSIONS_PER_TASK` versions.
 */
export function HistoryPane() {
  const open = useStore((s) => s.historyPaneOpen);
  const setOpen = useStore((s) => s.setHistoryPaneOpen);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const activeTask = useStore(selectActiveTask);
  const setHtmlFor = useStore((s) => s.setHtmlFor);
  const setContent = useStore((s) => s.setContent);
  const commitBase = useStore((s) => s.commitBaseFor);
  const setStatusFor = useStore((s) => s.setStatusFor);
  const t = useT();
  const mounted = useMounted();

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  // Versions selected for the diff view. Left = older, right = newer (by default).
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [showSourceDiff, setShowSourceDiff] = useState(false);
  // Custom restore modal — replaces the native confirm() with an iframe preview
  const [restoreTarget, setRestoreTarget] = useState<RunRecord | null>(null);
  const restoreSrcDoc = useMemo(
    () => restoreTarget ? previewHtml(restoreTarget.html) : "",
    [restoreTarget],
  );

  // The persist middleware writes synchronously on every action, so we
  // refresh the list whenever the active task's html changes — that's our
  // signal that a new version was just committed.
  const activeHtml = activeTask?.html ?? "";
  const refresh = useCallback(() => {
    if (!activeTaskId) {
      setRuns([]);
      return;
    }
    setLoading(true);
    listRuns(activeTaskId)
      .then((rows) => setRuns(rows))
      .finally(() => setLoading(false));
  }, [activeTaskId]);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh, activeHtml]);

  // Whenever the task changes, drop back to list mode so we don't render
  // diff against a stale version pair.
  useEffect(() => {
    setMode("list");
    setLeftId(null);
    setRightId(null);
    setShowSourceDiff(false);
  }, [activeTaskId]);

  if (!open) return null;

  const onOpenDiff = (record: RunRecord) => {
    // Compare the picked version against the latest run if there is one,
    // otherwise against itself (degenerate but doesn't crash).
    const latest = runs[0];
    const pickRight = latest && latest.id !== record.id ? latest.id : record.id;
    setLeftId(record.id);
    setRightId(pickRight);
    setMode("diff");
  };

  const onRestore = (record: RunRecord) => {
    setRestoreTarget(record);
  };

  const onDelete = async (record: RunRecord) => {
    if (!activeTaskId) return;
    if (!confirm(t("history.deleteConfirm", { v: record.version }))) return;
    await deleteRun(activeTaskId, record.version);
    refresh();
  };

  const onConfirmRestore = () => {
    if (!restoreTarget || !activeTaskId) return;
    setHtmlFor(activeTaskId, restoreTarget.html);
    setContent(restoreTarget.content);
    setStatusFor(activeTaskId, "done");
    commitBase(activeTaskId);
    setRestoreTarget(null);
    refresh();
  };

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 280,
        background: "var(--paper)",
        borderRight: "1px solid var(--line-faint)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--line-faint)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            {t("history.heading")}
          </span>
          <span
            className="rounded-full px-1.5 text-[10px] font-mono tabular-nums"
            style={{ background: "var(--surface)", color: "var(--ink-mute)", border: "1px solid var(--line-faint)" }}
            title={t("history.versionCap", { n: MAX_VERSIONS_PER_TASK })}
          >
            {runs.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {mode === "diff" && (
            <button
              onClick={() => setMode("list")}
              className="rounded px-1.5 py-0.5 text-[11px] text-[var(--ink-mute)] hover:text-[var(--ink)]"
              title={t("history.backToList")}
            >
              ‹ {t("history.backToList")}
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="text-[14px] text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors px-1"
            title={t("history.close")}
            aria-label={t("history.close")}
          >
            ✕
          </button>
        </div>
      </div>

      {!activeTaskId ? (
        <div className="px-4 py-6 text-center text-[12px] text-[var(--ink-mute)]">
          {t("history.empty.noTask")}
        </div>
      ) : mode === "list" ? (
        <HistoryList
          runs={runs}
          loading={loading}
          mounted={mounted}
          activeHtml={activeHtml}
          onCompare={onOpenDiff}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      ) : (
        <DiffView
          runs={runs}
          leftId={leftId}
          rightId={rightId}
          onPickLeft={setLeftId}
          onPickRight={setRightId}
          showSource={showSourceDiff}
          onToggleSource={() => setShowSourceDiff((v) => !v)}
        />
      )}
      {/* Restore confirmation modal with live preview */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(2px)" }} onClick={() => setRestoreTarget(null)}>
          <div className="relative flex flex-col rounded-2xl shadow-2xl" style={{ background: "var(--paper)", border: "1px solid var(--line-soft)", width: "min(85vw, 800px)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--line-faint)" }}>
              <h3 className="text-[16px] font-semibold text-[var(--ink)] font-[family-name:var(--font-display)]">
                {t("history.restore.title")}
              </h3>
              <p className="mt-1 text-[12px] text-[var(--ink-mute)]">v{restoreTarget.version} · {(restoreTarget.html.length / 1024).toFixed(1)} KB · {new Date(restoreTarget.ts).toLocaleString()}</p>
              {restoreTarget.note && (
                <p className="mt-1 text-[11px] text-[var(--ink-soft)] italic">“{restoreTarget.note}”</p>
              )}
            </div>
            <div className="overflow-hidden" style={{ background: "#fff", height: "min(52vh, 440px)" }}>
              <iframe srcDoc={restoreSrcDoc} sandbox="allow-same-origin" className="h-full w-full" style={{ border: 0, transform: "scale(0.65)", transformOrigin: "top left", width: "154%", height: "154%" }} title="restore preview" />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--line-faint)" }}>
              <button onClick={() => setRestoreTarget(null)} className="rounded-full px-4 py-1.5 text-[12.5px] text-[var(--ink-mute)] hover:text-[var(--ink)] transition-colors">{t("history.restore.cancel")}</button>
              <button onClick={onConfirmRestore} className="rounded-full px-4 py-1.5 text-[12.5px] font-medium text-white transition-colors" style={{ background: "var(--coral)", border: "1px solid rgba(255,255,255,0.18)" }}>{t("history.restore.confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function HistoryList({
  runs,
  loading,
  mounted,
  activeHtml,
  onCompare,
  onRestore,
  onDelete,
}: {
  runs: RunRecord[];
  loading: boolean;
  mounted: boolean;
  activeHtml: string;
  onCompare: (r: RunRecord) => void;
  onRestore: (r: RunRecord) => void;
  onDelete: (r: RunRecord) => void;
}) {
  const t = useT();

  if (loading && runs.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[12px] text-[var(--ink-mute)]">
        {t("history.loading")}
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[12px] text-[var(--ink-mute)]">
        {t("history.empty.noVersions")}
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-2 pt-2.5">
      {runs.map((r) => (
        <HistoryCard
          key={r.id}
          run={r}
          isCurrent={isCurrentRun(r, runs, activeHtml)}
          mounted={mounted}
          onCompare={() => onCompare(r)}
          onRestore={() => onRestore(r)}
          onDelete={() => onDelete(r)}
        />
      ))}
    </div>
  );
}

function HistoryCard({
  run,
  isCurrent,
  mounted,
  onCompare,
  onRestore,
  onDelete,
}: {
  run: RunRecord;
  isCurrent: boolean;
  mounted: boolean;
  onCompare: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const sizeKB = (run.html.length / 1024).toFixed(1);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(run.note ?? "");
  const noteDraftRef = useRef(noteDraft);
  noteDraftRef.current = noteDraft;
  const noteOriginalRef = useRef(run.note ?? "");
  return (
    <div
      className="group relative mb-1.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--surface)]"
      style={{
        border: isCurrent ? "1px solid var(--line-soft)" : "1px solid transparent",
        background: isCurrent ? "var(--surface)" : "transparent",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="font-mono text-[11px] tabular-nums"
            style={{ color: isCurrent ? "var(--coral)" : "var(--ink-mute)" }}
          >
            v{run.version}
          </span>
          {isCurrent && (
            <span
              className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
              style={{ background: "var(--coral-soft)", color: "var(--coral)" }}
            >
              {t("history.current")}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-faint)]">
          {sizeKB} KB
        </span>
      </div>
      <div className="mt-0.5 text-[10.5px] text-[var(--ink-faint)]" suppressHydrationWarning>
        {mounted ? relativeTime(run.ts) : ""}
      </div>
      {editingNote ? (
        <div className="mt-1.5 flex items-center gap-1">
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateNote(run.taskId, run.version, noteDraftRef.current);
                setEditingNote(false);
              }
              if (e.key === "Escape") { setEditingNote(false); setNoteDraft(noteOriginalRef.current); }
            }}
            onBlur={() => {
              updateNote(run.taskId, run.version, noteDraftRef.current);
              setEditingNote(false);
            }}
            autoFocus
            maxLength={60}
            placeholder={t("history.note.placeholder")}
            className="min-w-0 flex-1 rounded px-2 py-0.5 text-[10.5px] outline-none"
            style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
          />
          <button
            onClick={() => { setEditingNote(false); setNoteDraft(noteOriginalRef.current); }}
            className="text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
          >✕</button>
        </div>
      ) : (
        <div className="mt-0.5 flex items-center gap-1 min-w-0">
          {noteDraft || run.note ? (
            <span className="text-[10.5px] text-[var(--ink-soft)] leading-snug italic truncate">{noteDraft || run.note}</span>
          ) : (
            <span className="text-[10.5px] text-[var(--ink-faint)] opacity-60">{t("history.note.placeholder")}</span>
          )}
          <button
            onClick={() => { noteOriginalRef.current = noteDraftRef.current; setEditingNote(true); }}
            className="shrink-0 rounded px-1 py-0.5 text-[9px] text-[var(--ink-faint)] hover:text-[var(--ink)] opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit note"
          >✎</button>
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onCompare}
          className="rounded border px-1.5 py-0.5 text-[10.5px] text-[var(--ink-mute)] hover:border-[var(--ink)]/30 hover:text-[var(--ink)]"
          style={{ borderColor: "var(--line-faint)" }}
        >
          {t("history.compare")}
        </button>
        <button
          onClick={onRestore}
          disabled={isCurrent}
          className="rounded border px-1.5 py-0.5 text-[10.5px] text-[var(--ink-mute)] hover:border-[var(--ink)]/30 hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: "var(--line-faint)" }}
        >
          {t("history.restore")}
        </button>
        <button
          onClick={onDelete}
          className="ml-auto rounded px-1.5 py-0.5 text-[10.5px] text-[var(--ink-faint)] hover:text-[var(--red)]"
          title={t("history.delete")}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function DiffView({
  runs,
  leftId,
  rightId,
  onPickLeft,
  onPickRight,
  showSource,
  onToggleSource,
}: {
  runs: RunRecord[];
  leftId: string | null;
  rightId: string | null;
  onPickLeft: (id: string) => void;
  onPickRight: (id: string) => void;
  showSource: boolean;
  onToggleSource: () => void;
}) {
  const t = useT();
  const left = useMemo(() => runs.find((r) => r.id === leftId) ?? null, [runs, leftId]);
  const right = useMemo(() => runs.find((r) => r.id === rightId) ?? null, [runs, rightId]);
  const changes = useMemo<ChangeObject<string>[]>(() => {
    if (!showSource || !left || !right) return [];
    // Line-level diff over the raw HTML source. This is line-level not
    // visual; we explicitly punted on visual diff in the design.
    return diffLines(left.html, right.html);
  }, [showSource, left, right]);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div
        className="grid grid-cols-2 gap-1.5 px-3 py-2 text-[11px]"
        style={{ borderBottom: "1px solid var(--line-faint)" }}
      >
        <VersionPicker
          runs={runs}
          value={leftId}
          onChange={onPickLeft}
          label={t("history.diff.leftLabel")}
        />
        <VersionPicker
          runs={runs}
          value={rightId}
          onChange={onPickRight}
          label={t("history.diff.rightLabel")}
        />
      </div>
      <div
        className="flex items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--line-faint)" }}
      >
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--ink-mute)] cursor-pointer">
          <input
            type="checkbox"
            checked={showSource}
            onChange={onToggleSource}
          />
          {t("history.diff.showSource")}
        </label>
        {left && right && (
          <span className="font-mono text-[10px] text-[var(--ink-faint)] tabular-nums">
            v{left.version} → v{right.version}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {!left || !right ? (
          <div className="px-4 py-6 text-center text-[12px] text-[var(--ink-mute)]">
            {t("history.diff.pickPair")}
          </div>
        ) : showSource ? (
          <SourceDiff changes={changes} />
        ) : (
          <VisualDiff left={left} right={right} />
        )}
      </div>
    </div>
  );
}

function VersionPicker({
  runs,
  value,
  onChange,
  label,
}: {
  runs: RunRecord[];
  value: string | null;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-[var(--surface)] px-1.5 py-1 text-[11px] text-[var(--ink)] outline-none"
        style={{ border: "1px solid var(--line-faint)" }}
      >
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            v{r.version} · {(r.html.length / 1024).toFixed(1)} KB
          </option>
        ))}
      </select>
    </label>
  );
}

function VisualDiff({ left, right }: { left: RunRecord; right: RunRecord }) {
  // Two iframes rendering each version's HTML stacked vertically (the pane
  // is narrow at 280px so horizontal split would shrink each render below
  // any useful resolution). srcdoc is intentional: it sandboxes scripts and
  // keeps history previews from contaminating the real preview pane.
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <DiffIframe label={`v${left.version}`} html={left.html} caption={t("history.diff.before")} />
      <div className="h-px shrink-0" style={{ background: "var(--line-faint)" }} />
      <DiffIframe label={`v${right.version}`} html={right.html} caption={t("history.diff.after")} />
    </div>
  );
}

function DiffIframe({ html, label, caption }: { html: string; label: string; caption: string }) {
  const srcDoc = useMemo(() => previewHtml(html), [html]);
  return (
    <div className="relative flex-1 min-h-0">
      <div
        className="absolute left-1.5 top-1.5 z-10 rounded px-1.5 py-0.5 text-[9px] font-mono"
        style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
        title={caption}
      >
        {label}
      </div>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        className="h-full w-full"
        style={{ background: "#fff", border: 0 }}
        title={caption}
      />
    </div>
  );
}

function SourceDiff({ changes }: { changes: ChangeObject<string>[] }) {
  // Line diff rendered as plain monospaced text with added / removed lines
  // tinted green / red. We deliberately don't escape — DOMPurify isn't
  // needed because we render text content into a <pre>, not innerHTML.
  return (
    <div className="h-full overflow-auto bg-[var(--paper)] font-mono text-[10.5px] leading-snug">
      {changes.map((c, i) => {
        const lines = c.value.split("\n");
        // diffLines often leaves an empty trailing element after the last \n —
        // drop it so we don't render a blank ghost row per chunk.
        if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
        const color = c.added
          ? "var(--green, #2f7d3a)"
          : c.removed
            ? "var(--red, #c0392b)"
            : "var(--ink-mute)";
        const bg = c.added
          ? "rgba(47, 125, 58, 0.08)"
          : c.removed
            ? "rgba(192, 57, 43, 0.08)"
            : "transparent";
        const prefix = c.added ? "+ " : c.removed ? "- " : "  ";
        return (
          <div key={i} style={{ background: bg }}>
            {lines.map((line, j) => (
              <div
                key={j}
                className="whitespace-pre px-2"
                style={{ color }}
              >
                {prefix}
                {line}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
