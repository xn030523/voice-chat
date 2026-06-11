// 引擎注册表 + 大厅元数据(前端 Lobby 也 import 此文件,保持零 node 依赖)
import * as gomoku from './gomoku.js';
import * as xiangqi from './xiangqi.js';
import * as doudizhu from './doudizhu.js';
import * as junqi from './junqi.js';
import * as ludo from './ludo.js';

export const ENGINES = {
  gomoku,
  xiangqi,
  doudizhu,
  junqi,
  ludo,
};

// 大厅展示顺序(第一批 5 个游戏全部上架)
export const GAMES = [gomoku.meta, xiangqi.meta, ludo.meta, junqi.meta, doudizhu.meta];

export function getEngine(id) {
  return ENGINES[id] || null;
}
