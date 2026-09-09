import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HighlandsStatus, ReminderPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { RemindersService, SystemReminder } from './reminders.service';

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};
type TelegramMessage = { text?: string; caption?: string; chat?: { id?: number } };

@Injectable()
export class TelegramCommandService {
  private readonly logger = new Logger(TelegramCommandService.name);
  private readonly processed = new Set<number>();
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService, private readonly reminders: RemindersService, private readonly telegram: TelegramService) {}

  async handle(update: TelegramUpdate, suppliedSecret?: string) {
    const expectedSecret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET')?.trim();
    if (!expectedSecret || suppliedSecret !== expectedSecret) throw new UnauthorizedException();
    if (update.update_id !== undefined && this.processed.has(update.update_id)) return;
    const [updateType, message] = this.messageFrom(update);
    const chatId = message?.chat?.id;
    const text = (message?.text ?? message?.caption)?.trim();
    this.logger.log(`Telegram update: type=${updateType}, chat=${chatId ?? 'none'}, text=${text ? 'yes' : 'no'}`);
    if (!chatId || !text) return;
    if (!this.allowedChatIds.includes(String(chatId))) {
      this.logger.warn(`Ignored Telegram update from unauthorized chat ${chatId}`);
      return;
    }
    if (update.update_id !== undefined) this.remember(update.update_id);
    await this.telegram.sendMessage(await this.reply(text), chatId);
  }

  private async reply(input: string) {
    const text = this.normalize(input.replace(/@\w+/g, ''));
    if (/^\/(start|help)\b/.test(text) || /^(help|tro giup|huong dan)$/.test(text)) return this.help();
    if (/^\/khan\b/.test(text) || text.includes('khan cap') || text.includes('qua han')) return this.alerts(true);
    if (/^\/nhac\b/.test(text) || text.includes('nhac hen') || text.includes('can xu ly') || text.includes('viec can lam')) return this.alerts(false);
    if (/^\/tongquan\b/.test(text) || text.includes('tong quan') || text.includes('tinh hinh') || text.includes('bao nhieu site')) return this.summary();
    const keyword = this.searchKeyword(input);
    if (keyword !== null) return this.searchSites(keyword);
    if (/^(xin chao|chao|hello|hi|alo)\b/.test(text)) return `Chào bạn 👋\n${this.help()}`;
    return `Mình chưa hiểu yêu cầu này. Bạn có thể hỏi “có gì cần xử lý?”, “tình hình dự án” hoặc dùng các lệnh sau:\n\n${this.help()}`;
  }

  private async alerts(urgentOnly: boolean) {
    const alerts = (await this.reminders.listAutomatic()).filter(item => !urgentOnly || item.priority === ReminderPriority.URGENT);
    if (!alerts.length) return urgentOnly ? '✅ Hiện không có cảnh báo khẩn cấp.' : '✅ Hiện không có site thuộc 2 điều kiện cần nhắc.';
    const title = urgentOnly ? '🚨 <b>CẢNH BÁO KHẨN CẤP</b>' : '📌 <b>NHẮC HẸN TRIỂN KHAI</b>';
    return [title, `Tổng cộng: <b>${alerts.length}</b>`, '', ...alerts.map((item, index) => this.formatAlert(item, index))].join('\n');
  }

  private async summary() {
    const active = { deletedAt: null } as const;
    const [total, done, progressing, pending, cancelled, online, alerts] = await Promise.all([
      this.prisma.site.count({ where: active }),
      this.prisma.site.count({ where: { ...active, highlandsStatus: HighlandsStatus.DONE } }),
      this.prisma.site.count({ where: { ...active, highlandsStatus: HighlandsStatus.ON_PROGRESS } }),
      this.prisma.site.count({ where: { ...active, highlandsStatus: HighlandsStatus.PENDING } }),
      this.prisma.site.count({ where: { ...active, highlandsStatus: HighlandsStatus.CANCELLED } }),
      this.prisma.site.count({ where: { ...active, onlineDateTime: { not: null } } }),
      this.reminders.listAutomatic(),
    ]);
    const urgent = alerts.filter(item => item.priority === ReminderPriority.URGENT).length;
    return ['📊 <b>TỔNG QUAN DỰ ÁN HIGHLANDS</b>', `Tổng site: <b>${total}</b>`, `Done: <b>${done}</b>`, `On-progress: <b>${progressing}</b>`, `Pending: <b>${pending}</b>`, `Cancelled: <b>${cancelled}</b>`, `Đã Online: <b>${online}</b>`, `Cần nhắc: <b>${alerts.length}</b> (${urgent} khẩn cấp)`].join('\n');
  }

  private async searchSites(keyword: string) {
    if (!keyword) return 'Bạn nhập thêm tên site, tỉnh hoặc địa chỉ. Ví dụ: <code>/site Hà Nội</code>.';
    const sites = await this.prisma.site.findMany({
      where: { deletedAt: null, OR: [{ storeName: { contains: keyword } }, { province: { contains: keyword } }, { address: { contains: keyword } }, { taxCode: { contains: keyword } }] },
      select: { id: true, storeName: true, province: true, highlandsStatus: true, onlineDateTime: true }, orderBy: { updatedAt: 'desc' }, take: 10,
    });
    if (!sites.length) return `Không tìm thấy site phù hợp với “${this.escapeHtml(keyword)}”.`;
    const baseUrl = this.frontendUrl;
    return [`🔎 <b>KẾT QUẢ TÌM SITE</b> (${sites.length})`, '', ...sites.map((site, index) => `${index + 1}. <a href="${baseUrl}/sites/${site.id}"><b>${this.escapeHtml(site.storeName)}</b></a>\n${this.escapeHtml(site.province)} · ${this.statusLabel(site.highlandsStatus)} · ${site.onlineDateTime ? 'Đã Online' : 'Chưa Online'}`)].join('\n');
  }

  private searchKeyword(input: string) {
    const command = input.match(/^\/site(?:@\w+)?(?:\s+(.*))?$/i);
    if (command) return command[1]?.trim() ?? '';
    const natural = input.match(/^(?:tìm|tim)\s+(?:site|cửa hàng|cua hang)\s*(.*)$/i);
    return natural ? natural[1].trim() : null;
  }

  private formatAlert(item: SystemReminder, index: number) {
    const icon = item.priority === ReminderPriority.URGENT ? '🚨' : '⚠️';
    return `${index + 1}. ${icon} <a href="${this.frontendUrl}/sites/${item.site.id}"><b>${this.escapeHtml(item.site.storeName)}</b></a> — ${this.escapeHtml(item.site.province)}\n${this.escapeHtml(item.description)}`;
  }

  private help() { return ['🤖 <b>HLVT Assistant</b>', '<code>/nhac</code> — Các site cần xử lý', '<code>/khan</code> — Các cảnh báo khẩn cấp', '<code>/tongquan</code> — Tổng quan dự án', '<code>/site từ khóa</code> — Tìm site', '<code>/help</code> — Xem hướng dẫn'].join('\n'); }
  private remember(id: number) { this.processed.add(id); if (this.processed.size > 200) this.processed.delete(this.processed.values().next().value!); }
  private messageFrom(update: TelegramUpdate): [string, TelegramMessage | undefined] {
    if (update.message) return ['message', update.message];
    if (update.edited_message) return ['edited_message', update.edited_message];
    if (update.channel_post) return ['channel_post', update.channel_post];
    if (update.edited_channel_post) return ['edited_channel_post', update.edited_channel_post];
    return ['unsupported', undefined];
  }
  private normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim(); }
  private statusLabel(status: HighlandsStatus) { return { DONE: 'Done', ON_PROGRESS: 'On-progress', PENDING: 'Pending', CANCELLED: 'Cancelled' }[status]; }
  private escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  private get frontendUrl() { return (this.config.get<string>('FRONTEND_URL') ?? 'https://highlands.viettelhub.com.vn').replace(/\/$/, ''); }
  private get allowedChatIds() {
    const configured = this.config.get<string>('TELEGRAM_CHAT_IDS')?.trim()
      || this.config.get<string>('TELEGRAM_CHAT_ID')?.trim()
      || '';
    return configured.split(',').map(value => value.trim()).filter(Boolean);
  }
}
