use encoding_rs::EUC_KR;
use serde::{Deserialize, Serialize};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThemeSettings {
    note_bg: String,
    accent: String,
    text: String,
    font_size: f64,
    line_height: f64,
    radius: f64,
    shadow: f64,
    padding: f64,
    opacity: f64,
}

impl Default for ThemeSettings {
    fn default() -> Self {
        Self {
            note_bg: "#fff6c7".into(),
            accent: "#f0d24a".into(),
            text: "#29251b".into(),
            font_size: 14.5,
            line_height: 1.45,
            radius: 8.0,
            shadow: 0.2,
            padding: 18.0,
            opacity: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WindowRect {
    x: Option<i32>,
    y: Option<i32>,
    width: f64,
    height: f64,
    monitor_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteRecord {
    path: String,
    display_name: String,
    pinned: bool,
    open_on_startup: bool,
    last_opened_at: Option<i64>,
    last_read_at: Option<i64>,
    last_modified_ms: Option<i64>,
    last_size: Option<u64>,
    last_preview_text: String,
    always_on_top: bool,
    was_open_last_session: bool,
    hidden: bool,
    show_in_taskbar: Option<bool>,
    window: Option<WindowRect>,
    scroll_top: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HotkeySettings {
    enabled: bool,
    accelerator: String,
    mode: String,
}

impl Default for HotkeySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            accelerator: String::new(),
            mode: "show".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    default_folder: String,
    manager_visible_on_last_quit: bool,
    note_show_in_taskbar: bool,
    windows_login_autostart: bool,
    hotkey: HotkeySettings,
    theme: ThemeSettings,
    notes: Vec<NoteRecord>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            default_folder: default_daily_note_folder(),
            manager_visible_on_last_quit: true,
            note_show_in_taskbar: false,
            windows_login_autostart: false,
            hotkey: HotkeySettings::default(),
            theme: ThemeSettings::default(),
            notes: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileReadResult {
    path: String,
    content: String,
    encoding: String,
    modified_ms: Option<i64>,
    size: Option<u64>,
    preview_text: String,
    read_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteWindowSpec {
    label: String,
    path: String,
    title: String,
    width: f64,
    height: f64,
    x: Option<i32>,
    y: Option<i32>,
    always_on_top: bool,
    skip_taskbar: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveNotePatch {
    path: String,
    pinned: Option<bool>,
    open_on_startup: Option<bool>,
    always_on_top: Option<bool>,
    was_open_last_session: Option<bool>,
    hidden: Option<bool>,
    last_preview_text: Option<String>,
    last_read_at: Option<i64>,
    last_modified_ms: Option<i64>,
    last_size: Option<u64>,
    scroll_top: Option<f64>,
    window: Option<WindowRect>,
}

struct ConfigState(Mutex<AppConfig>);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn default_daily_note_folder() -> String {
    dirs::home_dir()
        .map(|home| {
            home.join("OneDrive")
                .join("Obsidian-Personal")
                .join("DailyNote")
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_default()
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("config.json"))
}

fn load_config(app: &AppHandle) -> AppConfig {
    config_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<AppConfig>(&raw).ok())
        .unwrap_or_default()
}

fn save_config_to_disk(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

fn normalize_path(path: &str) -> Result<String, String> {
    let path = PathBuf::from(path);
    let absolute = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|error| error.to_string())?
            .join(path)
    };
    Ok(absolute.to_string_lossy().to_string())
}

fn display_name_for(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

fn label_for_path(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("note-{:x}", hasher.finish())
}

fn preview_from_content(content: &str) -> String {
    let stripped = strip_frontmatter(content);
    let mut lines = stripped
        .lines()
        .map(|line| {
            line.trim()
                .trim_start_matches('#')
                .trim_start_matches("- [ ]")
                .trim_start_matches("- [x]")
                .trim_start_matches("- [X]")
                .trim_start_matches("- ")
                .trim()
                .to_string()
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if lines.len() > 7 {
        lines = lines.split_off(lines.len() - 7);
    }

    let mut preview = lines.join("\n");
    if preview.chars().count() > 320 {
        preview = preview.chars().take(320).collect::<String>();
        preview.push_str("...");
    }
    preview
}

fn strip_frontmatter(content: &str) -> &str {
    let trimmed = content.strip_prefix('\u{feff}').unwrap_or(content);
    if !trimmed.starts_with("---") {
        return trimmed;
    }
    let mut lines = trimmed.lines();
    let first = lines.next();
    if first != Some("---") {
        return trimmed;
    }
    let mut offset = 4;
    for line in lines {
        offset += line.len() + 1;
        if line.trim() == "---" {
            return trimmed.get(offset..).unwrap_or("");
        }
    }
    trimmed
}

fn upsert_note(config: &mut AppConfig, path: String) -> &mut NoteRecord {
    if let Some(index) = config.notes.iter().position(|note| note.path == path) {
        return &mut config.notes[index];
    }

    config.notes.push(NoteRecord {
        display_name: display_name_for(&path),
        path,
        pinned: false,
        open_on_startup: false,
        last_opened_at: None,
        last_read_at: None,
        last_modified_ms: None,
        last_size: None,
        last_preview_text: String::new(),
        always_on_top: false,
        was_open_last_session: false,
        hidden: false,
        show_in_taskbar: None,
        window: None,
        scroll_top: None,
    });
    config.notes.last_mut().expect("note just inserted")
}

fn read_markdown_from_path(path: &str) -> Result<FileReadResult, String> {
    let normalized = normalize_path(path)?;
    let bytes = fs::read(&normalized).map_err(|error| error.to_string())?;
    let metadata = fs::metadata(&normalized).ok();
    let modified_ms = metadata
        .as_ref()
        .and_then(|meta| meta.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64);
    let size = metadata.as_ref().map(|meta| meta.len());

    let (content, encoding) = match String::from_utf8(bytes.clone()) {
        Ok(text) => (text, "utf-8".to_string()),
        Err(_) => {
            let (decoded, _, had_errors) = EUC_KR.decode(&bytes);
            if had_errors {
                (decoded.to_string(), "cp949-lossy".to_string())
            } else {
                (decoded.to_string(), "cp949".to_string())
            }
        }
    };

    Ok(FileReadResult {
        path: normalized,
        preview_text: preview_from_content(&content),
        content,
        encoding,
        modified_ms,
        size,
        read_at: now_ms(),
    })
}

#[tauri::command]
fn get_config(app: AppHandle, state: tauri::State<ConfigState>) -> Result<AppConfig, String> {
    let mut config = state.0.lock().map_err(|error| error.to_string())?;
    if config.notes.is_empty() {
        *config = load_config(&app);
    }
    Ok(config.clone())
}

#[tauri::command]
fn save_config(
    app: AppHandle,
    state: tauri::State<ConfigState>,
    config: AppConfig,
) -> Result<AppConfig, String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    *guard = config.clone();
    save_config_to_disk(&app, &config)?;
    sync_runtime_settings(&app, &config)?;
    Ok(config)
}

#[tauri::command]
fn patch_note(
    app: AppHandle,
    state: tauri::State<ConfigState>,
    patch: SaveNotePatch,
) -> Result<AppConfig, String> {
    let mut config = state.0.lock().map_err(|error| error.to_string())?;
    let path = normalize_path(&patch.path)?;
    let note = upsert_note(&mut config, path);
    if let Some(value) = patch.pinned {
        note.pinned = value;
    }
    if let Some(value) = patch.open_on_startup {
        note.open_on_startup = value;
    }
    if let Some(value) = patch.always_on_top {
        note.always_on_top = value;
    }
    if let Some(value) = patch.was_open_last_session {
        note.was_open_last_session = value;
    }
    if let Some(value) = patch.hidden {
        note.hidden = value;
    }
    if let Some(value) = patch.last_preview_text {
        note.last_preview_text = value;
    }
    if let Some(value) = patch.last_read_at {
        note.last_read_at = Some(value);
    }
    if let Some(value) = patch.last_modified_ms {
        note.last_modified_ms = Some(value);
    }
    if let Some(value) = patch.last_size {
        note.last_size = Some(value);
    }
    if let Some(value) = patch.scroll_top {
        note.scroll_top = Some(value);
    }
    if let Some(value) = patch.window {
        note.window = Some(value);
    }
    save_config_to_disk(&app, &config)?;
    Ok(config.clone())
}

#[tauri::command]
fn read_markdown_file(
    app: AppHandle,
    state: tauri::State<ConfigState>,
    path: String,
) -> Result<FileReadResult, String> {
    let result = read_markdown_from_path(&path)?;
    let mut config = state.0.lock().map_err(|error| error.to_string())?;
    let note = upsert_note(&mut config, result.path.clone());
    note.display_name = display_name_for(&result.path);
    note.last_read_at = Some(result.read_at);
    note.last_modified_ms = result.modified_ms;
    note.last_size = result.size;
    note.last_preview_text = result.preview_text.clone();
    note.last_opened_at = Some(result.read_at);
    save_config_to_disk(&app, &config)?;
    Ok(result)
}

#[tauri::command]
fn create_markdown_file(path: String) -> Result<String, String> {
    let mut target = PathBuf::from(path);
    if target.extension().is_none() {
        target.set_extension("md");
    }
    if target.exists() {
        return Err("File already exists.".into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&target, "").map_err(|error| error.to_string())?;
    normalize_path(&target.to_string_lossy())
}

#[tauri::command]
fn prepare_note_window(
    app: AppHandle,
    state: tauri::State<ConfigState>,
    path: String,
) -> Result<NoteWindowSpec, String> {
    let path = normalize_path(&path)?;
    let mut config = state.0.lock().map_err(|error| error.to_string())?;
    let default_skip_taskbar = !config.note_show_in_taskbar;
    let note = upsert_note(&mut config, path.clone());
    note.was_open_last_session = true;
    note.hidden = false;
    note.last_opened_at = Some(now_ms());
    let rect = note.window.clone().unwrap_or(WindowRect {
        x: None,
        y: None,
        width: 420.0,
        height: 640.0,
        monitor_name: None,
    });
    let spec = NoteWindowSpec {
        label: label_for_path(&path),
        title: display_name_for(&path),
        path,
        width: if rect.width > 0.0 { rect.width } else { 420.0 },
        height: if rect.height > 0.0 { rect.height } else { 640.0 },
        x: rect.x,
        y: rect.y,
        always_on_top: note.always_on_top,
        skip_taskbar: note.show_in_taskbar.map(|show| !show).unwrap_or(default_skip_taskbar),
    };
    save_config_to_disk(&app, &config)?;
    Ok(spec)
}

#[tauri::command]
fn mark_note_closed(
    app: AppHandle,
    state: tauri::State<ConfigState>,
    path: String,
) -> Result<(), String> {
    let path = normalize_path(&path)?;
    let mut config = state.0.lock().map_err(|error| error.to_string())?;
    let note = upsert_note(&mut config, path);
    note.was_open_last_session = false;
    note.hidden = false;
    save_config_to_disk(&app, &config)
}

#[tauri::command]
fn hide_note_windows(app: AppHandle, state: tauri::State<ConfigState>) -> Result<(), String> {
    let mut config = state.0.lock().map_err(|error| error.to_string())?;
    for note in &mut config.notes {
        if note.was_open_last_session {
            if let Some(window) = app.get_webview_window(&label_for_path(&note.path)) {
                let _ = window.hide();
                note.hidden = true;
            }
        }
    }
    save_config_to_disk(&app, &config)
}

#[tauri::command]
fn show_note_windows(app: AppHandle, state: tauri::State<ConfigState>) -> Result<(), String> {
    let notes = {
        let config = state.0.lock().map_err(|error| error.to_string())?;
        config.notes.clone()
    };
    let paths = notes
        .iter()
        .filter(|note| note.was_open_last_session || note.open_on_startup)
        .map(|note| note.path.clone())
        .collect::<Vec<_>>();

    if let Some(manager) = app.get_webview_window("manager") {
        if paths.is_empty() {
            let _ = manager.show();
            let _ = manager.set_focus();
        } else {
            let _ = manager.emit("open-note-paths", paths.clone());
        }
    }

    let mut config = state.0.lock().map_err(|error| error.to_string())?;
    for note in &mut config.notes {
        if note.was_open_last_session || note.open_on_startup {
            note.hidden = false;
        }
    }
    save_config_to_disk(&app, &config)
}

#[tauri::command]
fn get_restore_note_paths(state: tauri::State<ConfigState>) -> Result<Vec<String>, String> {
    let config = state.0.lock().map_err(|error| error.to_string())?;
    Ok(config
        .notes
        .iter()
        .filter(|note| note.was_open_last_session || note.open_on_startup)
        .map(|note| note.path.clone())
        .collect())
}

fn apply_hotkey_behavior(app: &AppHandle) {
    let state = app.state::<ConfigState>();
    let mode = state
        .0
        .lock()
        .map(|config| config.hotkey.mode.clone())
        .unwrap_or_else(|_| "show".to_string());

    if mode == "toggle" {
        let should_hide = state
            .0
            .lock()
            .map(|config| {
                config
                    .notes
                    .iter()
                    .any(|note| note.was_open_last_session && !note.hidden)
            })
            .unwrap_or(false);
        if should_hide {
            let _ = hide_note_windows(app.clone(), state.clone());
        } else {
            let _ = show_note_windows(app.clone(), state.clone());
        }
    } else {
        let _ = show_note_windows(app.clone(), state.clone());
    }
}

fn sync_runtime_settings(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|error| error.to_string())?;
    if config.hotkey.enabled && !config.hotkey.accelerator.trim().is_empty() {
        shortcuts
            .on_shortcuts([config.hotkey.accelerator.trim()], |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    apply_hotkey_behavior(app);
                }
            })
            .map_err(|error| error.to_string())?;
    }

    let autostart = app.autolaunch();
    if config.windows_login_autostart {
        autostart.enable().map_err(|error| error.to_string())?;
    } else if autostart.is_enabled().unwrap_or(false) {
        autostart.disable().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn set_note_always_on_top(
    app: AppHandle,
    state: tauri::State<ConfigState>,
    path: String,
    always_on_top: bool,
) -> Result<AppConfig, String> {
    let path = normalize_path(&path)?;
    if let Some(window) = app.get_webview_window(&label_for_path(&path)) {
        window
            .set_always_on_top(always_on_top)
            .map_err(|error| error.to_string())?;
    }
    patch_note(
        app,
        state,
        SaveNotePatch {
            path,
            pinned: None,
            open_on_startup: None,
            always_on_top: Some(always_on_top),
            was_open_last_session: None,
            hidden: None,
            last_preview_text: None,
            last_read_at: None,
            last_modified_ms: None,
            last_size: None,
            scroll_top: None,
            window: None,
        },
    )
}

#[tauri::command]
fn open_path_external(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(parent) = Path::new(&path).parent() {
            open_path_external(parent.to_string_lossy().to_string())
        } else {
            open_path_external(path)
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let open_manager = MenuItem::with_id(app, "open_manager", "Open manager", true, None::<&str>)?;
    let new_note = MenuItem::with_id(app, "new_note", "New note", true, None::<&str>)?;
    let load_note = MenuItem::with_id(app, "load_note", "Load note", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_manager, &new_note, &load_note, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main").tooltip("Sticky Markdown Note");
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_manager" => {
                if let Some(window) = app.get_webview_window("manager") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("tray-open-manager", ());
                }
            }
            "new_note" => {
                if let Some(window) = app.get_webview_window("manager") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("tray-new-note", ());
                }
            }
            "load_note" => {
                if let Some(window) = app.get_webview_window("manager") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("tray-load-note", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn restore_startup_windows(app: &AppHandle) {
    let state = app.state::<ConfigState>();
    let config = state.0.lock().map(|guard| guard.clone()).unwrap_or_default();
    let restore_paths = config
        .notes
        .iter()
        .filter(|note| note.was_open_last_session || note.open_on_startup)
        .map(|note| note.path.clone())
        .collect::<Vec<_>>();

    if let Some(manager) = app.get_webview_window("manager") {
        if config.manager_visible_on_last_quit || restore_paths.is_empty() {
            let _ = manager.show();
        } else {
            let _ = manager.hide();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().app_name("Sticky Markdown Note").build())
        .setup(|app| {
            let config = load_config(app.handle());
            app.manage(ConfigState(Mutex::new(config)));
            let config = app
                .state::<ConfigState>()
                .0
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_default();
            sync_runtime_settings(app.handle(), &config)?;
            build_tray(app.handle())?;
            restore_startup_windows(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            patch_note,
            read_markdown_file,
            prepare_note_window,
            create_markdown_file,
            get_restore_note_paths,
            mark_note_closed,
            hide_note_windows,
            show_note_windows,
            set_note_always_on_top,
            open_path_external,
            reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sticky Markdown Note");
}
