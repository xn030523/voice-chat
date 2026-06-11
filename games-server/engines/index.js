// 引擎注册表 + 大厅元数据(前端 Lobby 也 import 此文件,保持零 node 依赖)
import * as gomoku from './gomoku.js';
import * as xiangqi from './xiangqi.js';

export const ENGINES = {
  gomoku,
  xiangqi,
};

// 大厅展示顺序(后续里程碑逐个上架:doudizhu → junqi → ludo)
export const GAMES = [gomoku.meta, xiangqi.meta];

export function getEngine(id) {
  return ENGINES[id] || null;
}
