import { useId, type ChangeEvent, type ReactNode } from 'react';
type Base = { label: string; value: string; onChange: (value: string) => void; error?: string | undefined; help?: string | undefined };
export function TextField({ label, value, onChange, error, help, multiline = false, maxLength = 2000, inputMode }: Base & { multiline?: boolean; maxLength?: number; inputMode?: 'numeric' | 'decimal' }) {
  const id = useId();
  const props = { id, value, maxLength, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : help ? `${id}-help` : undefined };
  return <div className="service-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea {...props} rows={4} /> : <input {...props} type="text" inputMode={inputMode} />}{help && <small id={`${id}-help`}>{help}</small>}{error && <small className="field-error" id={`${id}-error`}>{error}</small>}</div>;
}
export function SelectField({ label, value, onChange, children, help, error }: Base & { children: ReactNode }) {
  const id = useId();
  return <div className="service-field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={event => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}>{children}</select>{help && <small id={`${id}-help`}>{help}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}

