import type {ProcessorEnvironment} from '../images/processor.js';
import type {MediaBucket} from '../multimedia.js';
import type { AuthDatabase, D1Statement } from '../auth/types.js';
export interface CatalogDatabase extends AuthDatabase {
  withSession?(constraint:'first-primary'):CatalogDatabase;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<{success:boolean;results:T[]}[]>;
}
export interface PublicationStore {
  get(key:string): Promise<{etag:string;text():Promise<string>;arrayBuffer?():Promise<ArrayBuffer>} | null>;
  put(key:string,value:string|ArrayBuffer,options:{onlyIf:{etagMatches:string}|{etagDoesNotMatch:string}}): Promise<unknown | null>;
}
export interface CatalogEnvironment extends ProcessorEnvironment {
  DB: CatalogDatabase;
  PRIVATE_MEDIA?:MediaBucket;
  MEDIA_MAX_BYTES?:string;
  DEV_IMAGE_INPUT_SHA256?:string;
  PUBLICATION?: PublicationStore;
}
