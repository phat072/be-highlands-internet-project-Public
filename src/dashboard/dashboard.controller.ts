import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get('summary') summary() { return this.dashboard.summary(); }
  @Get('by-status') byStatus() { return this.dashboard.byStatus(); }
  @Get('by-province') byProvince() { return this.dashboard.byProvince(); }
  @Get('progress') progress() { return this.dashboard.progress(); }
  @Get('attention') attention() { return this.dashboard.attention(); }
}
