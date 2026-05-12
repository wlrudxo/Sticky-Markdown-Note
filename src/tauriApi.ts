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

export function getStoredNotePath(label: string): string | null {
  return window.localStorage.getItem(`${notePathStoragePrefix}${label}`);
}

export function getNotePathForLabel(label: string): Promise<string | null> {
  return invoke("get_note_path_for_label", { label });
}

export function createMarkdownFile(path: string): Promise<string> {
  return invoke("create_markdown_file", { path });
}

export async function openNoteWindow(path: string): Promise<string> {
  const spec = await invoke<NoteWindowSpec>("prepare_note_window", { path });
  const existing = await WebviewWindow.getByLabel(spec.label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
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
    devtools: true,
    alwaysOnTop: spec.alwaysOnTop,
    skipTaskbar: spec.skipTaskbar,
  });

  await new Promise<void>((resolve, reject) => {
    void webview.once("tauri://created", () => resolve());
    void webview.once("tauri://error", (event) => reject(event.payload));
  });

  return spec.label;
}

export function closeNoteWindow(path: string): Promise<void> {
  return invoke("close_note_window", { path });
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
