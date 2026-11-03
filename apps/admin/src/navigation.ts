import { LayoutDashboard, Building2, KeyRound, ConciergeBell, Receipt, CalendarDays, FileText, ClipboardList, FolderOpen, Shield, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TextKey } from './i18n';

export type NavigationItem = { key: TextKey; icon: LucideIcon; available: boolean };
export const navigation: readonly NavigationItem[] = [
  { key: 'overview', icon: LayoutDashboard, available: true },
  { key: 'services', icon: ConciergeBell, available: true },
  { key: 'properties', icon: Building2, available: false },
  { key: 'access', icon: KeyRound, available: false },
  { key: 'sales', icon: ConciergeBell, available: false },
  { key: 'invoices', icon: Receipt, available: false },
  { key: 'calendar', icon: CalendarDays, available: false },
  { key: 'contracts', icon: FileText, available: false },
  { key: 'projects', icon: ClipboardList, available: false },
  { key: 'documents', icon: FolderOpen, available: false },
  { key: 'protected', icon: Shield, available: false },
  { key: 'settings', icon: Settings, available: false },
];
