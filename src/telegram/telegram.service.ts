import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TelegramResponse = { ok: boolean; description?: string };

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  constructor(private readonly config: ConfigService) {}

  isConfigured() { return Boolean(this.token && this.chatIds.length); }

  async sendMessage(message: string, chatId?: string | number) {
    if (!this.isConfigured()) {
      this.logger.warn('Telegram reminder skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_IDS');
      return false;
    }
    const targets = chatId === undefined ? this.chatIds : [String(chatId)];
    for (const target of targets) {
      for (const chunk of this.splitMessage(message)) await this.sendChunk(chunk, target);
    }
    return true;
  }

  private async sendChunk(message: string, chatId: string | number) {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json()) as TelegramResponse;
    if (!response.ok || !body.ok) throw new Error(`Telegram API error ${response.status}: ${body.description ?? 'Unknown error'}`);
  }

  private splitMessage(message: string) {
    const chunks: string[] = []; let current = '';
    for (const line of message.split('\n')) {
      if (`${current}\n${line}`.length > 3_800 && current) { chunks.push(current); current = line; }
      else current = current ? `${current}\n${line}` : line;
    }
    if (current) chunks.push(current);
    return chunks;
  }

  private get token() { return this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim(); }
  private get chatIds() {
    const configured = this.config.get<string>('TELEGRAM_CHAT_IDS')?.trim()
      || this.config.get<string>('TELEGRAM_CHAT_ID')?.trim()
      || '';
    return [...new Set(configured.split(',').map(value => value.trim()).filter(Boolean))];
  }
}
