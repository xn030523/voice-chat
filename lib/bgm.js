'use client';

// 游戏 BGM —— Web Audio 程序化合成(零音频文件、零版权风险)
// 每个游戏一首风格匹配的循环小曲:
//   五子棋:宫调式慢板,空灵静雅      象棋:商调式,沉稳对弈
//   军棋:进行曲,号角感              飞行棋:大调跳跃,轻快
//   斗地主:徵调式民间小调,欢腾
// 实现:lookahead 音序器(25ms tick / 0.12s 预排),双声部(旋律+低音),
// 音量克制(master 0.11)不盖语音。开关偏好存 localStorage。

const STORAGE_KEY = 'voice-games:bgm';

// 音名 → 频率('C5' 'A4' '降B'不支持,全部用自然音+八度;'-'/null = 休止/延音)
const SEMITONES = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function freqOf(name) {
  const m = /^([A-G])(\d)$/.exec(name);
  if (!m) return null;
  const semi = SEMITONES[m[1]] + (Number(m[2]) - 4) * 12;
  return 440 * 2 ** (semi / 12);
}

// 每曲 32 步(4 小节 × 8 步,八分音符);mel/bass 为音名数组
const TRACKS = {
  gomoku: {
    bpm: 76,
    wave: 'sine',
    vol: 1.0,
    mel: [
      'E5', null, 'G5', null, 'A5', null, 'G5', null,
      'E5', null, 'D5', null, 'E5', null, null, null,
      'G5', null, 'A5', null, 'C6', null, 'A5', null,
      'G5', null, 'E5', null, 'D5', null, null, null,
    ],
    bass: [
      'C3', null, null, null, null, null, null, null,
      'A2', null, null, null, null, null, null, null,
      'F2', null, null, null, null, null, null, null,
      'G2', null, null, null, null, null, null, null,
    ],
  },
  xiangqi: {
    bpm: 86,
    wave: 'triangle',
    vol: 1.0,
    mel: [
      'D5', null, 'E5', 'G5', 'A5', null, 'G5', 'E5',
      'D5', null, 'C5', 'D5', null, null, null, null,
      'A4', null, 'D5', 'E5', 'G5', null, 'E5', 'D5',
      'E5', null, 'D5', 'C5', 'D5', null, null, null,
    ],
    bass: [
      'D3', null, null, null, 'A2', null, null, null,
      'G2', null, null, null, 'D3', null, null, null,
      'F2', null, null, null, 'C3', null, null, null,
      'G2', null, null, null, 'D3', null, null, null,
    ],
  },
  junqi: {
    bpm: 106,
    wave: 'square',
    vol: 0.55,
    mel: [
      'C5', 'C5', 'G4', 'C5', 'E5', null, 'C5', 'E5',
      'G5', null, 'E5', 'C5', 'G4', null, 'G4', 'G4',
      'A4', 'A4', 'E5', null, 'D5', 'D5', 'G5', null,
      'E5', 'C5', 'G4', 'E4', 'C4', null, null, null,
    ],
    bass: [
      'C3', null, 'C3', null, 'G2', null, 'G2', null,
      'C3', null, 'C3', null, 'E3', null, 'E3', null,
      'F2', null, 'F2', null, 'G2', null, 'G2', null,
      'C3', null, 'G2', null, 'C3', null, null, null,
    ],
  },
  ludo: {
    bpm: 128,
    wave: 'triangle',
    vol: 0.95,
    mel: [
      'C5', 'E5', 'G5', 'E5', 'C6', null, 'G5', 'E5',
      'F5', 'A5', 'C6', 'A5', 'G5', null, 'E5', 'C5',
      'D5', 'F5', 'A5', 'F5', 'G5', 'E5', 'C5', 'E5',
      'D5', null, 'G4', 'B4', 'C5', null, null, null,
    ],
    bass: [
      'C3', null, 'G2', null, 'C3', null, 'G2', null,
      'F2', null, 'C3', null, 'G2', null, 'C3', null,
      'D3', null, 'F2', null, 'C3', null, 'A2', null,
      'G2', null, 'G2', null, 'C3', null, null, null,
    ],
  },
  doudizhu: {
    bpm: 140,
    wave: 'square',
    vol: 0.5,
    mel: [
      'G5', 'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5',
      'D5', 'E5', 'D5', 'C5', 'A4', null, 'C5', 'D5',
      'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5',
      'E5', null, 'D5', 'C5', 'A4', 'C5', 'C5', null,
    ],
    bass: [
      'C3', null, 'G2', 'C3', 'A2', null, 'E3', 'A2',
      'F2', null, 'C3', 'F2', 'G2', null, 'D3', 'G2',
      'C3', null, 'G2', 'C3', 'A2', null, 'E3', 'A2',
      'F2', 'G2', 'C3', null, 'G2', null, 'C3', null,
    ],
  },
};

let ctx = null;
let master = null;
let timer = null;
let current = null; // 当前曲目 id
let stepIndex = 0;
let nextStepTime = 0;
let unlockHooked = false;

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.11; // 克制音量,不盖语音
    master.connect(ctx.destination);
  }
  return ctx;
}

// 自动播放策略兜底:挂一次性手势监听恢复 AudioContext
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
  g.gain.exponentialRampToValueAtTime(vol, time + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

function scheduler() {
  const track = TRACKS[current];
  if (!track || !ctx) return;
  const stepDur = 60 / track.bpm / 2; // 八分音符
  while (nextStepTime < ctx.currentTime + 0.12) {
    const i = stepIndex % 32;
    const mel = track.mel[i];
    const bass = track.bass[i];
    if (mel) {
      const f = freqOf(mel);
      if (f) playNote(f, nextStepTime, stepDur * 1.7, track.wave, track.vol);
    }
    if (bass) {
      const f = freqOf(bass);
      if (f) playNote(f, nextStepTime, stepDur * 2.6, 'sine', track.vol * 0.75);
    }
    nextStepTime += stepDur;
    stepIndex += 1;
  }
}

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
  } catch {
    /* ignore */
  }
  if (!on) stopBgm();
}

/** 播放指定游戏的 BGM(重复调用同曲目为幂等) */
export function playBgm(gameId) {
  if (!isBgmEnabled() || !TRACKS[gameId]) return;
  if (!ensureCtx()) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
    hookUnlock();
  }
  if (current === gameId && timer) return;
  stopBgm();
  current = gameId;
  stepIndex = 0;
  nextStepTime = ctx.currentTime + 0.06;
  timer = setInterval(scheduler, 25);
  scheduler();
}

export function stopBgm() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  current = null;
}
