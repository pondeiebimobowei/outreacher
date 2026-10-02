export abstract class ResearchProviderException extends Error {
  public abstract readonly retryable: boolean;
  public abstract readonly errorCode: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ResearchProviderTransientException extends ResearchProviderException {
  public readonly retryable = true;

  constructor(
    message: string,
    public readonly errorCode: string = 'PROVIDER_TRANSIENT_FAILURE',
  ) {
    super(message);
  }
}

export class ResearchProviderTimeoutException extends ResearchProviderTransientException {
  constructor(message: string = 'Research provider request timed out') {
    super(message, 'PROVIDER_TIMEOUT');
  }
}

export class ResearchProviderPermanentException extends ResearchProviderException {
  public readonly retryable = false;

  constructor(
    message: string,
    public readonly errorCode: string = 'PROVIDER_PERMANENT_FAILURE',
  ) {
    super(message);
  }
}

export class ResearchProviderValidationException extends ResearchProviderPermanentException {
  constructor(message: string) {
    super(message, 'INVALID_PROVIDER_CONTRACT');
  }
}
