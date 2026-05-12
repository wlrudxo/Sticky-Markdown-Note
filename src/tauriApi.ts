import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AppConfig, FileReadResult, NotePatch } from "./types";

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

export function getNotePathForLabel(label: string): Promise<string | null> {
  return invoke("get_note_path_for_label", { label });
}

export function createMarkdownFile(path: string): Promise<string> {
  return invoke("create_markdown_file", { path });
}

export function openNoteWindow(path: string): Promise<string> {
  return invoke("open_note_window", { path });
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
