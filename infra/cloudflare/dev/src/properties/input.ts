import { PropertyInputSchema } from '../../../../../packages/contracts/src/admin.js';
import { ApiFailure } from '../catalog/input.js';

export function propertyInput(value: unknown) {
  const parsed = PropertyInputSchema.safeParse(value);
  if (!parsed.success) throw new ApiFailure(422, 'invalid_property');
  return parsed.data;
}
