import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/core/api/httpClient';
import { Icon } from '@/shared/components/Icons';
import { ageFromDob, formatMobile, fullName } from '@/shared/utils/format';
import { registrationApi } from '../api/registrationApi';
import { GENDER_OPTIONS, type Patient } from '../types';

interface PatientSearchProps {
  onSelect: (patient: Patient) => void;
  disabled?: boolean;
}

/** Find a returning patient by patient ID, mobile number or name (debounced). */
export function PatientSearch({ onSelect, disabled }: PatientSearchProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      registrationApi
        .searchPatients(q, controller.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(e instanceof ApiError ? e.message : 'Search failed');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [term]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function choose(p: Patient) {
    onSelect(p);
    setTerm('');
    setResults([]);
    setOpen(false);
  }

  const showPanel = open && term.trim().length >= 2;

  return (
    <div className="patient-search" ref={boxRef}>
      <div className="search-input">
        <Icon name="search" size={20} />
        <input
          type="search"
          placeholder="Search by patient ID, mobile number or name"
          value={term}
          disabled={disabled}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showPanel || results.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          aria-label="Search patients"
          aria-expanded={showPanel}
          aria-controls="patient-search-results"
          role="combobox"
        />
        {loading && <span className="spinner spinner-sm" aria-label="Searching" />}
      </div>

      {showPanel && (
        <div className="search-results" id="patient-search-results" role="listbox">
          {error && <div className="search-empty">{error}</div>}
          {!error && !loading && results.length === 0 && (
            <div className="search-empty">No patient found. Register as a new patient.</div>
          )}
          {results.map((p, i) => {
            const age = ageFromDob(p.dateOfBirth);
            const gender = GENDER_OPTIONS.find((g) => g.value === p.gender)?.label;
            return (
              <button
                type="button"
                key={p.id}
                role="option"
                aria-selected={i === active}
                className={`search-result ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
              >
                <span className="sr-name">{fullName(p)}</span>
                <span className="sr-meta">
                  {p.patientNumber} · {formatMobile(p.mobileNumber)}
                  {gender ? ` · ${gender}` : ''}
                  {age !== null ? `, ${age} y` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
