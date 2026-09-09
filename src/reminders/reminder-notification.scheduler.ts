import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ReminderPriority } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';
import { RemindersService, SystemReminder } from './reminders.service';

@Injectable()
export class ReminderNotificationScheduler {
  private readonly logger = new Logger(ReminderNotificationScheduler.name);
  private running = false;
  constructor(private readonly reminders: RemindersService, private readonly telegram: TelegramService, private readonly config: ConfigService) {}

  @Cron('0 0 8-17 * * 1-5', { timeZone: 'Asia/Ho_Chi_Minh' })
  async sendHourlyReminder() { await this.send('CẬP NHẬT THEO GIỜ'); }

  @Cron('0 30 17 * * 1-5', { timeZone: 'Asia/Ho_Chi_Minh' })
  async sendEndOfDayReminder() { await this.send('TỔNG KẾT 17:30'); }

  private async send(scheduleName: string) {
    if (this.running) { this.logger.warn('Skipped overlapping Telegram reminder job'); return; }
    this.running = true;
    try {
      const alerts = await this.reminders.listAutomatic();
      const sent = await this.telegram.sendMessage(this.composeMessage(scheduleName, alerts));
      if (sent) this.logger.log(`Telegram reminder sent: ${alerts.length} alert(s)`);
    } catch (error) {
      this.logger.error('Failed to send scheduled Telegram reminder', error instanceof Error ? error.stack : String(error));
    } finally { this.running = false; }
  }

  private composeMessage(scheduleName: string, alerts: SystemReminder[]) {
    const timestamp = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    if (!alerts.length) return `✅ <b>HIGHLANDS — ${scheduleName}</b>\n${timestamp}\nKhông có site nào thuộc 2 điều kiện cần cảnh báo.`;
    const urgent = alerts.filter(item => item.priority === ReminderPriority.URGENT).length;
    const signal = alerts.filter(item => item.rule === 'SIGNAL_HANDOVER').length;
    const possession = alerts.filter(item => item.rule === 'SITE_POSSESSION').length;
    const baseUrl = (this.config.get<string>('FRONTEND_URL') ?? 'https://highlands.viettelhub.com.vn').replace(/\/$/, '');
    const lines = alerts.map((item, index) => {
      const icon = item.priority === ReminderPriority.URGENT ? '🚨' : '⚠️';
      const siteUrl = `${baseUrl}/sites/${item.site.id}`;
      return `${index + 1}. ${icon} <a href="${this.escapeHtml(siteUrl)}"><b>${this.escapeHtml(item.site.storeName)}</b></a> — ${this.escapeHtml(item.site.province)}\n${this.escapeHtml(item.description)}`;
    });
    return [`📌 <b>HIGHLANDS — ${scheduleName}</b>`, timestamp, `Tổng: <b>${alerts.length}</b> | Khẩn cấp: <b>${urgent}</b> | Tín hiệu: ${signal} | Mặt bằng: ${possession}`, '', ...lines].join('\n');
  }

  private escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
}
