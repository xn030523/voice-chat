'use client';

// 斗地主桌面:手牌扇形多选 + 叫分条 + 出牌/不出 + 底牌/倍数/地主标识
// 牌型校验同构复用 doudizhu-cards(出牌按钮即时反馈);服务端仍是唯一裁决者
import { useMemo, useState } from 'react';
import { Badge, Button, Text } from '@mantine/core';
import { Crown } from 'lucide-react';
import {
  classify,
  canBeat,
  rankOf,
  rankLabel,
  suitOf,
  SUIT_SYMBOLS,
  typeLabel,
  findPlay,
} from '@/games-server/engines/doudizhu-cards.js';

function CardFace({ id, selected, onClick, small }) {
  const r = rankOf(id);
  const joker = r >= 16;
  const suit = suitOf(id);
  const red = joker ? r === 17 : suit === 0 || suit === 2;
  return (
    <button
      type="button"
      className={`ddz-card${selected ? ' sel' : ''}${small ? ' sm' : ''}${red ? ' red' : ''}`}
      onClick={onClick}
      tabIndex={-1}
    >
      <span className="ddz-card-rank">{joker ? (r === 17 ? '大' : '小') : rankLabel(r)}</span>
      <span className="ddz-card-suit">{joker ? '王' : SUIT_SYMBOLS[suit]}</span>
    </button>
  );
}

export default function DoudizhuTable({ table, onMove }) {
  const view = table.view;
  const [sel, setSel] = useState(() => new Set());
  const mySeat = table.you.seat;
  const myTurn = mySeat !== null && view && view.turn === mySeat;

  const parsed = useMemo(() => {
    if (!sel.size) return null;
    return classify([...sel]);
  }, [sel]);

  if (!view) return null;
  const { phase } = view;

  const playable =
    phase === 'playing' && myTurn && parsed && (!view.lastPlay || canBeat(parsed, view.lastPlay.parsed));
  const lm = phase !== 'ended' && myTurn ? { bid: phase === 'bidding', canPass: !!view.lastPlay && view.lastPlay.seat !== mySeat } : null;

  const toggle = (id) => {
    if (!myTurn || phase !== 'playing') return;
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doPlay = () => {
    if (!playable) return;
    onMove({ type: 'play', cards: [...sel] });
    setSel(new Set());
  };
  const doPass = () => {
    onMove({ type: 'pass' });
    setSel(new Set());
  };
  const doBid = (score) => onMove({ type: 'bid', score });
  const doHint = () => {
    const suggestion = findPlay(view.hand || [], view.lastPlay && view.lastPlay.seat !== mySeat ? view.lastPlay.parsed : null);
    if (suggestion) setSel(new Set(suggestion));
  };
  const hintAvailable =
    phase === 'playing' &&
    myTurn &&
    !!findPlay(view.hand || [], view.lastPlay && view.lastPlay.seat !== mySeat ? view.lastPlay.parsed : null);

  // 对家两人:上家在左、下家在右(出牌动线 我 → 右(下家) → 左(上家),与通行牌桌惯例一致)
  const others = [2, 1]
    .map((d) => (mySeat !== null ? (mySeat + d) % 3 : d - 1))
    .map((seat) => ({ seat, info: table.seats[seat], count: view.counts[seat] }));

  const seatTag = (seat) =>
    view.landlord === seat ? (
      <Badge size="xs" color="yellow" variant="filled" leftSection={<Crown size={10} />}>
        地主
      </Badge>
    ) : view.landlord !== null ? (
      <Badge size="xs" color="teal" variant="light">
        农民
      </Badge>
    ) : null;

  const bidText = (seat) => {
    if (phase !== 'bidding') return null;
    const h = view.bidding.highest;
    if (h && h.seat === seat) return `叫 ${h.score} 分`;
    return null;
  };

  return (
    <div className="ddz-table">
      {/* 对家区 */}
      <div className="ddz-opponents">
        {others.map(({ seat, info, count }) => (
          <div key={seat} className={`ddz-opp${view.turn === seat ? ' turn' : ''}`}>
            <Text size="sm" fw={600}>
              {info?.name || `${seat + 1} 号位`}
            </Text>
            {seatTag(seat)}
            <Badge size="sm" variant="light" color="gray">
              {count} 张
            </Badge>
            {bidText(seat) && (
              <Text size="xs" c="yellow.4">
                {bidText(seat)}
              </Text>
            )}
          </div>
        ))}
      </div>

      {/* 中央:底牌 + 桌面牌 + 倍数 */}
      <div className="ddz-center">
        <div className="ddz-bottom-cards">
          <Text size="xs" c="dimmed">
            底牌
          </Text>
          {view.bottom ? (
            view.bottom.map((id) => <CardFace key={id} id={id} small />)
          ) : (
            [0, 1, 2].map((i) => <div key={i} className="ddz-card sm back" />)
          )}
          <Badge size="sm" variant="light" color="indigo" ml={8}>
            倍数 ×{view.displayMultiplier}
          </Badge>
          {view.redeals > 0 && phase === 'bidding' && (
            <Text size="xs" c="dimmed">
              (无人叫分,已重新发牌)
            </Text>
          )}
        </div>
        <div className="ddz-lastplay">
          {view.lastPlay ? (
            <>
              <Text size="xs" c="dimmed">
                {table.seats[view.lastPlay.seat]?.name || '上家'} 出 {view.lastPlay.label}
              </Text>
              <div className="ddz-cards-row">
                {view.lastPlay.cards.map((id) => (
                  <CardFace key={id} id={id} small />
                ))}
              </div>
            </>
          ) : phase === 'playing' ? (
            <Text size="sm" c="dimmed">
              {view.turn === mySeat ? '你自由出牌' : `等待 ${table.seats[view.turn]?.name || '对方'} 出牌…`}
            </Text>
          ) : phase === 'bidding' ? (
            <Text size="sm" c="dimmed">
              叫分中:{table.seats[view.turn]?.name || ''}{view.turn === mySeat ? '(你)' : ''} 思考中…
            </Text>
          ) : null}
        </div>
      </div>

      {/* 操作条 */}
      <div className="ddz-actions">
        {lm?.bid && (
          <>
            {(view.bidding.highest?.score || 0) < 1 && <Button size="sm" onClick={() => doBid(1)}>1 分</Button>}
            {(view.bidding.highest?.score || 0) < 2 && <Button size="sm" onClick={() => doBid(2)}>2 分</Button>}
            <Button size="sm" color="orange" onClick={() => doBid(3)}>
              3 分
            </Button>
            <Button size="sm" variant="light" color="gray" onClick={() => doBid(0)}>
              不叫
            </Button>
          </>
        )}
        {phase === 'playing' && myTurn && (
          <>
            <Button size="sm" disabled={!playable} onClick={doPlay}>
              出牌{parsed ? ` · ${typeLabel(parsed)}` : ''}
            </Button>
            <Button size="sm" variant="light" color="gray" disabled={!lm?.canPass} onClick={doPass}>
              不出
            </Button>
            <Button size="sm" variant="subtle" disabled={!hintAvailable} onClick={doHint}>
              提示
            </Button>
            {sel.size > 0 && (
              <Button size="sm" variant="subtle" color="gray" onClick={() => setSel(new Set())}>
                清空
              </Button>
            )}
            {sel.size > 0 && !parsed && (
              <Text size="xs" c="red.4">
                不符合牌型
              </Text>
            )}
            {parsed && view.lastPlay && !canBeat(parsed, view.lastPlay.parsed) && (
              <Text size="xs" c="red.4">
                管不上
              </Text>
            )}
          </>
        )}
        {phase === 'playing' && !myTurn && mySeat !== null && (
          <Text size="sm" c="dimmed">
            等待 {table.seats[view.turn]?.name || '对方'} 行动…
          </Text>
        )}
        {mySeat === null && (
          <Text size="sm" c="dimmed">
            观战中(手牌已隐藏)
          </Text>
        )}
      </div>

      {/* 我的手牌 */}
      {mySeat !== null && view.hand && (
        <div className="ddz-hand-wrap">
          <div className="ddz-hand-meta">
            <Text size="xs" c="dimmed">
              我的手牌 · {view.hand.length} 张
            </Text>
            {seatTag(mySeat)}
          </div>
          <div className="ddz-hand">
            {view.hand.map((id) => (
              <CardFace key={id} id={id} selected={sel.has(id)} onClick={() => toggle(id)} />
            ))}
          </div>
        </div>
      )}
      {/* 终局亮牌 */}
      {phase === 'ended' && view.allHands && (
        <div className="ddz-reveal">
          {view.allHands.map((h, seat) =>
            seat === mySeat || h.length === 0 ? null : (
              <div key={seat} className="ddz-reveal-row">
                <Text size="xs" c="dimmed">
                  {table.seats[seat]?.name}:
                </Text>
                {h.map((id) => (
                  <CardFace key={id} id={id} small />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
