import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDownToLine,
  Check,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Pin,
  PinOff,
  RefreshCw,
  Settings,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  chooseMarkdownFile,
  chooseNewMarkdownPath,
  createMarkdownFile,
  getConfig,
  getRestoreNotePaths,
  getStoredNotePath,
  isTauri,
  markNoteClosed,
  openNoteWindow,
  openPathExternal,
  patchNote,
  readMarkdownFile,
  revealPath,
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
    void getRestoreNotePaths()
      .then((paths) => paths.forEach((notePath) => void handleOpen(notePath)))
      .catch((cause) => setError(String(cause)));
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
  const [lastGoodContent, setLastGoodContent] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [focused, setFocused] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const statusTimer = useRef<number | null>(null);

  const note = config?.notes.find((item) => item.path === (file?.path ?? path));
  const theme = config?.theme ?? fallbackTheme;
  const content = file?.content ?? lastGoodContent;

  const load = useCallback(
    async (silent = false) => {
      try {
        const before = contentRef.current;
        const nearBottom = before ? before.scrollHeight - before.scrollTop - before.clientHeight < 96 : true;
        const result = await readMarkdownFile(path);
        setFile(result);
        setLastGoodContent(result.content);
        setHasLoadedOnce(true);
        setError("");
        setConfig(await getConfig());
        if (!silent) {
          showStatus("Updated");
        }
        requestAnimationFrame(() => {
          const contentNode = contentRef.current;
          if (!contentNode) return;
          if (nearBottom) {
            contentNode.scrollTop = contentNode.scrollHeight;
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
          const changed = result.modifiedMs !== file?.modifiedMs || result.size !== file?.size;
          if (changed) {
            setFile(result);
            setLastGoodContent(result.content);
            setError("");
            setConfig((current) => current);
            showStatus("Updated");
            const node = contentRef.current;
            if (node && node.scrollHeight - node.scrollTop - node.clientHeight < 140) {
              requestAnimationFrame(() => {
                node.scrollTop = node.scrollHeight;
              });
            }
          }
        })
        .catch((cause) => setError(String(cause)));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [file?.modifiedMs, file?.size, path]);

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
          scrollTop: contentRef.current?.scrollTop ?? 0,
        });
      } catch {
        // Position persistence is best effort while dragging/resizing.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [path]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectNoteBody();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function selectNoteBody() {
    const node = contentRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  async function copySelection() {
    const selected = window.getSelection()?.toString() ?? "";
    if (selected) {
      await navigator.clipboard.writeText(selected);
      showStatus("Copied");
    }
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

  function handleLink(event: React.MouseEvent<HTMLAnchorElement>, href?: string) {
    if (!href) return;
    if (!event.ctrlKey) {
      event.preventDefault();
      return;
    }
  }

  function startWindowDrag(event: React.MouseEvent<HTMLElement>) {
    if (!isTauri || event.button !== 0) return;
    void getCurrentWindow().startDragging();
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
      onContextMenu={(event) => {
        event.preventDefault();
        setFocused(true);
        setMenuOpen(true);
      }}
      tabIndex={-1}
    >
      <div className="note-accent" data-tauri-drag-region onMouseDown={startWindowDrag}>
        <span data-tauri-drag-region>{pathBaseName(file?.path ?? path)}</span>
      </div>
      <div className="note-toolbar" aria-hidden={!focused}>
        <button title="Pin" onClick={() => void togglePin()}>
          {note?.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
        <button title="Open on startup" onClick={() => void toggleStartup()}>
          {note?.openOnStartup ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button title="Always on top" onClick={() => void toggleAlwaysOnTop()}>
          <Star size={15} fill={note?.alwaysOnTop ? "currentColor" : "none"} />
        </button>
        <button title="Open in external editor" onClick={() => void openPathExternal(file?.path ?? path)}>
          <Edit3 size={15} />
        </button>
        <button title="Refresh" onClick={() => void load()}>
          <RefreshCw size={15} />
        </button>
        <button
          title="Go to bottom"
          onClick={() => {
            if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }}
        >
          <ArrowDownToLine size={15} />
        </button>
        <button title="Close note" onClick={() => void closeCurrentNote(file?.path ?? path)}>
          <X size={15} />
        </button>
      </div>
      {error ? <div className="note-banner">{error}</div> : null}
      {status ? <div className="note-status">{status}</div> : null}
      <article ref={contentRef} className="note-content">
        {!hasLoadedOnce && !error ? <p className="empty-body">Loading {pathBaseName(path)}...</p> : null}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} title="Ctrl+Click to open" onClick={(event) => handleLink(event, href)}>
                {children}
              </a>
            ),
            li: ({ children, className }) => <li className={className}>{children}</li>,
          }}
        >
          {content}
        </ReactMarkdown>
        {hasLoadedOnce && !content.trim() ? <p className="empty-body">Empty note</p> : null}
      </article>
      <div className="resize-grip" aria-hidden />
      {menuOpen ? (
        <div className="note-context-menu">
          <button onClick={() => void toggleAlwaysOnTop()}>
            {note?.alwaysOnTop ? "Disable always on top" : "Always on top"}
          </button>
          <button onClick={() => void toggleStartup()}>
            {note?.openOnStartup ? "Disable open on startup" : "Open on startup"}
          </button>
          <button onClick={() => void togglePin()}>{note?.pinned ? "Unpin" : "Pin"}</button>
          <button onClick={() => void openPathExternal(file?.path ?? path)}>Open in external editor</button>
          <button onClick={() => void load()}>Refresh</button>
          <button onClick={selectNoteBody}>Select all</button>
          <button onClick={() => void copySelection()}>
            <Copy size={14} />
            Copy
          </button>
          <button onClick={() => void closeCurrentNote(file?.path ?? path)}>Close note</button>
          <button onClick={() => setMenuOpen(false)}>
            <Check size={14} />
            Close menu
          </button>
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
