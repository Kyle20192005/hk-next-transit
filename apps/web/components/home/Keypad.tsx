'use client';
import Icon from '@/components/Icon';

type Props = {
  /** 可以接落去嘅字（數字同字母） */
  nextChars: Set<string>;
  onKey: (k: string) => void;
  onBack: () => void;
  onPlace: () => void;
  canBack: boolean;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** 巴士號碼鍵盤：左邊數字（冇路線嘅會變灰），右邊只列可以接落去嘅字母 */
export default function Keypad({ nextChars, onKey, onBack, onPlace, canBack }: Props) {
  const letters = [...nextChars].filter((c) => /[A-Z]/.test(c)).sort();
  return (
    <div className="keypad" role="group" aria-label="路線號碼鍵盤">
      <div className="keypad-digits">
        {DIGITS.map((d) => (
          <button key={d} onClick={() => onKey(d)} disabled={!nextChars.has(d)}>
            {d}
          </button>
        ))}
        <button className="key-fn" onClick={onPlace} aria-label="用地點搜尋">
          <Icon name="search" size={18} />
          <span>地點</span>
        </button>
        <button onClick={() => onKey('0')} disabled={!nextChars.has('0')}>
          0
        </button>
        <button className="key-fn" onClick={onBack} disabled={!canBack} aria-label="刪除">
          <Icon name="backspace" size={24} />
        </button>
      </div>
      <div className="keypad-letters" aria-label="字母">
        {letters.map((l) => (
          <button key={l} onClick={() => onKey(l)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
