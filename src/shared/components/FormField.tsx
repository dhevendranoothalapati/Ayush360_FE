import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

/** Text shown under a field that has a character limit: a count near the limit, an error at the limit. */
export function charLimitMessage(length: number, max: number | undefined): { error?: string; hint?: string } {
  if (!max) return {};
  if (length >= max) return { error: `Maximum ${max} characters reached` };
  if (length >= Math.floor(max * 0.8)) return { hint: `${length}/${max} characters` };
  return {};
}

/**
 * Label + control + validation message, consistently laid out.
 * If the control has a maxLength, the field shows "180/200 characters" near the limit and an error once the
 * limit is reached, so people see it while typing instead of after pressing Save.
 */
export function FormField({ label, htmlFor, required, error, hint, className, children }: FormFieldProps) {
  // The first child control with a maxLength (a field may also hold e.g. a <datalist>).
  const control = Children.toArray(children).find(
    (c): c is ReactElement<{ value?: unknown; maxLength?: number }> =>
      isValidElement<{ maxLength?: number }>(c) && typeof c.props.maxLength === 'number',
  );
  const value = control?.props.value;
  const limit = charLimitMessage(typeof value === 'string' ? value.length : 0, control?.props.maxLength);
  const shownError = error ?? limit.error;
  const shownHint = limit.hint ?? hint;

  return (
    <div className={`field ${className ?? ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {shownError ? (
        <span className="field-error" id={`${htmlFor}-error`} role="alert">
          {shownError}
        </span>
      ) : shownHint ? (
        <span className="field-hint">{shownHint}</span>
      ) : null}
    </div>
  );
}

/** Same message for a text box that isn't inside a FormField. */
export function CharLimit({ value, max }: { value: string; max: number }) {
  const limit = charLimitMessage(value.length, max);
  if (limit.error)
    return (
      <span className="field-error" role="alert">
        {limit.error}
      </span>
    );
  return limit.hint ? <span className="field-hint">{limit.hint}</span> : null;
}
