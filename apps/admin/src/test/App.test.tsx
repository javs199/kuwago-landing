import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';

describe('local administrative foundation', () => {
  it('shows disconnected metrics and clearly disabled future actions, without a login', () => {
    const { container } = render(<App source="demo" />);
    expect(screen.getByRole('heading', { name: 'Resumen administrativo' })).toBeInTheDocument();
    expect([...container.querySelectorAll('.metric-number')].map(node => node.textContent)).toEqual(Array(6).fill('—'));
    expect(screen.getByRole('button', { name: 'Agregar propiedad' })).toBeDisabled();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(screen.getByText(/Sin backend, autenticación/)).toBeInTheDocument();
  });
  it('switches the full interface language and restores it on another mount', async () => {
    const user = userEvent.setup();
    const app = render(<App source="demo" />);
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Administration overview' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('kuwago-admin-language')).toBe('en');
    app.unmount(); render(<App source="demo" />);
    expect(screen.getByRole('heading', { name: 'Administration overview' })).toBeInTheDocument();
  });
  it('persists theme without creating session or credential state', async () => {
    const user = userEvent.setup();
    const app = render(<App source="demo" />);
    await user.click(screen.getByRole('button', { name: 'Cambiar a tema oscuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    app.unmount(); render(<App source="demo" />);
    expect(screen.getByRole('button', { name: 'Cambiar a tema claro' })).toBeInTheDocument();
    expect(Object.keys(localStorage).sort()).toEqual(['kuwago-admin-language', 'kuwago-admin-theme']);
  });
  it('keeps preference controls usable if browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup(); render(<App source="demo" />);
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Administration overview' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it('opens the mobile navigation, preserves disabled modules and restores focus on close', async () => {
    const user = userEvent.setup(); render(<App source="demo" />);
    const more = screen.getByRole('button', { name: 'Más' });
    await user.click(more);
    const dialog = screen.getByRole('dialog', { name: 'Menú administrativo' });
    expect(within(dialog).getByRole('button', { name: /Ventas concierge/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /Cerrar sesión/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar menú' }));
    expect(dialog).not.toHaveAttribute('open');
    expect(more).toHaveFocus();
  });
});

