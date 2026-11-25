import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

@Injectable()
export class AlertMailer {
  private readonly transport;
  private readonly from?: string;
  constructor(config: ConfigService) {
    this.from = config.get<string>('ALERT_EMAIL_FROM');
    const url = config.get<string>('SMTP_URL');
    if (url && this.from && config.get<boolean>('ALERT_EMAIL_WORKER_ENABLED') === true)
      this.transport = createTransport({
        url,
        requireTLS: config.get<string>('NODE_ENV') === 'production',
        connectionTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
  }
  get enabled() {
    return Boolean(this.transport);
  }
  async send(recipient: string, subject: string, text: string) {
    if (!this.transport) throw new Error('SMTP indisponível');
    const info = await this.transport.sendMail({ from: this.from, to: recipient, subject, text });
    return info.accepted.includes(recipient);
  }
}
