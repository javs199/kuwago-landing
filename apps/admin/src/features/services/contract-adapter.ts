import { AdminServiceSchema, type AdminService, type Result, type ServicePrice, type Currency } from '@kuwago/contracts';
import type { DemoService } from './model';

// Presentation fields may be incomplete strings. This boundary never grants approval,
// persists data, or converts demonstration records into verified commercial content.
export function demoToAdminContract(row: DemoService, now = new Date().toISOString()): Result<AdminService> {
  const revisionId = `${row.id}-r1`;
  let price: ServicePrice | null = null;
  if (row.priceMode === 'quote') price = {kind:'quote',currency:row.currency ? row.currency as Currency : null,unit:row.unit};
  else if (/^\d{1,9}(?:\.\d{1,2})?$/.test(row.amount) && row.currency) {
    const [whole = '',fraction = ''] = row.amount.split('.');
    price = {kind:row.priceMode,amountMinor:Number(whole) * 100 + Number(fraction.padEnd(2,'0')),currency:row.currency as Currency,unit:row.unit};
  }
  return AdminServiceSchema.safeParse({
    service:{id:row.id,provenance:'demo',status:row.status,workingRevisionId:revisionId,
      publishedRevisionId:row.status === 'published' ? revisionId : null,modifiedAt:row.modifiedAt || now},
    revisions:[{id:revisionId,serviceId:row.id,slug:row.slug,number:1,createdAt:row.modifiedAt || now,categoryId:row.category,
      translations:{es:{title:row.title.es,description:row.description.es},en:{title:row.title.en,description:row.description.en}},
      options:[{id:`${row.id}-default`,translations:{es:{name:row.title.es},en:{name:row.title.en}},
        durationMinutes:row.duration ? Number(row.duration) : null,experienceType:row.privacy,venue:row.venue,price}],
      media:row.images.map((image,index) => ({id:image.id,url:image.src,alt:image.alt,sortOrder:index,provenance:'demo',usageApproval:'pending'})),
      commercialApproval:{status:'pending',revisionId:null}}],internalNotes:'Local visual demonstration only.',
  });
}
