export class ContactDiscoveryProviderException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ContactDiscoveryProviderException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
