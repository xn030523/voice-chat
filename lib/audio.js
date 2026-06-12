'use client';

// 游戏音频系统 —— 场景化 BGM(开场/对局/胜利/失败)+ 通用音效(SFX)
// 音源抽象:{ type:'synth', ... } 今天 | { type:'file', url } 未来(Lyria 生成后热替换,架构零改动)
// 合成:Web Audio lookahead 音序器,零音频文件、零版权风险;音量克制不盖语音。
//
// 场景规则:
//   intro   开局 jingle,播一次后自动衔接 playing 循环
//   playing 对局循环曲(每游戏专属曲风)
//   victory 胜利凯歌(一次性)   defeat 失败音效(一次性)
// SFX:move(落子/出牌嗒声)、turn(轮到我提示)、dice(骰子)、capture(吃子)

const STORAGE_KEY = 'voice-games:bgm';

// ---------- 音名解析(支持升降号:C#4 / Eb5) ----------
const SEMITONES = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function freqOf(name) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) return null;
  let semi = SEMITONES[m[1]] + (Number(m[3]) - 4) * 12;
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  return 440 * 2 ** (semi / 12);
}

// ---------- 曲库 ----------
// playing:32 步循环(八分音符);intro/victory/defeat:一次性短句
const GAME_TRACKS = {
  gomoku: {
    playing: {
      bpm: 76, wave: 'sine', vol: 1.0,
      mel: ['E5', null, 'G5', null, 'A5', null, 'G5', null, 'E5', null, 'D5', null, 'E5', null, null, null,
            'G5', null, 'A5', null, 'C6', null, 'A5', null, 'G5', null, 'E5', null, 'D5', null, null, null],
      bass: ['C3', null, null, null, null, null, null, null, 'A2', null, null, null, null, null, null, null,
             'F2', null, null, null, null, null, null, null, 'G2', null, null, null, null, null, null, null],
    },
    intro: { bpm: 76, wave: 'sine', vol: 1.0, mel: ['C5', 'E5', 'G5', null, 'A5', null, 'G5', null], bass: ['C3', null, null, null, 'G2', null, null, null] },
  },
  xiangqi: {
    playing: {
      bpm: 86, wave: 'triangle', vol: 1.0,
      mel: ['D5', null, 'E5', 'G5', 'A5', null, 'G5', 'E5', 'D5', null, 'C5', 'D5', null, null, null, null,
            'A4', null, 'D5', 'E5', 'G5', null, 'E5', 'D5', 'E5', null, 'D5', 'C5', 'D5', null, null, null],
      bass: ['D3', null, null, null, 'A2', null, null, null, 'G2', null, null, null, 'D3', null, null, null,
             'F2', null, null, null, 'C3', null, null, null, 'G2', null, null, null, 'D3', null, null, null],
    },
    intro: { bpm: 86, wave: 'triangle', vol: 1.0, mel: ['D5', 'A4', 'D5', 'E5', 'G5', null, 'E5', null], bass: ['D3', null, null, null, 'A2', null, null, null] },
  },
  junqi: {
    playing: {
      bpm: 106, wave: 'square', vol: 0.55,
      mel: ['C5', 'C5', 'G4', 'C5', 'E5', null, 'C5', 'E5', 'G5', null, 'E5', 'C5', 'G4', null, 'G4', 'G4',
            'A4', 'A4', 'E5', null, 'D5', 'D5', 'G5', null, 'E5', 'C5', 'G4', 'E4', 'C4', null, null, null],
      bass: ['C3', null, 'C3', null, 'G2', null, 'G2', null, 'C3', null, 'C3', null, 'E3', null, 'E3', null,
             'F2', null, 'F2', null, 'G2', null, 'G2', null, 'C3', null, 'G2', null, 'C3', null, null, null],
    },
    intro: { bpm: 106, wave: 'square', vol: 0.55, mel: ['G4', 'C5', 'E5', 'G5', null, 'E5', 'G5', null], bass: ['C3', null, 'G2', null, 'C3', null, null, null] },
  },
  ludo: {
    playing: {
      bpm: 128, wave: 'triangle', vol: 0.95,
      mel: ['C5', 'E5', 'G5', 'E5', 'C6', null, 'G5', 'E5', 'F5', 'A5', 'C6', 'A5', 'G5', null, 'E5', 'C5',
            'D5', 'F5', 'A5', 'F5', 'G5', 'E5', 'C5', 'E5', 'D5', null, 'G4', 'B4', 'C5', null, null, null],
      bass: ['C3', null, 'G2', null, 'C3', null, 'G2', null, 'F2', null, 'C3', null, 'G2', null, 'C3', null,
             'D3', null, 'F2', null, 'C3', null, 'A2', null, 'G2', null, 'G2', null, 'C3', null, null, null],
    },
    intro: { bpm: 128, wave: 'triangle', vol: 0.95, mel: ['C5', 'E5', 'G5', 'C6', null, 'G5', 'C6', null], bass: ['C3', null, 'G2', null, 'C3', null, null, null] },
  },
  doudizhu: {
    playing: {
      bpm: 140, wave: 'square', vol: 0.5,
      mel: ['G5', 'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5', 'E5', 'D5', 'C5', 'A4', null, 'C5', 'D5',
            'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5', 'E5', null, 'D5', 'C5', 'A4', 'C5', 'C5', null],
      bass: ['C3', null, 'G2', 'C3', 'A2', null, 'E3', 'A2', 'F2', null, 'C3', 'F2', 'G2', null, 'D3', 'G2',
             'C3', null, 'G2', 'C3', 'A2', null, 'E3', 'A2', 'F2', 'G2', 'C3', null, 'G2', null, 'C3', null],
    },
    intro: { bpm: 140, wave: 'square', vol: 0.5, mel: ['C5', 'D5', 'E5', 'G5', 'A5', null, 'G5', null], bass: ['C3', null, 'G2', null, 'C3', null, null, null] },
  },
  // 街机:坦克大作战(军武 chiptune,紧凑推进)
  tank: {
    playing: {
      bpm: 118, wave: 'square', vol: 0.5,
      mel: ['C4', 'C4', 'E4', 'G4', 'C5', null, 'G4', 'E4', 'F4', 'F4', 'A4', 'C5', 'F5', null, 'C5', 'A4',
            'G4', 'G4', 'B4', 'D5', 'G5', null, 'D5', 'B4', 'C5', 'G4', 'E4', 'C4', 'G3', null, 'C4', null],
      bass: ['C3', 'C3', null, 'C3', 'G2', 'G2', null, 'G2', 'F2', 'F2', null, 'F2', 'C3', 'C3', null, 'C3',
             'G2', 'G2', null, 'G2', 'B2', 'B2', null, 'B2', 'C3', null, 'G2', null, 'C3', null, null, null],
    },
    intro: { bpm: 118, wave: 'square', vol: 0.55, mel: ['C4', 'E4', 'G4', 'C5', null, 'G4', 'C5', null], bass: ['C3', null, 'G2', null, 'C3', null, null, null] },
  },
  // 街机:雪球兄弟(冰晶感,轻盈跳跃)
  snow: {
    playing: {
      bpm: 124, wave: 'triangle', vol: 0.9,
      mel: ['E5', 'G5', 'B5', 'G5', 'E6', null, 'B5', 'G5', 'A5', 'C6', 'E6', 'C6', 'B5', null, 'G5', 'E5',
            'F5', 'A5', 'C6', 'A5', 'B5', 'G5', 'E5', 'G5', 'F5', null, 'B4', 'D5', 'E5', null, null, null],
      bass: ['E3', null, 'B2', null, 'E3', null, 'B2', null, 'A2', null, 'E3', null, 'B2', null, 'E3', null,
             'D3', null, 'A2', null, 'E3', null, 'C3', null, 'B2', null, 'B2', null, 'E3', null, null, null],
    },
    intro: { bpm: 124, wave: 'triangle', vol: 0.9, mel: ['E5', 'G5', 'B5', 'E6', null, 'B5', 'E6', null], bass: ['E3', null, 'B2', null, 'E3', null, null, null] },
  },
  // 街机:像素突击(战地摇滚感,小调推进)
  run: {
    playing: {
      bpm: 134, wave: 'square', vol: 0.48,
      mel: ['A4', 'A4', 'C5', 'A4', 'E5', null, 'C5', 'A4', 'G4', 'G4', 'B4', 'G4', 'D5', null, 'B4', 'G4',
            'F4', 'F4', 'A4', 'C5', 'F5', 'E5', 'C5', 'A4', 'E5', null, 'D5', 'C5', 'B4', null, 'E4', null],
      bass: ['A2', null, 'A2', 'A2', 'E3', null, 'A2', null, 'G2', null, 'G2', 'G2', 'D3', null, 'G2', null,
             'F2', null, 'F2', 'F2', 'C3', null, 'F2', null, 'E2', 'E2', null, 'E2', 'E3', null, 'E2', null],
    },
    intro: { bpm: 134, wave: 'square', vol: 0.52, mel: ['A4', 'C5', 'E5', 'A5', null, 'E5', 'A5', null], bass: ['A2', null, 'E3', null, 'A2', null, null, null] },
  },
  // 街机:功夫龟对决(功夫快板,五声音阶)
  fight: {
    playing: {
      bpm: 144, wave: 'square', vol: 0.46,
      mel: ['D5', 'E5', 'G5', 'E5', 'D5', 'C5', 'D5', null, 'A4', 'C5', 'D5', 'C5', 'A4', 'G4', 'A4', null,
            'D5', 'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'E5', 'C5', 'D5', 'C5', 'A4', 'G4', null, 'D5', null],
      bass: ['D3', null, 'D3', 'A2', 'D3', null, 'A2', null, 'C3', null, 'C3', 'G2', 'C3', null, 'G2', null,
             'D3', null, 'D3', 'A2', 'G2', null, 'G2', 'D3', 'C3', null, 'A2', null, 'D3', null, 'D3', null],
    },
    intro: { bpm: 144, wave: 'square', vol: 0.5, mel: ['D5', 'A4', 'D5', 'G5', null, 'E5', 'D5', null], bass: ['D3', null, 'A2', null, 'D3', null, null, null] },
  },
};

// 通用胜利/失败(所有游戏共用,可在 GAME_TRACKS 内覆写)
const COMMON = {
  victory: {
    bpm: 132, wave: 'triangle', vol: 1.0,
    mel: ['C5', 'E5', 'G5', 'C6', null, 'G5', 'C6', null, 'D6', null, 'C6', null, null, null, null, null],
    bass: ['C3', null, 'G2', null, 'C3', null, 'E3', null, 'G3', null, 'C3', null, null, null, null, null],
  },
  defeat: {
    bpm: 88, wave: 'sine', vol: 1.0,
    mel: ['E4', null, 'Eb4', null, 'D4', null, 'Db4', null, 'C4', null, null, null, null, null, null, null],
    bass: ['C3', null, 'B2', null, 'Bb2', null, 'A2', null, 'Ab2', null, null, null, null, null, null, null],
  },
};

// 音效(短促合成)
const SFX = {
  move: { freq: 660, dur: 0.06, wave: 'triangle', vol: 0.5, slide: -120 },
  turn: { freq: 880, dur: 0.16, wave: 'sine', vol: 0.6, second: 1175 },
  dice: { freq: 300, dur: 0.1, wave: 'square', vol: 0.35, slide: 500 },
  capture: { freq: 220, dur: 0.18, wave: 'square', vol: 0.45, slide: -80 },
  shoot: { freq: 480, dur: 0.08, wave: 'square', vol: 0.3, slide: -300 },
  boom: { freq: 110, dur: 0.35, wave: 'sawtooth', vol: 0.5, slide: -70 },
};

// ---------- 引擎 ----------
let ctx = null;
let master = null;
let timer = null;
let currentKey = null; // `${game}:${scene}`
let stepIndex = 0;
let nextStepTime = 0;
let loopTrack = null; // 循环中的 track
let pendingChain = null; // intro 播完后接的 (game)
let unlockHooked = false;

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.11;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
    hookUnlock();
  }
  return ctx;
}

function hookUnlock() {
  if (unlockHooked || typeof document === 'undefined') return;
  unlockHooked = true;
  const resume = () => {
    ctx?.resume().catch(() => {});
    document.removeEventListener('click', resume);
    document.removeEventListener('touchstart', resume);
    unlockHooked = false;
  };
  document.addEventListener('click', resume);
  document.addEventListener('touchstart', resume);
}

function playNote(freq, time, dur, wave, vol) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.001), time + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

function clearTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 调度一次性短句(intro/victory/defeat);onDone 在末尾时刻后回调 */
function playOnce(track, onDone) {
  const stepDur = 60 / track.bpm / 2;
  const t0 = ctx.currentTime + 0.05;
  const steps = track.mel.length;
  for (let i = 0; i < steps; i++) {
    const mel = track.mel[i];
    const bass = track.bass?.[i];
    if (mel) {
      const f = freqOf(mel);
      if (f) playNote(f, t0 + i * stepDur, stepDur * 1.7, track.wave, track.vol);
    }
    if (bass) {
      const f = freqOf(bass);
      if (f) playNote(f, t0 + i * stepDur, stepDur * 2.6, 'sine', track.vol * 0.75);
    }
  }
  if (onDone) {
    const ms = (t0 + steps * stepDur - ctx.currentTime) * 1000 + 60;
    setTimeout(onDone, ms);
  }
}

function startLoop(track) {
  clearTimer();
  loopTrack = track;
  stepIndex = 0;
  nextStepTime = ctx.currentTime + 0.06;
  const scheduler = () => {
    if (!loopTrack || !ctx) return;
    const stepDur = 60 / loopTrack.bpm / 2;
    while (nextStepTime < ctx.currentTime + 0.12) {
      const i = stepIndex % loopTrack.mel.length;
      const mel = loopTrack.mel[i];
      const bass = loopTrack.bass?.[i];
      if (mel) {
        const f = freqOf(mel);
        if (f) playNote(f, nextStepTime, stepDur * 1.7, loopTrack.wave, loopTrack.vol);
      }
      if (bass) {
        const f = freqOf(bass);
        if (f) playNote(f, nextStepTime, stepDur * 2.6, 'sine', loopTrack.vol * 0.75);
      }
      nextStepTime += stepDur;
      stepIndex += 1;
    }
  };
  timer = setInterval(scheduler, 25);
  scheduler();
}

// ---------- 对外 API ----------

export function isBgmEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setBgmEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch { /* ignore */ }
  if (!on) stopAll();
}

function trackOf(gameId, scene) {
  const g = GAME_TRACKS[gameId] || {};
  const t = g[scene] || COMMON[scene];
  // 未来 Lyria 热替换:此处若 t.type==='file' → 走 <audio> 播放(占位,后续实现)
  return t || null;
}

/**
 * 播放场景:
 *  - 'intro'   播一次,完毕自动衔接 'playing' 循环
 *  - 'playing' 直接循环(同曲幂等)
 *  - 'victory'/'defeat' 停掉循环,播一次
 */
export function playScene(gameId, scene) {
  if (!isBgmEnabled() || !ensureCtx()) return;
  const key = `${gameId}:${scene}`;
  if (key === currentKey && (scene === 'playing' ? timer : true)) return; // 幂等
  currentKey = key;
  pendingChain = null;
  clearTimer();
  loopTrack = null;

  if (scene === 'intro') {
    const intro = trackOf(gameId, 'intro');
    const playing = trackOf(gameId, 'playing');
    if (intro) {
      pendingChain = gameId;
      playOnce(intro, () => {
        if (pendingChain === gameId && isBgmEnabled()) {
          currentKey = `${gameId}:playing`;
          if (playing) startLoop(playing);
        }
      });
    } else if (playing) {
      currentKey = `${gameId}:playing`;
      startLoop(playing);
    }
    return;
  }
  if (scene === 'playing') {
    const t = trackOf(gameId, 'playing');
    if (t) startLoop(t);
    return;
  }
  const t = trackOf(gameId, scene);
  if (t) playOnce(t);
}

export function stopAll() {
  clearTimer();
  loopTrack = null;
  pendingChain = null;
  currentKey = null;
}

/** 短音效:move/turn/dice/capture/shoot/boom */
export function playSfx(name) {
  if (!isBgmEnabled() || !ensureCtx()) return;
  const s = SFX[name];
  if (!s) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = s.wave;
  osc.frequency.setValueAtTime(s.freq, t);
  if (s.slide) osc.frequency.linearRampToValueAtTime(Math.max(40, s.freq + s.slide), t + s.dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(s.vol * 0.5, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + s.dur + 0.03);
  if (s.second) {
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = s.wave;
    o2.frequency.value = s.second;
    g2.gain.setValueAtTime(0.0001, t + s.dur * 0.5);
    g2.gain.exponentialRampToValueAtTime(s.vol * 0.4, t + s.dur * 0.5 + 0.008);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + s.dur * 1.6);
    o2.connect(g2);
    g2.connect(master);
    o2.start(t + s.dur * 0.5);
    o2.stop(t + s.dur * 1.7);
  }
}

// 兼容旧接口(playBgm → playing 场景)
export function playBgm(gameId) {
  playScene(gameId, 'playing');
}
export function stopBgm() {
  stopAll();
}
