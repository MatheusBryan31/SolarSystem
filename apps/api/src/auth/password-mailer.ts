import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

@Injectable()
export class PasswordMailer {
  private readonly remetente: string | undefined;
  private readonly transporte;

  constructor(config: ConfigService) {
    const url = config.get<string>('SMTP_URL');
    this.remetente = config.get<string>('PASSWORD_RESET_FROM');
    if (url && this.remetente) {
      this.transporte = createTransport({
        url,
        requireTLS: config.get<string>('NODE_ENV') === 'production',
        connectionTimeout: 10_000,
        socketTimeout: 15_000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    }
  }

  get habilitado() {
    return Boolean(this.transporte);
  }

  async enviar(email: string, link: string) {
    if (!this.transporte) throw new Error('SMTP indisponível');
    await this.transporte.sendMail({
      from: this.remetente,
      to: email,
      subject: 'Redefinição de senha do SolarSystem',
      text: `Para redefinir sua senha, acesse o link em até 15 minutos:\n${link}\n\nSe você não solicitou a redefinição, ignore este e-mail.`,
    });
  }
}
