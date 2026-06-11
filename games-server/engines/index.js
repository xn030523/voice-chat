// 引擎注册表 + 大厅元数据(前端 Lobby 也 import 此文件,保持零 node 依赖)
import * as gomoku from './gomoku.js';
import * as xiangqi from './xiangqi.js';
import * as doudizhu from './doudizhu.js';

export const ENGINES = {
  gomoku,
  xiangqi,
  doudizhu,
};

// 大厅展示顺序(后续里程碑逐个上架:junqi → ludo)
export const GAMES = [gomoku.meta, xiangqi.meta, doudizhu.meta];

export function getEngine(id) {
  return ENGINES[id] || null;
}
