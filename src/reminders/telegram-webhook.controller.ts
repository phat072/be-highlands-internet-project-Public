import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { TelegramCommandService, TelegramUpdate } from './telegram-command.service';

@Public()
@Controller('telegram')
export class TelegramWebhookController {
  constructor(private readonly commands: TelegramCommandService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    await this.commands.handle(update, secret);
    return { ok: true };
  }
}
