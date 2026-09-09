import { Injectable, NotFoundException } from '@nestjs/common';
import { HighlandsStatus, InfrastructureStatus, IssueStatus, ReminderPriority, ReminderStatus, RoleName } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';

const DAY_MS = 86_400_000;
type AlertSite = { id:number;storeName:string;province:string;highlandsStatus:HighlandsStatus;sitePossessionDate:Date|null;viettelSignalHandoverDate:Date|null;onlineDateTime:Date|null;configurationCompletedAt:Date|null;infrastructureCompletedDate:Date|null;outdoorStatus:InfrastructureStatus;indoorStatus:InfrastructureStatus;issueStatus:IssueStatus;notes:Array<{createdAt:Date}> };
export type SystemReminder = { id:string;automated:true;rule:'SIGNAL_HANDOVER'|'SITE_POSSESSION';title:string;description:string;dueAt:Date;priority:ReminderPriority;status:'OPEN';site:{id:number;storeName:string;province:string};assignee:{name:string} };

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(user: AuthUser, status?: ReminderStatus) {
    const [manual, automatic] = await Promise.all([
      this.prisma.reminder.findMany({ where: { status, assigneeId: user.role === RoleName.STAFF ? user.id : undefined }, include: { site: { select: { id: true, storeName: true, province: true } }, assignee: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] }),
      status === ReminderStatus.DONE || status === ReminderStatus.CANCELLED ? Promise.resolve([] as SystemReminder[]) : this.listAutomatic(),
    ]);
    return [...automatic, ...manual];
  }

  async countOpen() {
    const [manual, automatic] = await Promise.all([this.prisma.reminder.count({ where: { status: ReminderStatus.OPEN } }), this.listAutomatic()]);
    return manual + automatic.length;
  }

  async listAutomatic() {
    const sites = await this.prisma.site.findMany({ where: { deletedAt: null, highlandsStatus: { notIn: [HighlandsStatus.DONE, HighlandsStatus.CANCELLED] }, OR: [{ sitePossessionDate: { not: null } }, { viettelSignalHandoverDate: { not: null } }] }, select: { id:true,storeName:true,province:true,highlandsStatus:true,sitePossessionDate:true,viettelSignalHandoverDate:true,onlineDateTime:true,configurationCompletedAt:true,infrastructureCompletedDate:true,outdoorStatus:true,indoorStatus:true,issueStatus:true,notes:{select:{createdAt:true},orderBy:{createdAt:'desc'},take:1} } });
    return this.buildSystemReminders(sites, new Date()).sort((a,b)=>this.priorityRank(b.priority)-this.priorityRank(a.priority)||a.dueAt.getTime()-b.dueAt.getTime());
  }

  buildSystemReminders(sites: AlertSite[], now: Date): SystemReminder[] {
    const today=this.vietnamCalendarDay(now);const alerts:SystemReminder[]=[];
    for(const site of sites){
      if(site.highlandsStatus===HighlandsStatus.DONE||site.highlandsStatus===HighlandsStatus.CANCELLED)continue;
      if(site.viettelSignalHandoverDate&&!site.onlineDateTime){
        const signalDay=this.dateFieldCalendarDay(site.viettelSignalHandoverDate);const warningDay=signalDay-2;
        if(today>=warningDay){const daysUntilSignal=signalDay-today;alerts.push({id:`system-signal-${site.id}`,automated:true,rule:'SIGNAL_HANDOVER',title:'Theo dõi bàn giao tín hiệu dự kiến',description:daysUntilSignal<0?`Đã quá ngày dự kiến ${Math.abs(daysUntilSignal)} ngày nhưng site chưa Online.`:daysUntilSignal===0?'Đến ngày bàn giao tín hiệu dự kiến nhưng site chưa Online.':`Còn ${daysUntilSignal} ngày tới lịch bàn giao tín hiệu dự kiến và site chưa Online.`,dueAt:this.calendarDayToDate(warningDay),priority:daysUntilSignal<0?ReminderPriority.URGENT:ReminderPriority.HIGH,status:ReminderStatus.OPEN,site:this.siteSummary(site),assignee:{name:'Hệ thống'}})}
        continue;
      }
      if(site.sitePossessionDate&&this.hasNoPostPossessionUpdate(site)){
        const possessionDay=this.dateFieldCalendarDay(site.sitePossessionDate);const warningDay=possessionDay+3;
        if(today>=warningDay)alerts.push({id:`system-possession-${site.id}`,automated:true,rule:'SITE_POSSESSION',title:'Chưa cập nhật sau bàn giao mặt bằng',description:`Đã ${today-possessionDay} ngày từ khi nhận mặt bằng nhưng chưa có cập nhật triển khai.`,dueAt:this.calendarDayToDate(warningDay),priority:ReminderPriority.HIGH,status:ReminderStatus.OPEN,site:this.siteSummary(site),assignee:{name:'Hệ thống'}});
      }
    }
    return alerts;
  }

  async create(dto: CreateReminderDto,user: AuthUser){const reminder=await this.prisma.reminder.create({data:{siteId:dto.siteId,title:dto.title.trim(),description:dto.description?.trim(),dueAt:new Date(dto.dueAt),priority:dto.priority,assigneeId:dto.assigneeId,createdById:user.id},include:{site:true,assignee:{select:{id:true,name:true}}}});await this.audit.write({userId:user.id},'CREATE_REMINDER','REMINDER',String(reminder.id));return reminder}
  async update(id:number,dto:UpdateReminderDto,user:AuthUser){const found=await this.prisma.reminder.findUnique({where:{id}});if(!found)throw new NotFoundException('Không tìm thấy nhắc hẹn');const reminder=await this.prisma.reminder.update({where:{id},data:{...dto,dueAt:dto.dueAt?new Date(dto.dueAt):undefined,completedAt:dto.status===ReminderStatus.DONE?new Date():dto.status===ReminderStatus.OPEN?null:undefined}});await this.audit.write({userId:user.id},'UPDATE_REMINDER','REMINDER',String(id));return reminder}

  private hasNoPostPossessionUpdate(site:AlertSite){return !site.viettelSignalHandoverDate&&!site.onlineDateTime&&!site.configurationCompletedAt&&!site.infrastructureCompletedDate&&site.outdoorStatus===InfrastructureStatus.NOT_STARTED&&site.indoorStatus===InfrastructureStatus.NOT_STARTED&&site.issueStatus===IssueStatus.NONE&&site.notes.length===0}
  private vietnamCalendarDay(date:Date){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const value=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find(part=>part.type===type)?.value);return Math.floor(Date.UTC(value('year'),value('month')-1,value('day'))/DAY_MS)}
  private dateFieldCalendarDay(date:Date){return Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())/DAY_MS)}
  private calendarDayToDate(day:number){return new Date(day*DAY_MS)}
  private siteSummary(site:AlertSite){return{id:site.id,storeName:site.storeName,province:site.province}}
  private priorityRank(priority:ReminderPriority){return{LOW:0,MEDIUM:1,HIGH:2,URGENT:3}[priority]}
}
