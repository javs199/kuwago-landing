import { describe, it, expect } from 'vitest';
import { demoToAdminContract } from '../features/services/contract-adapter';
import { demoServices } from '../features/services/demo-data';
import { newService } from '../features/services/model';
import { projectPublicCatalog, validateForPublication } from '@kuwago/contracts';

describe('shared admin contract boundary', () => {
  it('keeps demonstration provenance, exact decimal units and pending approval', () => {
    const input = demoServices()[0]!;
    const result = demoToAdminContract({...input,amount:'123.45'});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.service.provenance).toBe('demo');
    expect(result.data.revisions[0]?.options[0]?.price).toEqual({kind:'fixed',amountMinor:12345,currency:'USD',unit:'service'});
    expect(result.data.revisions[0]?.commercialApproval).toEqual({status:'pending',revisionId:null});
    expect(validateForPublication(result.data,result.data.service.workingRevisionId,[]).map(row=>row.code)).toContain('unverified_service');
    expect(projectPublicCatalog([result.data],[]).services).toEqual([]);
  });
  it('accepts incomplete local drafts but rejects unknown currencies and malformed data', () => {
    expect(demoToAdminContract(newService('demo-blank')).success).toBe(true);
    const input=demoServices()[0]!;
    expect(demoToAdminContract({...input,currency:'CAD'}).success).toBe(false);
    expect(demoToAdminContract({...input,duration:'1.5'}).success).toBe(false);
    expect(demoToAdminContract({...input,slug:'Bad Slug'}).success).toBe(false);
  });
  it('keeps local image URLs limited to demo media and quote prices without an inferred currency', () => {
    const draft=newService('demo-photo'); draft.images=[{id:'local-image',src:'blob:http://127.0.0.1/example',name:'local',alt:{es:'',en:''}}];
    const result=demoToAdminContract(draft);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.revisions[0]?.options[0]?.price).toEqual({kind:'quote',currency:null,unit:'service'});
    expect(result.data.revisions[0]?.media[0]?.usageApproval).toBe('pending');
  });
});
