// Нативный burst-цикл кликов/нажатий клавиш для турбо-режима МультиТула.
//
// Почему это отдельный модуль, а не просто "более нативный" одиночный клик: узкое место в
// JS-цикле турбо-режима — не сам системный вызов клика (он уже голый нативный биндинг nut-js),
// а накладные расходы JS/event-loop на каждую итерацию (несколько await на тик, setImmediate).
// Здесь весь цикл — интервал, повтор, остановка по времени/количеству — крутится ВНУТРИ Rust,
// JS вызывается один раз на старте и один раз на остановке, а не сотни/тысячи раз в секунду.

use napi_derive::napi;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

#[cfg(windows)]
use windows::Win32::Foundation::POINT;
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
  SendInput, INPUT, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP,
  MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
  MOUSEINPUT, VIRTUAL_KEY,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, SetCursorPos};

// Простой быстрый ГПСЧ (xorshift32) для разброса позиции клика — криптостойкость не нужна,
// нужна только скорость и отсутствие внешних crate-зависимостей. Сидируется от текущего времени.
struct Xorshift32(u32);

impl Xorshift32 {
  fn new() -> Self {
    let seed = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.subsec_nanos())
      .unwrap_or(0x9e3779b9)
      .max(1);
    Xorshift32(seed)
  }

  // Возвращает f64 в [0, 1)
  fn next_f64(&mut self) -> f64 {
    let mut x = self.0;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    self.0 = x;
    (x as f64) / (u32::MAX as f64 + 1.0)
  }
}

struct BurstHandle {
  running: Arc<AtomicBool>,
  count: Arc<AtomicU32>,
  thread: Option<JoinHandle<()>>,
}

static BURST: Mutex<Option<BurstHandle>> = Mutex::new(None);

#[cfg(windows)]
fn send_mouse_click(right_button: bool) {
  unsafe {
    let (down, up) = if right_button {
      (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP)
    } else {
      (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP)
    };
    let mut inputs: [INPUT; 2] = std::mem::zeroed();
    inputs[0].r#type = INPUT_MOUSE;
    inputs[0].Anonymous.mi = MOUSEINPUT {
      dx: 0,
      dy: 0,
      mouseData: 0,
      dwFlags: down,
      time: 0,
      dwExtraInfo: 0,
    };
    inputs[1].r#type = INPUT_MOUSE;
    inputs[1].Anonymous.mi = MOUSEINPUT {
      dx: 0,
      dy: 0,
      mouseData: 0,
      dwFlags: up,
      time: 0,
      dwExtraInfo: 0,
    };
    SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
  }
}

#[cfg(windows)]
fn send_key_press(vk_code: u16) {
  unsafe {
    let mut inputs: [INPUT; 2] = std::mem::zeroed();
    inputs[0].r#type = INPUT_KEYBOARD;
    inputs[0].Anonymous.ki = KEYBDINPUT {
      wVk: VIRTUAL_KEY(vk_code),
      wScan: 0,
      dwFlags: Default::default(),
      time: 0,
      dwExtraInfo: 0,
    };
    inputs[1].r#type = INPUT_KEYBOARD;
    inputs[1].Anonymous.ki = KEYBDINPUT {
      wVk: VIRTUAL_KEY(vk_code),
      wScan: 0,
      dwFlags: KEYEVENTF_KEYUP,
      time: 0,
      dwExtraInfo: 0,
    };
    SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
  }
}

#[cfg(windows)]
fn send_mouse_double_click() {
  send_mouse_click(false);
  // Пауза между кликами двойного клика — должна быть заметно меньше системного порога
  // GetDoubleClickTime() (обычно ~500мс), чтобы ОС/приложение распознали именно двойной клик,
  // а не два одиночных. 40мс с запасом укладывается в это на любых системных настройках.
  thread::sleep(Duration::from_millis(40));
  send_mouse_click(false);
}

#[cfg(windows)]
fn jitter_cursor(base: &(i32, i32), jitter_px: f64, rng: &mut Xorshift32) {
  let angle = rng.next_f64() * std::f64::consts::PI * 2.0;
  let r = rng.next_f64() * jitter_px;
  let dx = (angle.cos() * r).round() as i32;
  let dy = (angle.sin() * r).round() as i32;
  unsafe {
    let _ = SetCursorPos(base.0 + dx, base.1 + dy);
  }
}

#[cfg(windows)]
fn current_cursor_pos() -> (i32, i32) {
  unsafe {
    let mut p = POINT::default();
    if GetCursorPos(&mut p).is_ok() {
      (p.x, p.y)
    } else {
      (0, 0)
    }
  }
}

#[cfg(not(windows))]
fn send_mouse_click(_right_button: bool) {}
#[cfg(not(windows))]
fn send_mouse_double_click() {}
#[cfg(not(windows))]
fn send_key_press(_vk_code: u16) {}
#[cfg(not(windows))]
fn jitter_cursor(_base: &(i32, i32), _jitter_px: f64, _rng: &mut Xorshift32) {}
#[cfg(not(windows))]
fn current_cursor_pos() -> (i32, i32) {
  (0, 0)
}

/// Запускает burst-цикл. action: "mouse-left" | "mouse-right" | "mouse-double" | "key" (vk_code
/// обязателен для "key"). interval_micros — пауза между кликами в микросекундах (0 = максимально
/// быстро, без паузы вообще). duration_ms — если задано (>0), цикл останавливается сам по
/// истечении времени; иначе крутится, пока не позовут stopBurst(). jitter_px — радиус разброса
/// позиции клика в пикселях вокруг точки, где стоял курсор на момент старта (0 = не двигать
/// курсор вообще, самый быстрый путь; действует только для mouse-*, не для "key"). Только один
/// burst может выполняться одновременно — если уже что-то запущено, возвращает false и не трогает
/// текущий цикл.
#[napi]
pub fn start_burst(
  action: String,
  vk_code: u32,
  interval_micros: f64,
  duration_ms: f64,
  jitter_px: f64,
) -> bool {
  let mut guard = BURST.lock().unwrap();
  if guard.is_some() {
    return false; // уже что-то крутится — сначала останови
  }

  let running = Arc::new(AtomicBool::new(true));
  let count = Arc::new(AtomicU32::new(0));
  let running_thread = running.clone();
  let count_thread = count.clone();
  let interval = Duration::from_secs_f64((interval_micros.max(0.0)) / 1_000_000.0);
  let has_duration = duration_ms > 0.0;
  let duration = Duration::from_secs_f64(duration_ms.max(0.0) / 1000.0);
  let vk = vk_code as u16;
  let jitter = jitter_px.max(0.0);
  let is_mouse = action != "key";

  let thread = thread::spawn(move || {
    let start = Instant::now();
    let mut next_at = Instant::now();
    let base = if is_mouse && jitter > 0.0 {
      Some(current_cursor_pos())
    } else {
      None
    };
    let mut rng = Xorshift32::new();
    while running_thread.load(Ordering::Relaxed) {
      if has_duration && start.elapsed() >= duration {
        break;
      }
      if let Some(base) = &base {
        jitter_cursor(base, jitter, &mut rng);
      }
      match action.as_str() {
        "mouse-right" => send_mouse_click(true),
        "mouse-double" => send_mouse_double_click(),
        "key" => send_key_press(vk),
        _ => send_mouse_click(false),
      }
      count_thread.fetch_add(1, Ordering::Relaxed);
      if interval.is_zero() {
        // без паузы вообще — уступаем поток планировщику ОС на мгновение, иначе цикл может
        // монополизировать ядро и не давать вовремя среагировать на стоп-флаг/систему в целом
        thread::yield_now();
      } else {
        next_at += interval;
        let now = Instant::now();
        if next_at > now {
          thread::sleep(next_at - now);
        }
      }
    }
    running_thread.store(false, Ordering::Relaxed);
  });

  *guard = Some(BurstHandle {
    running,
    count,
    thread: Some(thread),
  });
  true
}

/// Останавливает текущий burst (если есть) и возвращает итоговое число выполненных
/// кликов/нажатий. Блокирует до фактического завершения потока (обычно почти мгновенно).
#[napi]
pub fn stop_burst() -> u32 {
  let mut guard = BURST.lock().unwrap();
  if let Some(mut handle) = guard.take() {
    handle.running.store(false, Ordering::Relaxed);
    if let Some(t) = handle.thread.take() {
      let _ = t.join();
    }
    handle.count.load(Ordering::Relaxed)
  } else {
    0
  }
}

/// Текущее число кликов с начала burst'а — для живого счётчика в UI, не останавливая цикл.
#[napi]
pub fn get_burst_count() -> u32 {
  let guard = BURST.lock().unwrap();
  guard
    .as_ref()
    .map(|h| h.count.load(Ordering::Relaxed))
    .unwrap_or(0)
}

/// Идёт ли burst прямо сейчас — на случай, если он остановился сам (истёк duration_ms), а JS
/// ещё не вызвал stopBurst().
#[napi]
pub fn is_burst_running() -> bool {
  let guard = BURST.lock().unwrap();
  guard
    .as_ref()
    .map(|h| h.running.load(Ordering::Relaxed))
    .unwrap_or(false)
}
