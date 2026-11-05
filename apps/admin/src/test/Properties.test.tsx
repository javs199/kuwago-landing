import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { it, expect, vi, beforeEach } from 'vitest';
import { PropertyEditor } from '../features/properties/PropertyEditor';
import { PropertiesModule } from '../features/properties/PropertiesModule';
import { getPropertyCover } from '../features/properties/covers';
import { PreferencesProvider } from '../preferences';
import { adminApi, ApiError, type Identity, type PropertyDocument } from '../api/admin-client';
import { parseRoute } from '../routing';

const session = {
  identity: {
    id: 'test-admin',
    role: 'admin',
    permissions: [
      'admin:read',
      'drafts:write',
      'services:publish',
      'services:unpublish',
      'services:archive',
    ],
  } as Identity,
  reject: vi.fn(),
  setDirty: vi.fn(),
  refresh: vi.fn(),
  generation: 0,
  error: null,
  loading: false,
};
vi.mock('../api/session', () => ({ useSession: () => session }));

const fixture = (): PropertyDocument => ({
  version: 1,
  data: {
    id: 'test-property',
    slug: 'villa-maya',
    status: 'published',
    kind: 'managed',
    showOnLanding: true,
    sortOrder: 1,
    location: 'Escaleras, Uvita',
    maxGuests: 10,
    bedrooms: 5,
    bathrooms: 5,
    airbnbUrl: null,
    ownerName: null,
    ownerContact: null,
    internalNotes: null,
    translations: {
      es: { name: 'Villa Maya', tagline: 'Propiedad administrada', description: '' },
      en: { name: 'Villa Maya', tagline: 'Managed Property', description: '' },
    },
    slugLocked: true,
    hasUnpublishedChanges: false,
    updatedAt: '2026-11-05T12:00:00Z',
    updatedBy: null,
    publishedAt: '2026-11-05T12:00:00Z',
    publishedBy: null,
  },
});

beforeEach(() => {
  session.identity.permissions = [
    'admin:read',
    'drafts:write',
    'services:publish',
    'services:unpublish',
    'services:archive',
  ];
  vi.spyOn(adminApi, 'property').mockResolvedValue(fixture());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const editor = () =>
  render(
    <PreferencesProvider>
      <PropertyEditor id="test-property" />
    </PreferencesProvider>
  );

it('routes list/new/editor and shows property status, visibility, order and unpublished changes', async () => {
  expect(parseRoute('#properties')).toEqual({ page: 'properties', id: null });
  expect(parseRoute('#properties/new')).toEqual({ page: 'properties', id: 'new' });
  expect(parseRoute('#properties/test-property')).toEqual({
    page: 'properties',
    id: 'test-property',
  });
  const value = fixture();
  value.data.hasUnpublishedChanges = true;
  vi.spyOn(adminApi, 'properties').mockResolvedValue({ items: [value], nextCursor: null });
  render(
    <PreferencesProvider>
      <PropertiesModule id={null} />
    </PreferencesProvider>
  );
  expect(await screen.findByText('Villa Maya')).toBeInTheDocument();
  expect(screen.getByText('Cambios sin publicar')).toBeInTheDocument();
  expect(screen.getByText('Publicada')).toBeInTheDocument();
  expect(screen.getByText('Visible')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute(
    'href',
    '#properties/test-property'
  );
});

it('edits all sections, keeps locked slug, saves without metadata and publishes only after saving', async () => {
  const save = vi
    .spyOn(adminApi, 'saveProperty')
    .mockImplementation(async (input) => ({
      version: 2,
      data: { ...fixture().data, ...input, hasUnpublishedChanges: true },
    }));
  const publish = vi.spyOn(adminApi, 'publishProperty').mockResolvedValue({ ...fixture(), version: 3 });
  editor();
  await screen.findByDisplayValue('villa-maya');
  expect(screen.getByLabelText('Slug')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Orden'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Dueño'), { target: { value: 'Privado' } });
  fireEvent.change(screen.getByLabelText('Baños'), { target: { value: '2.5' } });
  expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]![0]).toMatchObject({
    sortOrder: 0,
    ownerName: 'Privado',
    bathrooms: 2.5,
    location: 'Escaleras, Uvita',
  });
  expect(save.mock.calls[0]![0]).not.toHaveProperty('status');
  await screen.findByText('Cambios sin publicar');
  fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
  await waitFor(() => expect(publish).toHaveBeenCalledWith('test-property', 'publish', 2));
});

it('editor may save but cannot publish, unpublish or archive', async () => {
  session.identity.permissions = ['admin:read', 'drafts:write'];
  editor();
  await screen.findByDisplayValue('villa-maya');
  for (const label of ['Publicar', 'Despublicar', 'Archivar'])
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
});

it('read-only identity cannot edit and English copy is complete', async () => {
  session.identity.permissions = ['admin:read'];
  localStorage.setItem('kuwago-admin-language', 'en');
  editor();
  await screen.findByDisplayValue('villa-maya');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.getByLabelText('Owner')).toBeDisabled();
  expect(screen.getByText('Team only. Never published.')).toBeInTheDocument();
});

it('rejects invalid input locally and keeps conflict edits for review/reload', async () => {
  const save = vi
    .spyOn(adminApi, 'saveProperty')
    .mockRejectedValue(new ApiError(409, 'version_or_state_conflict'));
  editor();
  await screen.findByDisplayValue('villa-maya');
  fireEvent.change(screen.getByLabelText('Enlace Airbnb'), {
    target: { value: 'https://evil.invalid/rooms/1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText(/Revisa los campos/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Enlace Airbnb'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Dueño'), { target: { value: 'No perder' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('La propiedad cambió. Recarga antes de guardar de nuevo.');
  expect(screen.getByLabelText('Dueño')).toHaveValue('No perder');
  expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
});

it('filters properties by client search query and status chip', async () => {
  const p1 = fixture();
  const p2 = fixture();
  p2.data.id = 'prop-2';
  p2.data.slug = 'carabao-villa';
  p2.data.status = 'draft';
  p2.data.translations = {
    es: { name: 'Carabao Villa', tagline: 'Villa de lujo', description: '' },
    en: { name: 'Carabao Villa', tagline: 'Luxury villa', description: '' },
  };
  p2.data.location = 'Uvita, Bahía Ballena';

  vi.spyOn(adminApi, 'properties').mockResolvedValue({ items: [p1, p2], nextCursor: null });
  render(
    <PreferencesProvider>
      <PropertiesModule id={null} />
    </PreferencesProvider>
  );

  expect(await screen.findByText('Villa Maya')).toBeInTheDocument();
  expect(screen.getByText('Carabao Villa')).toBeInTheDocument();

  // Search filter
  const searchInput = screen.getByPlaceholderText(/Buscar por nombre/);
  fireEvent.change(searchInput, { target: { value: 'Maya' } });
  expect(screen.getByText('Villa Maya')).toBeInTheDocument();
  expect(screen.queryByText('Carabao Villa')).not.toBeInTheDocument();

  // Clear search
  fireEvent.change(searchInput, { target: { value: '' } });
  expect(screen.getByText('Carabao Villa')).toBeInTheDocument();

  // Status chip filter: Borradores
  fireEvent.click(screen.getByRole('tab', { name: /Borradores/ }));
  expect(screen.queryByText('Villa Maya')).not.toBeInTheDocument();
  expect(screen.getByText('Carabao Villa')).toBeInTheDocument();
});

it('resolves packaged cover webp for known slugs and null for unknown', () => {
  expect(getPropertyCover('carabao-villa')).toBeTruthy();
  expect(getPropertyCover('villa-maya')).toBeTruthy();
  expect(getPropertyCover('casa-bella-mia')).toBeTruthy();
  expect(getPropertyCover('casa-heliconia')).toBeTruthy();
  expect(getPropertyCover('casa-cielo')).toBeNull();
  expect(getPropertyCover('unknown-slug')).toBeNull();
});

it('switches tabs in the editor and preserves soon badges on locked tabs', async () => {
  editor();
  await screen.findByDisplayValue('villa-maya');

  const dataTab = screen.getByRole('tab', { name: /Datos/ });
  fireEvent.click(dataTab);
  expect(dataTab).toHaveAttribute('aria-selected', 'true');

  const guestsTab = screen.getByRole('tab', { name: /Huéspedes/ });
  expect(guestsTab).toBeDisabled();

  const calendarTab = screen.getByRole('tab', { name: /Calendario/ });
  expect(calendarTab).toBeDisabled();
});
