export type FailureCode = 'unauthenticated' | 'forbidden' | 'security_unavailable' | 'not_found' | 'method_not_allowed' | 'csrf_rejected' | 'operation_not_enabled';
export class SecurityFailure extends Error {
  constructor(public readonly status: number, public readonly code: FailureCode) {
    super(code); this.name = 'SecurityFailure';
  }
}
