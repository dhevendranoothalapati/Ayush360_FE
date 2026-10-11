import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '@/shared/components/Icons';

interface TypeaheadProps<T> {
  label: string;
  placeholder: string;
  /** Called (debounced) as the doctor types. */
  search: (term: string, signal: AbortSignal) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onPick: (item: T) => void;
  /** Enter with nothing highlighted adds the typed text as-is (free text). */
  onFreeText?: (text: string) => void;
  freeTextHint?: string;
  /** Show suggestions on focus even before typing. */
  showOnFocus?: boolean;
  /** Longest name that can be typed as free text. */
  maxLength?: number;
}

/** Search box with a suggestion list: arrow keys + Enter to pick, Enter on free text to add it as typed. */
export function Typeahead<T>({
  label,
  placeholder,
  search,
  itemKey,
  renderItem,
  onPick,
  onFreeText,
  freeTextHint,
  showOnFocus = false,
  maxLength = 200,
}: TypeaheadProps<T>) {
  const id = useId();
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    if (!open) return;
    if (!term.trim() && !showOnFocus) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        setItems(await searchRef.current(term.trim(), controller.signal));
        setActive(-1);
      } catch {
        /* aborted or failed: keep the box usable for free text */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term, open, showOnFocus]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(item: T) {
    onPick(item);
    setTerm('');
    setItems([]);
    setActive(-1);
  }

  function addFreeText() {
    const text = term.trim();
    if (!text || !onFreeText) return;
    onFreeText(text);
    setTerm('');
    setItems([]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) pick(items[active]);
      else addFreeText();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && (items.length > 0 || (term.trim() !== '' && !loading));

  return (
    <div className="ta" ref={boxRef}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="ta-input">
        <Icon name="search" size={18} />
        <input
          id={id}
          className="input"
          placeholder={placeholder}
          value={term}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          maxLength={maxLength}
        />
        {loading && <span className="spinner-sm" aria-hidden="true" />}
      </div>
      {term.length >= maxLength && <span className="field-error">Maximum {maxLength} characters reached</span>}
      {showList && (
        <ul className="ta-list" id={`${id}-list`} role="listbox">
          {items.map((item, i) => (
            <li
              key={itemKey(item)}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'ta-item active' : 'ta-item'}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {renderItem(item)}
            </li>
          ))}
          {onFreeText && term.trim() !== '' && (
            <li
              role="option"
              aria-selected={false}
              className="ta-item ta-free"
              onMouseDown={(e) => {
                e.preventDefault();
                addFreeText();
              }}
            >
              <Icon name="plus" size={16} /> Add “{term.trim()}”{freeTextHint ? ` ${freeTextHint}` : ''}
            </li>
          )}
          {!onFreeText && items.length === 0 && <li className="ta-empty">No matches</li>}
        </ul>
      )}
    </div>
  );
}
