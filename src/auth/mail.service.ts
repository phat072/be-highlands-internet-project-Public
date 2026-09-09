import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  private getTransporter() {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) {
      throw new ServiceUnavailableException('Chức năng gửi OTP chưa được cấu hình');
    }

    this.transporter ??= nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
      auth: { user, pass },
    });
    return this.transporter;
  }

  async sendPasswordResetOtp(recipient: string, name: string, otp: string) {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    try {
      await this.getTransporter().sendMail({
        from: `Highlands Project Control <${from}>`,
        to: recipient,
        subject: 'Mã OTP đổi mật khẩu Highlands Project Control',
        text: `Xin chào ${name}, mã OTP đổi mật khẩu của bạn là ${otp}. Mã có hiệu lực trong 10 phút. Không cung cấp mã này cho người khác.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17202d"><h2 style="color:#ee0033">Highlands Project Control</h2><p>Xin chào ${this.escapeHtml(name)},</p><p>Mã OTP để đổi mật khẩu của bạn là:</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:18px;background:#f6f7f9;border-radius:10px;text-align:center">${otp}</div><p>Mã có hiệu lực trong <strong>10 phút</strong>. Không cung cấp mã này cho bất kỳ ai.</p><p>Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.</p></div>`,
      });
    } catch (error) {
      this.logger.error('Không thể gửi email OTP', error instanceof Error ? error.stack : undefined);
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Không thể gửi OTP lúc này, vui lòng thử lại sau');
    }
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
  }
}
