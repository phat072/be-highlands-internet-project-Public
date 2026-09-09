import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ReminderNotificationScheduler } from './reminder-notification.scheduler';
import { TelegramCommandService } from './telegram-command.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
@Module({ imports: [TelegramModule], controllers: [RemindersController, TelegramWebhookController], providers: [RemindersService, ReminderNotificationScheduler, TelegramCommandService], exports: [RemindersService] })
export class RemindersModule {}
