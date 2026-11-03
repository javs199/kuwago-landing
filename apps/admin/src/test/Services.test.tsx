import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { demoServices } from '../features/services/demo-data';
import { newService } from '../features/services/model';
import { reorder, validImageFiles, validateService } from '../features/services/validation';
import { parseRoute } from '../routing';

async function route(hash: string) { await act(async () => { history.replaceState(null, '', `/${hash}`); window.dispatchEvent(new HashChangeEvent('hashchange')); }); }
function start(hash = '#services') { history.replaceState(null, '', `/${hash}`); return render(<App source="demo" />); }

describe('services visual module', () => {
  it('searches bilingual names, combines filters and previews empty/loading/error states', async () => {
    const user = userEvent.setup(); start();
    expect(screen.getByRole('heading', { name: 'Servicios' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    await user.type(screen.getByRole('textbox', { name: 'Buscar servicios' }), 'Wellness');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Categoría'), 'dining');
    expect(screen.getByText('Un catálogo por construir')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await user.selectOptions(screen.getByLabelText('Estado de publicación'), 'archived');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Estado de vista'), 'loading');
    expect(screen.getByRole('region', { name: 'Cargando' })).toHaveAttribute('aria-busy', 'true');
    await user.selectOptions(screen.getByLabelText('Estado de vista'), 'error');
    expect(screen.getByText(/Es un escenario visual de error/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a los registros demo' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Estado de vista'), 'empty');
    expect(screen.getByText('Un catálogo por construir')).toBeInTheDocument();
  });
  it('applies incomplete drafts only in memory, preserves edits between views and resets on remount', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch'); const user = userEvent.setup(); const app = start('#services/new');
    await user.type(screen.getByLabelText('Nombre · Español'), 'Prueba temporal');
    await user.type(screen.getByLabelText('Slug'), 'prueba-temporal');
    await user.click(screen.getByRole('button', { name: 'Aplicar a la demo local' }));
    expect(screen.getByRole('status')).toHaveTextContent('No se guardó en servidor');
    await route('#services'); expect(screen.getByText('Prueba temporal')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Editar: Prueba temporal' }));
    await user.type(screen.getByLabelText('Nombre · Inglés'), 'Temporary example');
    await route('#overview'); await route('#services');
    await user.click(screen.getByRole('link', { name: 'Editar: Prueba temporal' }));
    expect(screen.getByLabelText('Nombre · Inglés')).toHaveValue('Temporary example');
    expect(fetch).not.toHaveBeenCalled();
    expect(Object.keys(localStorage).every(key => ['kuwago-admin-theme', 'kuwago-admin-language'].includes(key))).toBe(true);
    app.unmount(); start(); expect(screen.queryByText('Prueba temporal')).not.toBeInTheDocument();
  });
  it('requires confirmation for demo state changes and keeps the record unchanged until apply', async () => {
    const user = userEvent.setup(); start('#services/demo-wellness/edit');
    await user.click(screen.getByRole('button', { name: 'Ensayar estado archivado' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ensayar estado archivado' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cambiar estado local' }));
    expect(screen.getByRole('button', { name: 'Ensayar estado archivado' })).toBeDisabled();
    await route('#services');
    const row = screen.getByRole('row', { name: /Bienestar/ }); expect(within(row).getByText('Publicado · Demo')).toBeInTheDocument();
    await route('#services/demo-wellness/edit');
    await user.click(screen.getByRole('button', { name: 'Aplicar a la demo local' }));
    await route('#services'); expect(within(screen.getByRole('row', { name: /Bienestar/ })).getByText('Archivado · Demo')).toBeInTheDocument();
  });
  it('blocks publication of incomplete records, validates malformed fields and confirms discarding', async () => {
    const user = userEvent.setup(); start('#services/new');
    expect(screen.getByRole('button', { name: 'Ensayar estado publicado' })).toBeDisabled();
    await user.type(screen.getByLabelText('Slug'), 'Invalid slug!');
    await user.click(screen.getByRole('button', { name: 'Aplicar a la demo local' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug')).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'Volver a servicios' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByLabelText('Slug')).toHaveValue('Invalid slug!');
    await user.click(screen.getByRole('button', { name: 'Volver a servicios' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Descartar cambios' }));
    await screen.findByRole('heading', { name: 'Servicios' });
    await route('#services/new'); expect(screen.getByLabelText('Slug')).toHaveValue('');
  });
  it('rejects unsupported local files without trying to upload them', async () => {
    const user = userEvent.setup({ applyAccept: false }); start('#services/new');
    const input = screen.getByLabelText('Seleccionar imágenes locales');
    await user.upload(input, new File(['text'], 'example.svg', { type: 'image/svg+xml' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona JPEG, PNG o WebP válidos');
    expect(screen.getByText('Sin imágenes seleccionadas')).toBeInTheDocument();
  });
  it('keeps skip navigation on the current service route and returns to the overview', async () => {
    const user = userEvent.setup(); start();
    await user.click(screen.getByRole('link', { name: 'Saltar al contenido' }));
    expect(location.hash).toBe('#services'); expect(screen.getByRole('main')).toHaveFocus();
    await route('#overview'); expect(screen.getByRole('heading', { name: 'Resumen administrativo' })).toBeInTheDocument();
  });
  it('translates service fields and preview in both themes and handles missing temporary records', async () => {
    const user = userEvent.setup(); start('#services/demo-wellness/edit');
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByLabelText('Name · English')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('heading', { name: 'Wellness · Example A' })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
    await route('#services/unknown/edit'); expect(screen.getByRole('heading', { name: 'Demo service not found' })).toBeInTheDocument();
  });
});

describe('presentation validation and navigation', () => {
  it('distinguishes incomplete drafts from invalid values and requires bilingual readiness', () => {
    const blank = newService('new'); expect(validateService(blank, []).fields).toEqual({});
    const fixed = { ...blank, priceMode: 'fixed' as const }; expect(validateService(fixed, []).pending).toContain('priceMissing');
    expect(validateService(fixed, []).fields).toEqual({});
    const complete = demoServices()[0]!; expect(validateService(complete, demoServices()).pending).toEqual([]);
    expect(validateService({ ...complete, slug: 'demo-dining', duration: '1.5', amount: '-3', currency: 'BAD' }, demoServices()).fields).toEqual({ slug: 'invalidSlug', duration: 'invalidDuration', amount: 'invalidAmount', currency: 'invalidCurrency' });
    expect(validateService({ ...complete, title: { es: 'Hola', en: '' }, images: [{ ...complete.images[0]!, alt: { es: '', en: 'Image' } }] }, []).pending).toEqual(['titleMissing', 'altMissing']);
  });
  it('checks image limits and reorders without mutating the original', () => {
    const good = new File(['image'], 'test.png', { type: 'image/png' });
    expect(validImageFiles([good], 7)).toBe(true); expect(validImageFiles([good], 8)).toBe(false);
    expect(validImageFiles([new File(['svg'], 'test.svg', { type: 'image/svg+xml' })], 0)).toBe(false);
    expect(validImageFiles([new File([], 'empty.png', { type: 'image/png' })], 0)).toBe(false);
    expect(validImageFiles([new File([new Uint8Array(2097153)], 'big.jpg', { type: 'image/jpeg' })], 0)).toBe(false);
    const input = ['first', 'second', 'third']; expect(reorder(input, 2, 0)).toEqual(['third', 'first', 'second']); expect(input).toEqual(['first', 'second', 'third']); expect(reorder(input, 0, -1)).toEqual(input);
  });
  it('parses service routes without accepting arbitrary nested paths', () => {
    expect(parseRoute('#services')).toEqual({ page: 'services', mode: 'list' });
    expect(parseRoute('#services/demo-a/preview')).toEqual({ page: 'services', mode: 'preview', id: 'demo-a' });
    expect(parseRoute('#services/../../edit')).toEqual({ page: 'missing' });
  });
});




