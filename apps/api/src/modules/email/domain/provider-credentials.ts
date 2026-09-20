export interface ResendCredentials {
  provider: 'RESEND';
  apiKey: string;
}

export interface SesCredentials {
  provider: 'SES';
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface SmtpCredentials {
  provider: 'SMTP';
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

export interface WebhookCredentials {
  provider: 'WEBHOOK';
  secret: string;
}

export type ProviderCredentials = ResendCredentials | SesCredentials | SmtpCredentials | WebhookCredentials;
