'use client';
import { useRef, useState, type PointerEvent } from 'react';
import { MAX_TOOLS, TOOLS, TOOL_GROUPS, dragShift, moveTool, toggleTool, toolById, type ToolId } from '@hknt/core';
import Icon from '@/components/Icon';
import { loadTools, saveTools } from '@/lib/news';

/**
 * 自訂常用工具（參考港鐵 App）：頂部黃色區係揀咗嘅（紅色「−」移除；手指或者滑鼠拖住左右移排位置，鍵盤用左右箭嘴），
 * 下面按分類列出全部工具（藍色「+」加入，已揀嘅變淡），撳「儲存」先生效。App 版 apps/mobile/src/app/tools.tsx。
 */
export default function ToolEditor({ onBack }: { onBack: () => void }) {
  const [tools, setTools] = useState<ToolId[]>(() => loadTools());
  const full = tools.length >= MAX_TOOLS;
  // 拖拉排序：pointer 事件（手指、滑鼠一樣），拖緊嗰個跟住手指，其他即時讓位，放手先改次序
  const [drag, setDrag] = useState<{ id: ToolId; from: number; dx: number; step: number } | null>(null);
  const start = useRef(0);
  const [settle, setSettle] = useState(false);
  const to = drag ? Math.max(0, Math.min(tools.length - 1, drag.from + Math.round(drag.dx / drag.step))) : 0;

  const down = (e: PointerEvent<HTMLButtonElement>, id: ToolId, i: number) => {
    if (e.button !== 0) return;
    const cell = e.currentTarget.parentElement!;
    const gap = parseFloat(getComputedStyle(cell.parentElement!).columnGap) || 10;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = e.clientX;
    setDrag({ id, from: i, dx: 0, step: cell.offsetWidth + gap });
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const max = (tools.length - 1 - drag.from) * drag.step;
    const min = -drag.from * drag.step;
    setDrag({ ...drag, dx: Math.max(min - 12, Math.min(max + 12, e.clientX - start.current)) });
  };
  const up = () => {
    if (!drag) return;
    setTools((t) => moveTool(t, drag.from, to));
    setDrag(null);
    // 放手：次序變咗，讓位用嘅 transform 同時拎走，呢一格唔好過渡（否則會彈一彈）
    setSettle(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setSettle(false)));
  };

  return (
    <div className="tool-edit">
      <header className="app-bar tool-edit-top">
        <div className="tool-edit-head">
          <button className="bar-btn" onClick={onBack} aria-label="返回">
            <Icon name="back" />
          </button>
          <div className="app-title">
            <h1>自訂常用工具</h1>
          </div>
        </div>
        <p className="tool-edit-hint">撳「+」或「−」加入或者移除（最多 {MAX_TOOLS} 個）；拖住已揀嘅工具左右移排位置</p>
        <div className={`tool-grid tool-edit-picked${drag ? ' dragging' : ''}${settle ? ' settle' : ''}`}>
          {Array.from({ length: MAX_TOOLS }, (_, i) => {
            const id = tools[i];
            if (!id) return <div key={`empty-${i}`} className="tool-slot" aria-hidden="true" />;
            const t = toolById(id);
            return (
              <div
                key={id}
                className={`tool-cell${drag?.id === id ? ' lifted' : ''}`}
                style={drag ? { transform: `translateX(${drag.id === id ? drag.dx : dragShift(i, drag.from, to) * drag.step}px)` } : undefined}
              >
                <button
                  className="tool-tile tool-drag"
                  onPointerDown={(e) => down(e, id, i)}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  onKeyDown={(e) => {
                    const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                    if (d && i + d >= 0 && i + d < tools.length) {
                      e.preventDefault();
                      setTools(moveTool(tools, i, i + d));
                    }
                  }}
                  aria-label={`${t.label}，第 ${i + 1} 個（拖住或者用左右箭嘴移位置）`}
                >
                  <ToolIcon id={id} />
                  <span className="tool-label">{t.label}</span>
                </button>
                <button className="tool-mark remove" onClick={() => setTools(toggleTool(tools, id))} disabled={tools.length <= 1} aria-label={`移除${t.label}`}>
                  <Icon name="minus" size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </header>

      <div className="tool-edit-body">
        {TOOL_GROUPS.map((g) => (
          <section key={g.id} className="feed-section">
            <div className="feed-head">
              <h2>{g.label}</h2>
            </div>
            <div className="tool-grid">
              {TOOLS.filter((t) => t.group === g.id).map((t) => {
                const on = tools.includes(t.id);
                const off = on || full;
                return (
                  <div key={t.id} className={`tool-cell${on ? ' picked' : ''}`}>
                    <button className="tool-tile" onClick={() => !off && setTools(toggleTool(tools, t.id))} disabled={off} aria-label={on ? `${t.label}（已揀）` : `加入${t.label}`}>
                      <ToolIcon id={t.id} />
                      <span className="tool-label">{t.label}</span>
                      {t.soon && <span className="tool-soon">即將推出</span>}
                    </button>
                    <span className="tool-mark add" aria-hidden="true">
                      <Icon name="plus" size={16} />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="tool-edit-save">
        <button
          className="primary-btn"
          onClick={() => {
            saveTools(tools);
            onBack();
          }}
        >
          儲存
        </button>
      </div>
    </div>
  );
}

export function ToolIcon({ id, badge }: { id: ToolId; badge?: number }) {
  const t = toolById(id);
  return (
    <span className="tool-icon" style={{ color: t.color }}>
      <Icon name={t.icon} size={38} duo />
      {!!badge && <span className="tool-badge">{badge}</span>}
    </span>
  );
}
