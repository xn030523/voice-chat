// 大厅:牌桌注册表 + 摘要 + 50ms 防抖广播
import { Table } from './table.js';
import { ERR } from './protocol.js';

const MAX_TABLES = 20;
const DEBOUNCE_MS = 50;

export class Lobby {
  /**
   * @param {(payload:object)=>void} broadcastFn 把 lobby 消息发给所有已鉴权连接(hub 提供)
   * @param {(table:Table, events:Array)=>void} notifyTable 桌内异步变化(宽限超时等)的广播回调
   */
  constructor(broadcastFn, notifyTable) {
    this.tables = new Map(); // id -> Table
    this.broadcastFn = broadcastFn;
    this.notifyTable = notifyTable;
    this.dirtyTimer = null;
  }

  create(gameId, creator) {
    if (this.tables.size >= MAX_TABLES) {
      return { error: { code: ERR.TABLE_FULL, msg: '牌桌数量已达上限' } };
    }
    let table;
    try {
      table = new Table(gameId, creator, this.notifyTable);
    } catch (e) {
      return { error: { code: ERR.NOT_FOUND, msg: String(e.message || '创建失败') } };
    }
    this.tables.set(table.id, table);
    this.markDirty();
    return { table };
  }

  get(id) {
    return this.tables.get(id) || null;
  }

  remove(id) {
    const t = this.tables.get(id);
    if (t) {
      t.destroy();
      this.tables.delete(id);
      this.markDirty();
    }
  }

  /** 某 identity 当前所在桌(座位)——全局至多一桌 */
  tableOf(identity) {
    for (const t of this.tables.values()) {
      if (t.seatOf(identity) !== null) return t;
    }
    return null;
  }

  /** 某 identity 当前观战的桌 */
  spectatingTable(identity) {
    for (const t of this.tables.values()) {
      if (t.spectators.has(identity)) return t;
    }
    return null;
  }

  summaries() {
    return Array.from(this.tables.values(), (t) => t.summary());
  }

  /** 防抖广播大厅快照 */
  markDirty() {
    if (this.dirtyTimer) return;
    this.dirtyTimer = setTimeout(() => {
      this.dirtyTimer = null;
      try {
        this.broadcastFn({ type: 'lobby', tables: this.summaries() });
      } catch {
        /* 广播失败不致命 */
      }
    }, DEBOUNCE_MS);
  }

  /** GC sweep:回收符合条件的桌 */
  sweep(now = Date.now()) {
    const removed = [];
    for (const t of this.tables.values()) {
      if (t.gcEligible(now)) removed.push(t);
    }
    for (const t of removed) {
      t.destroy();
      this.tables.delete(t.id);
    }
    if (removed.length) this.markDirty();
    return removed;
  }
}
