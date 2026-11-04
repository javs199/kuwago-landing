import {render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {ApiServiceEditor,PriceAmountField} from '../features/services/ApiServiceEditor';
import {PreferencesProvider} from '../preferences';
import {adminApi,ApiError,newDraft,type DraftInput,type ServiceDocument,type Identity} from '../api/admin-client';

const session={identity:{id:'test-editor',role:'editor',permissions:['admin:read','drafts:write']} as Identity,reject:vi.fn(),setDirty:vi.fn()};
vi.mock('../api/session',()=>({useSession:()=>session}));
beforeEach(()=>{session.identity.permissions=['admin:read','drafts:write'];vi.spyOn(adminApi,'mediaList').mockResolvedValue({items:[],nextCursor:null});});
afterEach(()=>vi.restoreAllMocks());
function documentFor(draft:DraftInput,status:'draft'|'archived'='draft'):ServiceDocument{
  const {internalNotes,media,...revision}=draft;
  return {version:1,data:{service:{id:'test-service',provenance:'demo',status,workingRevisionId:'test-revision',publishedRevisionId:null,modifiedAt:'2026-01-01T00:00:00.000Z'},internalNotes,revisions:[{...revision,media:media.map(row=>({...row,url:'https://example.test/image.png',provenance:'verified',usageApproval:'pending'})),id:'test-revision',serviceId:'test-service',number:1,createdAt:'2026-01-01T00:00:00.000Z',commercialApproval:{status:'pending',revisionId:null}}]}};
}
function editor(draft?:DraftInput,previewOnly=false,status:'draft'|'archived'='draft'){
  if(draft)vi.spyOn(adminApi,'get').mockResolvedValue(documentFor(draft,status));
  return render(<PreferencesProvider><ApiServiceEditor id={draft?'test-service':null} categories={[]} previewOnly={previewOnly}/></PreferencesProvider>);
}
const options=()=>screen.getAllByRole('group').filter(group=>within(group).queryByLabelText(/^Opción · Español/));
const savedDraft=()=>vi.spyOn(adminApi,'save').mockImplementation(async draft=>{const value=documentFor(draft);if(vi.isMockFunction(adminApi.get))vi.mocked(adminApi.get).mockResolvedValue(value);return value;});
it('allows decimal typing without dropping the decimal separator or silently rounding invalid prices',async()=>{
  const user=userEvent.setup(),change=vi.fn();render(<PreferencesProvider><PriceAmountField label="Importe" initialMinor={0} onChange={change}/></PreferencesProvider>);
  const input=screen.getByLabelText('Importe');await user.clear(input);await user.type(input,'12.34');expect(input).toHaveValue('12.34');expect(change).toHaveBeenLastCalledWith(1234);expect(input).toHaveAttribute('aria-invalid','false');
  await user.type(input,'5');expect(input).toHaveValue('12.345');expect(change).toHaveBeenLastCalledWith(NaN);expect(input).toHaveAttribute('aria-invalid','true');
  await user.clear(input);expect(change).toHaveBeenLastCalledWith(NaN);
});

it('adds defaults, focuses the new option, confirms removal and keeps at least one option',async()=>{
  const user=userEvent.setup(),save=savedDraft(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);editor();
  expect(screen.getByRole('button',{name:'Quitar'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'Agregar opción'}));expect(options()).toHaveLength(2);expect(screen.getByLabelText('Opción · Español 2')).toHaveFocus();
  await user.click(screen.getByRole('button',{name:'Guardar borrador'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
  const sent=save.mock.calls[0]![0];expect(sent.options[1]).toEqual({id:expect.any(String),translations:{es:{name:''},en:{name:''}},durationMinutes:null,experienceType:'private',venue:'in_property',price:{kind:'quote',currency:null,unit:'service'}});expect(sent.options[0]!.id).not.toBe(sent.options[1]!.id);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Agregar opción'})).toBeEnabled());
  await user.click(within(options()[1]!).getByRole('button',{name:'Quitar'}));expect(confirm).toHaveBeenCalledWith('¿Quitar esta opción del borrador?');expect(options()).toHaveLength(2);
  confirm.mockReturnValue(true);await user.click(within(options()[1]!).getByRole('button',{name:'Quitar'}));expect(options()).toHaveLength(1);expect(screen.getByRole('button',{name:'Quitar'})).toBeDisabled();
});

it('duplicates below the source with independent fields and a new ID, and saves the displayed order',async()=>{
  const user=userEvent.setup(),save=savedDraft(),draft=newDraft();
  const first={...draft.options[0]!,translations:{es:{name:'Masaje'},en:{name:'Massage'}},durationMinutes:90,experienceType:'shared' as const,venue:'off_property' as const,price:{kind:'from' as const,amountMinor:12345,currency:'USD' as const,unit:'person' as const}};
  const last={...newDraft().options[0]!,translations:{es:{name:'Última'},en:{name:'Last'}}};draft.options=[first,last];editor(draft);
  await screen.findByDisplayValue('Masaje');await user.click(within(options()[0]!).getByRole('button',{name:'Duplicar'}));expect(options()).toHaveLength(3);expect(screen.getByLabelText('Opción · Español 2')).toHaveFocus();
  await user.click(screen.getByRole('button',{name:'Guardar borrador'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
  const sent=save.mock.calls[0]![0].options;expect(sent[0]).toEqual(first);expect(sent[2]).toEqual(last);expect(sent[1]).toEqual({...first,id:expect.any(String)});expect(new Set(sent.map(row=>row.id)).size).toBe(3);
  await waitFor(()=>expect(screen.getByLabelText('Opción · Español 2')).toBeEnabled());await user.clear(screen.getByLabelText('Opción · Español 2'));await user.type(screen.getByLabelText('Opción · Español 2'),'Variante');
  expect(screen.getByLabelText('Opción · Español 1')).toHaveValue('Masaje');await user.click(screen.getByRole('button',{name:'Guardar borrador'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[1]![0].options.map(row=>row.id)).toEqual(sent.map(row=>row.id));expect(first.translations.es.name).toBe('Masaje');
});

it('disables add and duplicate at 100 options and restores them after a removal',async()=>{
  const user=userEvent.setup(),draft=newDraft();draft.options=Array.from({length:99},()=>newDraft().options[0]!);vi.spyOn(window,'confirm').mockReturnValue(true);editor(draft);
  await waitFor(()=>expect(options()).toHaveLength(99));await user.click(screen.getByRole('button',{name:'Agregar opción'}));expect(options()).toHaveLength(100);expect(screen.getByRole('button',{name:'Agregar opción'})).toBeDisabled();expect(screen.getAllByRole('button',{name:'Duplicar'})).toHaveLength(100);for(const button of screen.getAllByRole('button',{name:'Duplicar'}))expect(button).toBeDisabled();expect(screen.getByText('Máximo 100 opciones')).toBeInTheDocument();
  await user.click(within(options()[99]!).getByRole('button',{name:'Quitar'}));expect(options()).toHaveLength(99);expect(screen.getByRole('button',{name:'Agregar opción'})).toBeEnabled();expect(screen.queryByText('Máximo 100 opciones')).not.toBeInTheDocument();
},15000);

it.each(['permission','preview','archived'] as const)('prevents option mutations for %s read-only editors',async mode=>{
  const draft=newDraft();draft.options.push(newDraft().options[0]!);if(mode==='permission')session.identity.permissions=['admin:read'];editor(draft,mode==='preview',mode==='archived'?'archived':'draft');await waitFor(()=>expect(options()).toHaveLength(2));for(const name of ['Agregar opción','Duplicar','Quitar'])for(const button of screen.getAllByRole('button',{name}))expect(button).toBeDisabled();
});

it('prevents option mutations while saving',async()=>{
  const user=userEvent.setup(),draft=newDraft();draft.options.push(newDraft().options[0]!);vi.spyOn(adminApi,'save').mockImplementation(()=>new Promise(()=>{}));editor(draft);await waitFor(()=>expect(options()).toHaveLength(2));await user.type(screen.getByLabelText('Opción · Español 1'),'Cambio');await user.click(screen.getByRole('button',{name:'Guardar borrador'}));for(const name of ['Agregar opción','Duplicar','Quitar'])for(const button of screen.getAllByRole('button',{name}))expect(button).toBeDisabled();
});

it('uses English option controls and confirmation',async()=>{
  localStorage.setItem('kuwago-admin-language','en');const user=userEvent.setup(),confirm=vi.spyOn(window,'confirm').mockReturnValue(true);editor();await user.click(screen.getByRole('button',{name:'Add option'}));expect(screen.getByLabelText('Option · Spanish 2')).toHaveFocus();expect(screen.getAllByRole('button',{name:'Duplicate'})).toHaveLength(2);await user.click(screen.getAllByRole('button',{name:'Remove'})[1]!);expect(confirm).toHaveBeenCalledWith('Remove this option from the draft?');
});

it.each(['es','en'])('explains normalized image size errors in %s without generic decoder diagnostics',async language=>{
  localStorage.setItem('kuwago-admin-language',language);vi.spyOn(adminApi,'uploadMedia').mockRejectedValue(new ApiError(422,'normalized_image_too_large'));const user=userEvent.setup();editor();await user.upload(screen.getByLabelText(language==='es'?'Seleccionar archivo multimedia':'Select media file'),new File(['image'],'test.png',{type:'image/png'}));expect(await screen.findByRole('alert')).toHaveTextContent(language==='es'?'La imagen convertida supera 2 MiB. Reduce su resolución (por ejemplo, a 1200 px de ancho) y súbela de nuevo.':'The converted image exceeds 2 MiB. Reduce its resolution (e.g. 1200 px wide) and upload it again.');
});
