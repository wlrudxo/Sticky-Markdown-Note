import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AppConfig, FileReadResult, NotePatch } from "./types";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const isTauri = "__TAURI_INTERNALS__" in window;

export function getConfig(): Promise<AppConfig> {
  return invoke("get_config");
}

export function saveConfig(config: AppConfig): Promise<AppConfig> {
  return invoke("save_config", { config });
}

export function patchNote(patch: NotePatch): Promise<AppConfig> {
  return invoke("patch_note", { patch });
}

export function readMarkdownFile(path: string): Promise<FileReadResult> {
  return invoke("read_markdown_file", { path });
}

type NoteWindowSpec = {
  label: string;
  path: string;
  title: string;
  width: number;
  height: number;
  x?: number | null;
  y?: number | null;
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
};

const notePathStoragePrefix = "smn.notePath.";
const pendingNoteWindows = new Map<string, Promise<string>>();

export function getStoredNotePath(label: string): string | null {
  return window.localStorage.getItem(`${notePathStoragePrefix}${label}`);
}

export function createMarkdownFile(path: string): Promise<string> {
  return invoke("create_markdown_file", { path });
}

export function getRestoreNotePaths(): Promise<string[]> {
  return invoke("get_restore_note_paths");
}

export async function openNoteWindow(path: string): Promise<string> {
  const spec = await invoke<NoteWindowSpec>("prepare_note_window", { path });
  const pending = pendingNoteWindows.get(spec.label);
  if (pending) return pending;

  const open = openPreparedNoteWindow(spec).finally(() => {
    pendingNoteWindows.delete(spec.label);
  });
  pendingNoteWindows.set(spec.label, open);
  return open;
}

async function openPreparedNoteWindow(spec: NoteWindowSpec): Promise<string> {
  if (await focusExistingNoteWindow(spec.label)) {
    return spec.label;
  }

  window.localStorage.setItem(`${notePathStoragePrefix}${spec.label}`, spec.path);

  const webview = new WebviewWindow(spec.label, {
    url: "/",
    title: spec.title,
    width: spec.width,
    height: spec.height,
    x: spec.x ?? undefined,
    y: spec.y ?? undefined,
    minWidth: 260,
    minHeight: 180,
    resizable: true,
    decorations: false,
    visible: true,
    focus: true,
    devtools: false,
    alwaysOnTop: spec.alwaysOnTop,
    skipTaskbar: spec.skipTaskbar,
  });

  await new Promise<void>((resolve, reject) => {
    void webview.once("tauri://created", () => resolve());
    void webview.once("tauri://error", (event) => reject(event.payload));
  }).catch(async (cause) => {
    if (await focusExistingNoteWindow(spec.label)) return;
    throw cause;
  });

  return spec.label;
}

async function focusExistingNoteWindow(label: string): Promise<boolean> {
  const existing = await WebviewWindow.getByLabel(label);
  if (!existing) return false;
  try {
    await existing.show();
    await existing.setFocus();
    return true;
  } catch {
    return false;
  }
}

export function markNoteClosed(path: string): Promise<void> {
  return invoke("mark_note_closed", { path });
}

export function setNoteAlwaysOnTop(path: string, alwaysOnTop: boolean): Promise<AppConfig> {
  return invoke("set_note_always_on_top", { path, alwaysOnTop });
}

export function openPathExternal(path: string): Promise<void> {
  return invoke("open_path_external", { path });
}

export function revealPath(path: string): Promise<void> {
  return invoke("reveal_path", { path });
}

export function showManagerWindow(): Promise<void> {
  return invoke("show_manager_window");
}

export async function chooseMarkdownFile(defaultPath?: string): Promise<string | null> {
  const selected = await open({
    defaultPath,
    multiple: false,
    filters: [
      {
        name: "Markdown",
        extensions: ["md", "markdown", "txt"],
      },
    ],
  });
  return typeof selected === "string" ? selected : null;
}

export async function chooseNewMarkdownPath(defaultPath?: string): Promise<string | null> {
  const selected = await save({
    defaultPath,
    filters: [
      {
        name: "Markdown",
        extensions: ["md"],
      },
    ],
  });
  return selected ?? null;
}
