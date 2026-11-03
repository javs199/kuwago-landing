import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from './ui';
type Props = { title: string; description: ReactNode; confirm: string; cancel: string; onConfirm: () => void; onCancel: () => void };
export function ConfirmDialog({ title, description, confirm, cancel, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog className="confirm-dialog" ref={dialog} aria-labelledby="confirm-title" aria-describedby="confirm-description" onCancel={event => { event.preventDefault(); onCancel(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}><h2 id="confirm-title">{title}</h2><div id="confirm-description">{description}</div><div className="confirm-actions"><Button onClick={onCancel}>{cancel}</Button><Button variant="primary" onClick={onConfirm}>{confirm}</Button></div></dialog>;
}


