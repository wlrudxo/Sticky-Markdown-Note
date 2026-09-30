import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDownToLine,
  Check,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  LayoutDashboard,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  Settings,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  chooseMarkdownFile,
  chooseNewMarkdownPath,
  createMarkdownFile,
  getConfig,
  getStoredNotePath,
  isTauri,
  markNoteClosed,
  openNoteWindow,
  openPathExternal,
  patchNote,
  readMarkdownFile,
  revealPath,
  saveMarkdownFile,
  showManagerWindow,
  saveConfig,
  setNoteAlwaysOnTop,
} from "./tauriApi";
import type { AppConfig, FileReadResult, NoteRecord, ThemeSettings } from "./types";

const fallbackTheme: ThemeSettings = {
  noteBg: "#fff6c7",
  accent: "#f0d24a",
  text: "#29251b",
  fontSize: 14.5,
  lineHeight: 1.45,
  radius: 8,
  shadow: 0.2,
  padding: 18,
  opacity: 1,
};

const EDIT_AUTO_SAVE_DELAY_MS = 1500;

type ContextMenuPosition = {
  x: number;
  y: number;
  alignX: "left" | "right";
  alignY: "top" | "bottom";
};

function getSearchParam(name: string) {
  return new URLSearchParams(window.location.search).get(name);
}

function formatTime(value?: number | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatEditorTimestamp(date = new Date()) {
  const period = date.getHours() < 12 ? "오전" : "오후";
  const hour = date.getHours() % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, "0");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${period} ${hour}:${minute} ${year}년 ${month}월 ${day}일 ${weekday}요일`;
}

function pathBaseName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function themeStyle(theme: ThemeSettings) {
  return {
    "--note-bg": theme.noteBg,
    "--note-accent": theme.accent,
    "--note-text": theme.text,
    "--note-font-size": `${theme.fontSize}px`,
    "--note-line-height": String(theme.lineHeight),
    "--note-radius": `${theme.radius}px`,
    "--note-shadow": String(theme.shadow),
    "--note-padding": `${theme.padding}px`,
    "--note-opacity": String(theme.opacity),
  } as React.CSSProperties;
}

export function App() {
  const path = getSearchParam("path");
  const [currentWindowLabel, setCurrentWindowLabel] = useState<string | null>(() =>
    isTauri ? getCurrentWindow().label : "browser",
  );
  const storedPath = currentWindowLabel && currentWindowLabel !== "manager" ? getStoredNotePath(currentWindowLabel) : null;

  useEffect(() => {
    if (!isTauri) return;
    setCurrentWindowLabel(getCurrentWindow().label);
  }, []);

  if (storedPath) {
    return <NoteWindow path={storedPath} />;
  }

  if (path) {
    return <NoteWindow path={path} />;
  }

  if (currentWindowLabel && currentWindowLabel !== "manager") {
    return <BootScreen label={currentWindowLabel} />;
  }

  return <ManagerWindow />;
}

function BootScreen({ label }: { label: string }) {
  return (
    <main className="boot-screen">
      <strong>Sticky Markdown Note</strong>
      <span>Opening note window: {label}</span>
      <span>Waiting for note path...</span>
    </main>
  );
}

function ManagerWindow() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<NoteRecord | null>(null);

  const reload = useCallback(async () => {
    try {
      setConfig(await getConfig());
      setError("");
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!isTauri) return;
    const unlisteners: Array<() => void> = [];
    void listen("tray-new-note", () => void handleNewNote()).then((dispose) => unlisteners.push(dispose));
    void listen("tray-load-note", () => void handleLoadNote()).then((dispose) => unlisteners.push(dispose));
    void listen("tray-open-manager", () => void reload()).then((dispose) => unlisteners.push(dispose));
    void listen<string[]>("open-note-paths", (event) => {
      event.payload.forEach((notePath) => void handleOpen(notePath));
    }).then((dispose) => unlisteners.push(dispose));
    return () => unlisteners.forEach((dispose) => dispose());
  }, [reload]);

  const notes = useMemo(() => {
    const list = [...(config?.notes ?? [])];
    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0);
    });
  }, [config?.notes]);

  const pinned = notes.filter((note) => note.pinned);
  const recent = notes.filter((note) => !note.pinned);

  async function handleOpen(path: string) {
    try {
      await openNoteWindow(path);
      await reload();
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function handleNewNote() {
    if (!config) return;
    const selected = await chooseNewMarkdownPath(config.defaultFolder);
    if (!selected) return;
    try {
      const created = await createMarkdownFile(selected);
      await openNoteWindow(created);
      await reload();
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function handleLoadNote() {
    const selected = await chooseMarkdownFile(config?.defaultFolder);
    if (!selected) return;
    await handleOpen(selected);
  }

  async function handlePatch(note: NoteRecord, patch: Partial<NoteRecord>) {
    try {
      await patchNote({
        path: note.path,
        pinned: patch.pinned,
        openOnStartup: patch.openOnStartup,
        alwaysOnTop: patch.alwaysOnTop,
      });
      await reload();
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function handleRemoveRecent(note: NoteRecord) {
    if (!config) return;
    const next = {
      ...config,
      notes: config.notes.filter((item) => item.path !== note.path),
    };
    setConfig(await saveConfig(next));
    setMenuFor(null);
  }

  return (
    <main className="manager-shell">
      <header className="manager-titlebar">
        <div className="brand-mark" aria-hidden />
        <div>
          <h1>Sticky Markdown Note</h1>
          <p>Markdown files as desktop notes</p>
        </div>
      </header>

      <section className="manager-actions">
        <button type="button" className="manager-action" onClick={handleNewNote}>
          <FilePlus2 size={18} />
          <span>+ Note</span>
        </button>
        <button type="button" className="manager-action" onClick={handleLoadNote}>
          <FolderOpen size={18} />
          <span>Load</span>
        </button>
        <button type="button" className="icon-button" title="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings size={18} />
        </button>
      </section>

      {error ? <div className="manager-error">{error}</div> : null}

      <NoteSection
        title="Pinned"
        empty="No pinned notes"
        notes={pinned}
        onOpen={handleOpen}
        onMenu={setMenuFor}
      />
      <NoteSection
        title="Recent"
        empty="No recent notes"
        notes={recent}
        onOpen={handleOpen}
        onMenu={setMenuFor}
      />

      {menuFor ? (
        <div className="manager-menu" role="menu">
          <button onClick={() => void handleOpen(menuFor.path)}>Open / bring to front</button>
          <button onClick={() => void handlePatch(menuFor, { pinned: !menuFor.pinned })}>
            {menuFor.pinned ? "Unpin" : "Pin"}
          </button>
          <button onClick={() => void handlePatch(menuFor, { openOnStartup: !menuFor.openOnStartup })}>
            {menuFor.openOnStartup ? "Disable open on startup" : "Open on startup"}
          </button>
          <button onClick={() => void revealPath(menuFor.path)}>Open file location</button>
          <button onClick={() => void openPathExternal(menuFor.path)}>Open in external editor</button>
          <button onClick={() => void handleRemoveRecent(menuFor)}>Remove from recent list</button>
          <button onClick={() => setMenuFor(null)}>Close menu</button>
        </div>
      ) : null}

      {settingsOpen && config ? (
        <SettingsDialog config={config} onClose={() => setSettingsOpen(false)} onSave={setConfig} />
      ) : null}
    </main>
  );
}

function NoteSection({
  title,
  empty,
  notes,
  onOpen,
  onMenu,
}: {
  title: string;
  empty: string;
  notes: NoteRecord[];
  onOpen: (path: string) => void;
  onMenu: (note: NoteRecord) => void;
}) {
  return (
    <section className="note-section">
      <h2>{title}</h2>
      {notes.length === 0 ? <p className="empty-note">{empty}</p> : null}
      <div className="note-card-list">
        {notes.map((note) => (
          <article
            key={note.path}
            className="note-card"
            title={note.path}
            onClick={() => onOpen(note.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              onMenu(note);
            }}
          >
            <div className="note-card-top">
              <strong>{note.displayName || pathBaseName(note.path)}</strong>
              <span>{formatTime(note.lastOpenedAt)}</span>
            </div>
            <p>{note.lastPreviewText || "Empty note"}</p>
            <div className="note-card-flags">
              {note.pinned ? <span>pinned</span> : null}
              {note.openOnStartup ? <span>startup</span> : null}
              {note.alwaysOnTop ? <span>top</span> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsDialog({
  config,
  onClose,
  onSave,
}: {
  config: AppConfig;
  onClose: () => void;
  onSave: (config: AppConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [error, setError] = useState("");

  async function persist() {
    try {
      const saved = await saveConfig(draft);
      onSave(saved);
      onClose();
    } catch (cause) {
      setError(String(cause));
    }
  }

  function updateTheme<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) {
    setDraft((current) => ({
      ...current,
      theme: {
        ...current.theme,
        [key]: value,
      },
    }));
  }

  return (
    <div className="modal-backdrop">
      <section className="settings-dialog">
        <header>
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>
        {error ? <div className="manager-error">{error}</div> : null}
        <label>
          Default folder
          <input
            value={draft.defaultFolder}
            onChange={(event) => setDraft({ ...draft, defaultFolder: event.target.value })}
          />
        </label>
        <label>
          Taskboard path
          <input
            value={draft.taskboardPath}
            onChange={(event) => setDraft({ ...draft, taskboardPath: event.target.value })}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.noteShowInTaskbar}
            onChange={(event) => setDraft({ ...draft, noteShowInTaskbar: event.target.checked })}
          />
          Show note windows in taskbar
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.windowsLoginAutostart}
            onChange={(event) => setDraft({ ...draft, windowsLoginAutostart: event.target.checked })}
          />
          Start with Windows
        </label>
        <div className="settings-grid">
          <label>
            Background
            <input type="color" value={draft.theme.noteBg} onChange={(e) => updateTheme("noteBg", e.target.value)} />
          </label>
          <label>
            Accent
            <input type="color" value={draft.theme.accent} onChange={(e) => updateTheme("accent", e.target.value)} />
          </label>
          <label>
            Font size
            <input
              type="number"
              min="12"
              max="22"
              step="0.5"
              value={draft.theme.fontSize}
              onChange={(e) => updateTheme("fontSize", Number(e.target.value))}
            />
          </label>
          <label>
            Line height
            <input
              type="number"
              min="1.1"
              max="1.9"
              step="0.05"
              value={draft.theme.lineHeight}
              onChange={(e) => updateTheme("lineHeight", Number(e.target.value))}
            />
          </label>
          <label>
            Padding
            <input
              type="number"
              min="8"
              max="40"
              value={draft.theme.padding}
              onChange={(e) => updateTheme("padding", Number(e.target.value))}
            />
          </label>
          <label>
            Radius
            <input
              type="number"
              min="0"
              max="20"
              value={draft.theme.radius}
              onChange={(e) => updateTheme("radius", Number(e.target.value))}
            />
          </label>
        </div>
        <div className="hotkey-settings">
          <label>
            Global hotkey
            <input
              placeholder="F16 or Ctrl+Alt+N"
              value={draft.hotkey.accelerator}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  hotkey: { ...draft.hotkey, accelerator: event.target.value, enabled: event.target.value.length > 0 },
                })
              }
            />
          </label>
          <label>
            Hotkey mode
            <select
              value={draft.hotkey.mode}
              onChange={(event) => setDraft({ ...draft, hotkey: { ...draft.hotkey, mode: event.target.value } })}
            >
              <option value="show">Bring notes to front</option>
              <option value="toggle">Toggle notes</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.hotkey.includeTaskboard}
              onChange={(event) =>
                setDraft({ ...draft, hotkey: { ...draft.hotkey, includeTaskboard: event.target.checked } })
              }
            />
            Include taskboard
          </label>
        </div>
        <footer>
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={() => void persist()}>
            Save
          </button>
        </footer>
      </section>
    </div>
  );
}

function NoteWindow({ path }: { path: string }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [file, setFile] = useState<FileReadResult | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [editBase, setEditBase] = useState<FileReadResult | null>(null);
  const [externalConflict, setExternalConflict] = useState<FileReadResult | null>(null);
  const [forceNextSave, setForceNextSave] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [focused, setFocused] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition>({
    x: 12,
    y: 12,
    alignX: "left",
    alignY: "top",
  });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const statusTimer = useRef<number | null>(null);
  const acknowledgedConflictKey = useRef<string | null>(null);
  const savingRef = useRef(false);
  const fileRef = useRef<FileReadResult | null>(null);
  const draftContentRef = useRef("");
  const editBaseRef = useRef<FileReadResult | null>(null);
  const forceNextSaveRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  fileRef.current = file;
  draftContentRef.current = draftContent;
  editBaseRef.current = editBase;
  forceNextSaveRef.current = forceNextSave;
  hasLoadedOnceRef.current = hasLoadedOnce;

  const note = config?.notes.find((item) => item.path === (file?.path ?? path));
  const theme = config?.theme ?? fallbackTheme;
  const hasDraftChanges = Boolean(editBase && draftContent !== editBase.content);
  const externalOverwritePending = forceNextSave;
  const editBlocked = Boolean(externalConflict);
  const unsupportedEncoding = Boolean(file && file.encoding !== "utf-8");

  const load = useCallback(
    async (silent = false) => {
      try {
        const before = editorRef.current;
        const nearBottom = before ? before.scrollHeight - before.scrollTop - before.clientHeight < 96 : true;
        const result = await readMarkdownFile(path);
        const currentBase = editBaseRef.current;
        const currentFile = fileRef.current;
        const localChanges = Boolean(
          currentBase && (draftContentRef.current !== currentBase.content || forceNextSaveRef.current),
        );
        const changed = result.modifiedMs !== currentFile?.modifiedMs || result.size !== currentFile?.size;
        if (hasLoadedOnceRef.current && changed && localChanges) {
          setExternalConflict(result);
          setError("");
          return;
        }
        fileRef.current = result;
        draftContentRef.current = result.content;
        editBaseRef.current = result;
        forceNextSaveRef.current = false;
        hasLoadedOnceRef.current = true;
        setFile(result);
        setDraftContent(result.content);
        setEditBase(result);
        setForceNextSave(false);
        setExternalConflict(null);
        acknowledgedConflictKey.current = null;
        setHasLoadedOnce(true);
        setError("");
        setConfig(await getConfig());
        if (!silent) {
          showStatus("Updated");
        }
        requestAnimationFrame(() => {
          const editor = editorRef.current;
          if (!editor) return;
          if (nearBottom) {
            editor.scrollTop = editor.scrollHeight;
          }
        });
      } catch (cause) {
        setError(String(cause));
      }
    },
    [path],
  );

  function showStatus(message: string) {
    setStatus(message);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(""), 1600);
  }

  useEffect(() => {
    void getConfig().then(setConfig);
    void load(true);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void readMarkdownFile(path)
        .then((result) => {
          const currentFile = fileRef.current;
          const currentBase = editBaseRef.current;
          const changed = result.modifiedMs !== currentFile?.modifiedMs || result.size !== currentFile?.size;
          const conflictKey = `${result.modifiedMs ?? "none"}:${result.size ?? "none"}`;
          const localChanges = Boolean(
            currentBase && (draftContentRef.current !== currentBase.content || forceNextSaveRef.current),
          );
          if (changed && localChanges) {
            if (conflictKey !== acknowledgedConflictKey.current) {
              setExternalConflict(result);
              setError("");
            }
            return;
          }
          if (changed) {
            const editor = editorRef.current;
            const nearBottom = editor ? editor.scrollHeight - editor.scrollTop - editor.clientHeight < 140 : true;
            fileRef.current = result;
            draftContentRef.current = result.content;
            editBaseRef.current = result;
            forceNextSaveRef.current = false;
            setFile(result);
            setDraftContent(result.content);
            setEditBase(result);
            setForceNextSave(false);
            setExternalConflict(null);
            acknowledgedConflictKey.current = null;
            setError("");
            showStatus("Updated");
            if (nearBottom) {
              requestAnimationFrame(() => {
                if (editorRef.current) editorRef.current.scrollTop = editorRef.current.scrollHeight;
              });
            }
          }
        })
        .catch((cause) => setError(String(cause)));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [path]);

  useEffect(() => {
    if (!isTauri) return;
    const appWindow = getCurrentWindow();
    const timer = window.setInterval(async () => {
      try {
        const position = await appWindow.outerPosition();
        const size = await appWindow.outerSize();
        await patchNote({
          path,
          wasOpenLastSession: true,
          hidden: false,
          window: {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
          },
          scrollTop: editorRef.current?.scrollTop ?? 0,
        });
      } catch {
        // Position persistence is best effort while dragging/resizing.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [path]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editBlocked) {
        if (event.ctrlKey && event.key.toLowerCase() === "s") event.preventDefault();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDraft();
        return;
      }
      if (event.key === "F5" && !unsupportedEncoding) {
        event.preventDefault();
        const editor = editorRef.current;
        if (!editor) return;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const timestamp = formatEditorTimestamp();
        setDraftContent((current) => {
          const next = `${current.slice(0, start)}${timestamp}${current.slice(end)}`;
          draftContentRef.current = next;
          return next;
        });
        requestAnimationFrame(() => {
          const caret = start + timestamp.length;
          editor.focus();
          editor.setSelectionRange(caret, caret);
        });
        return;
      }
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draftContent, editBase, editBlocked, file, forceNextSave, unsupportedEncoding]);

  useEffect(() => {
    if (!menuOpen) return;

    function closeMenu(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".note-context-menu")) return;
      setMenuOpen(false);
    }

    function closeMenuOnScroll() {
      setMenuOpen(false);
    }

    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("scroll", closeMenuOnScroll, true);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("scroll", closeMenuOnScroll, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!hasDraftChanges || forceNextSave || editBlocked || unsupportedEncoding || !editBase) return;

    const timer = window.setTimeout(() => {
      void saveDraft({ silent: true });
    }, EDIT_AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [draftContent, editBase, editBlocked, forceNextSave, hasDraftChanges, unsupportedEncoding]);

  useEffect(() => {
    if (!hasLoadedOnce) return;
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, [hasLoadedOnce]);

  function selectNoteBody() {
    editorRef.current?.select();
    editorRef.current?.focus();
  }

  async function copySelection() {
    const editor = editorRef.current;
    const selected = editor?.value.slice(editor.selectionStart, editor.selectionEnd) ?? "";
    if (selected) {
      await navigator.clipboard.writeText(selected);
      showStatus("Copied");
    }
  }

  async function saveDraft(options: { silent?: boolean } = {}) {
    const base = editBaseRef.current;
    const contentToSave = draftContentRef.current;
    const shouldForce = forceNextSaveRef.current;
    if (!base || editBlocked || unsupportedEncoding || savingRef.current) return false;
    if (contentToSave === base.content && !shouldForce) return true;
    savingRef.current = true;
    try {
      const result = await saveMarkdownFile({
        path: fileRef.current?.path ?? path,
        content: contentToSave,
        baseModifiedMs: base.modifiedMs,
        baseSize: base.size,
        force: shouldForce,
      });
      if (result.status === "conflict") {
        setExternalConflict(result.file);
        acknowledgedConflictKey.current = null;
        return false;
      }
      const hasNewerInput = draftContentRef.current !== contentToSave;
      fileRef.current = result.file;
      editBaseRef.current = result.file;
      forceNextSaveRef.current = false;
      setFile(result.file);
      if (!hasNewerInput) {
        draftContentRef.current = result.file.content;
        setDraftContent(result.file.content);
      }
      setEditBase(result.file);
      setForceNextSave(false);
      setExternalConflict(null);
      acknowledgedConflictKey.current = null;
      setConfig(await getConfig());
      showStatus(options.silent ? "Autosaved" : "Saved");
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    } finally {
      savingRef.current = false;
    }
  }

  function keepLocalDraft() {
    if (!externalConflict) return;
    acknowledgedConflictKey.current = `${externalConflict.modifiedMs ?? "none"}:${externalConflict.size ?? "none"}`;
    fileRef.current = externalConflict;
    editBaseRef.current = externalConflict;
    forceNextSaveRef.current = true;
    setFile(externalConflict);
    setEditBase(externalConflict);
    setForceNextSave(true);
    setExternalConflict(null);
    showStatus("External change will be overwritten");
    requestAnimationFrame(() => editorRef.current?.focus());
  }

  function applyExternalChange() {
    if (!externalConflict) return;
    fileRef.current = externalConflict;
    draftContentRef.current = externalConflict.content;
    editBaseRef.current = externalConflict;
    forceNextSaveRef.current = false;
    setFile(externalConflict);
    setDraftContent(externalConflict.content);
    setEditBase(externalConflict);
    setForceNextSave(false);
    acknowledgedConflictKey.current = null;
    setExternalConflict(null);
    showStatus("External change applied");
    requestAnimationFrame(() => editorRef.current?.focus());
  }

  async function toggleAlwaysOnTop() {
    const current = note?.alwaysOnTop ?? false;
    const saved = await setNoteAlwaysOnTop(file?.path ?? path, !current);
    setConfig(saved);
  }

  async function toggleStartup() {
    const saved = await patchNote({
      path: file?.path ?? path,
      openOnStartup: !(note?.openOnStartup ?? false),
    });
    setConfig(saved);
  }

  async function togglePin() {
    const saved = await patchNote({
      path: file?.path ?? path,
      pinned: !(note?.pinned ?? false),
    });
    setConfig(saved);
  }

  function startWindowDrag(event: React.MouseEvent<HTMLElement>) {
    if (!isTauri || event.button !== 0) return;
    void getCurrentWindow().startDragging();
  }

  function openContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    setFocused(true);
    setMenuPosition({
      x: event.clientX,
      y: event.clientY,
      alignX: event.clientX > window.innerWidth / 2 ? "right" : "left",
      alignY: event.clientY > window.innerHeight / 2 ? "bottom" : "top",
    });
    setMenuOpen(true);
  }

  function runMenuAction(action: () => void) {
    setMenuOpen(false);
    action();
  }

  function runAsyncMenuAction(action: () => Promise<unknown>) {
    setMenuOpen(false);
    void action();
  }

  async function closeNote() {
    if ((hasDraftChanges || forceNextSave) && !(await saveDraft())) return;
    await closeCurrentNote(file?.path ?? path);
  }

  return (
    <main
      className={`note-shell ${focused ? "is-focused" : ""}`}
      style={themeStyle(theme)}
      onMouseDown={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      }}
      onContextMenu={openContextMenu}
      tabIndex={-1}
    >
      <div className="note-accent" data-tauri-drag-region onMouseDown={startWindowDrag}>
        <span data-tauri-drag-region>{pathBaseName(file?.path ?? path)}</span>
      </div>
      <div className="note-toolbar" aria-hidden={!focused}>
        <button title="Open manager" onClick={() => void showManagerWindow()}>
          <LayoutDashboard size={15} />
        </button>
        <button title="Save" onClick={() => void saveDraft()}>
          <Save size={15} />
        </button>
        <button title="Pin" onClick={() => void togglePin()}>
          {note?.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
        <button title="Open on startup" onClick={() => void toggleStartup()}>
          {note?.openOnStartup ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button title="Always on top" onClick={() => void toggleAlwaysOnTop()}>
          <Star size={15} fill={note?.alwaysOnTop ? "currentColor" : "none"} />
        </button>
        <button title="Refresh" onClick={() => void load()}>
          <RefreshCw size={15} />
        </button>
        <button
          title="Go to bottom"
          onClick={() => {
            if (editorRef.current) editorRef.current.scrollTop = editorRef.current.scrollHeight;
          }}
        >
          <ArrowDownToLine size={15} />
        </button>
        <button title="Close note" onClick={() => void closeNote()}>
          <X size={15} />
        </button>
      </div>
      {error ? <div className="note-banner">{error}</div> : null}
      {unsupportedEncoding && !error ? (
        <div className="note-banner">UTF-8이 아닌 파일은 내용 보호를 위해 읽기 전용으로 표시됩니다.</div>
      ) : null}
      {externalOverwritePending ? <div className="note-edit-warning">External change will be overwritten</div> : null}
      {status ? <div className="note-status">{status}</div> : null}
      <textarea
        ref={editorRef}
        className="note-editor"
        value={draftContent}
        readOnly={editBlocked || unsupportedEncoding}
        aria-label={pathBaseName(file?.path ?? path)}
        placeholder={!hasLoadedOnce && !error ? `Loading ${pathBaseName(path)}...` : ""}
        spellCheck={false}
        onChange={(event) => {
          draftContentRef.current = event.target.value;
          setDraftContent(event.target.value);
        }}
      />
      <div className="resize-grip" aria-hidden />
      {menuOpen ? (
        <div
          className="note-context-menu"
          style={{
            left: menuPosition.x,
            top: menuPosition.y,
            right: "auto",
            bottom: "auto",
            transform: `translate(${menuPosition.alignX === "right" ? "-100%" : "0"}, ${
              menuPosition.alignY === "bottom" ? "-100%" : "0"
            })`,
          }}
        >
          <button onClick={() => runAsyncMenuAction(saveDraft)}>Save</button>
          <button onClick={() => runAsyncMenuAction(toggleAlwaysOnTop)}>
            {note?.alwaysOnTop ? "Disable always on top" : "Always on top"}
          </button>
          <button onClick={() => runAsyncMenuAction(toggleStartup)}>
            {note?.openOnStartup ? "Disable open on startup" : "Open on startup"}
          </button>
          <button onClick={() => runAsyncMenuAction(togglePin)}>{note?.pinned ? "Unpin" : "Pin"}</button>
          <button onClick={() => runAsyncMenuAction(() => openPathExternal(file?.path ?? path))}>Open in external editor</button>
          <button onClick={() => runAsyncMenuAction(() => load())}>Refresh</button>
          <button onClick={() => runMenuAction(selectNoteBody)}>Select all</button>
          <button onClick={() => runAsyncMenuAction(copySelection)}>
            <Copy size={14} />
            Copy
          </button>
          <button onClick={() => runAsyncMenuAction(closeNote)}>Close note</button>
          <button onClick={() => setMenuOpen(false)}>
            <Check size={14} />
            Close menu
          </button>
        </div>
      ) : null}
      {externalConflict ? (
        <div className="modal-backdrop">
          <section className="note-dialog">
            <h2>External change detected</h2>
            <p>The Markdown file changed outside this note while you were editing.</p>
            <footer>
              <button className="secondary-button" onClick={keepLocalDraft}>
                Keep my edit
              </button>
              <button className="primary-button" onClick={applyExternalChange}>
                Use external change
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

async function closeCurrentNote(path: string) {
  await markNoteClosed(path);
  if (isTauri) {
    await getCurrentWindow().close();
  }
}
