import carabaoVilla from '../../assets/properties/carabao-villa.webp';
import casaBellaMia from '../../assets/properties/casa-bella-mia.webp';
import casaHeliconia from '../../assets/properties/casa-heliconia.webp';
import villaMaya from '../../assets/properties/villa-maya.webp';

const PROPERTY_COVERS = new Map<string, string>([
  ['carabao-villa', carabaoVilla],
  ['casa-bella-mia', casaBellaMia],
  ['casa-heliconia', casaHeliconia],
  ['villa-maya', villaMaya],
]);

export function getPropertyCover(slug: string): string | null {
  return PROPERTY_COVERS.get(slug) ?? null;
}
