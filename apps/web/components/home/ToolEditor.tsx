'use client';
import { useState } from 'react';
import { MAX_TOOLS, TOOLS, TOOL_GROUPS, swapTools, tint, toggleTool, toolById, type ToolId } from '@hknt/core';
import Icon from '@/components/Icon';
import { loadTools, saveTools } from '@/lib/news';

/**
 * 自訂常用工具（參考港鐵 App）：頂部黃色區係揀咗嘅（紅色「−」移除；撳兩個對調位置），
 * 下面按分類列出全部工具（藍色「+」加入，已揀嘅變淡），撳「儲存」先生效。App 版 apps/mobile/src/app/tools.tsx。
 */
export default function ToolEditor({ onBack }: { onBack: () => void }) {
  const [tools, setTools] = useState<ToolId[]>(() => loadTools());
  const [lifted, setLifted] = useState<ToolId | null>(null);
  const full = tools.length >= MAX_TOOLS;

  const tap = (id: ToolId) => {
    if (!lifted) return setLifted(id);
    setTools((t) => swapTools(t, lifted, id));
    setLifted(null);
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
        <p className="tool-edit-hint">撳「+」或「−」加入或者移除（最多 {MAX_TOOLS} 個）；撳兩個已揀嘅工具對調位置</p>
        <div className="tool-grid tool-edit-picked">
          {Array.from({ length: MAX_TOOLS }, (_, i) => {
            const id = tools[i];
            if (!id) return <div key={`empty-${i}`} className="tool-slot" aria-hidden="true" />;
            const t = toolById(id);
            return (
              <div key={id} className="tool-cell">
                <button className={`tool-tile${lifted === id ? ' lifted' : ''}`} onClick={() => tap(id)} aria-pressed={lifted === id} aria-label={`${t.label}（撳兩個對調位置）`}>
                  <ToolIcon id={id} />
                  <span className="tool-label">{t.label}</span>
                </button>
                <button className="tool-mark remove" onClick={() => (setTools(toggleTool(tools, id)), setLifted(null))} disabled={tools.length <= 1} aria-label={`移除${t.label}`}>
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
    <span className="tool-icon" style={{ color: t.color, background: tint(t.color, 0.12) }}>
      <Icon name={t.icon} size={28} />
      {!!badge && <span className="tool-badge">{badge}</span>}
    </span>
  );
}
