export type ThemeSettings = {
  noteBg: string;
  accent: string;
  text: string;
  fontSize: number;
  lineHeight: number;
  radius: number;
  shadow: number;
  padding: number;
  opacity: number;
};

export type WindowRect = {
  x?: number | null;
  y?: number | null;
  width: number;
  height: number;
  monitorName?: string | null;
};

export type NoteRecord = {
  path: string;
  displayName: string;
  pinned: boolean;
  openOnStartup: boolean;
  lastOpenedAt?: number | null;
  lastReadAt?: number | null;
  lastModifiedMs?: number | null;
  lastSize?: number | null;
  lastPreviewText: string;
  alwaysOnTop: boolean;
  wasOpenLastSession: boolean;
  hidden: boolean;
  showInTaskbar?: boolean | null;
  window?: WindowRect | null;
  scrollTop?: number | null;
};

export type HotkeySettings = {
  enabled: boolean;
  accelerator: string;
  mode: "show" | "toggle" | string;
  includeTaskboard: boolean;
};

export type AppConfig = {
  defaultFolder: string;
  taskboardPath: string;
  managerVisibleOnLastQuit: boolean;
  noteShowInTaskbar: boolean;
  windowsLoginAutostart: boolean;
  hotkey: HotkeySettings;
  theme: ThemeSettings;
  notes: NoteRecord[];
};

export type FileReadResult = {
  path: string;
  content: string;
  encoding: string;
  modifiedMs?: number | null;
  size?: number | null;
  previewText: string;
  readAt: number;
};

export type SaveMarkdownFileRequest = {
  path: string;
  content: string;
  baseModifiedMs?: number | null;
  baseSize?: number | null;
  force?: boolean;
};

export type SaveMarkdownFileResult =
  | {
      status: "saved";
      file: FileReadResult;
    }
  | {
      status: "conflict";
      file: FileReadResult;
    };

export type NotePatch = {
  path: string;
  pinned?: boolean;
  openOnStartup?: boolean;
  alwaysOnTop?: boolean;
  wasOpenLastSession?: boolean;
  hidden?: boolean;
  lastPreviewText?: string;
  lastReadAt?: number;
  lastModifiedMs?: number;
  lastSize?: number;
  scrollTop?: number;
  window?: WindowRect;
};
