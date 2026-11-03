import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { usePreferences } from '../preferences';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet'; icon?: LucideIcon };
export function Button({ variant = 'secondary', icon: Icon, children, className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={20} aria-hidden="true" />}<span>{children}</span></button>;
}
type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & { icon: LucideIcon; label: string };
export function IconButton({ icon: Icon, label, className = '', type = 'button', ...props }: IconButtonProps) {
  return <button type={type} className={`icon-button ${className}`} aria-label={label} title={label} {...props}><Icon size={22} aria-hidden="true" /></button>;
}
export function Panel({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`panel ${className}`} {...props}>{children}</section>;
}
export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
export function PageHeader({ title, description }: { title: string; description: string }) {
  return <div className="page-heading"><h1 id="overview-title">{title}</h1><p>{description}</p></div>;
}
export function PendingButton({ children, ...props }: Omit<ButtonProps, 'disabled' | 'onClick' | 'title'>) {
  const { t } = usePreferences();
  return <span className="pending-action"><Button {...props} disabled title={t('soon')}>{children}</Button><small>{t('soon')}</small></span>;
}
