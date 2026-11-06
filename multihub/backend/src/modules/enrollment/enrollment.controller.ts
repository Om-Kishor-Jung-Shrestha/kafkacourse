import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { CreateEnrollmentHandler } from './commands/create-enrollment.handler';
import { UpdateProgressHandler } from './commands/update-progress.handler';
import { LessonProgressHandler } from './commands/lesson-progress.handler';
import { CompleteLessonDto } from './dto/enrollment.request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/enrollments')
export class EnrollmentController {
  constructor(
    private createHandler: CreateEnrollmentHandler,
    private progressHandler: UpdateProgressHandler,
    private lessonProgress: LessonProgressHandler,
    private certificates: CertificateService,
  ) {}

  @Post(':courseId/enroll')
  enroll(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    return this.createHandler.execute(user.id, courseId);
  }

  @Get('me')
  myEnrollments(@CurrentUser() user: any) {
    return this.lessonProgress.myEnrollments(user.id);
  }

  // Course player data: full lesson content + which lessons are done.
  @Get(':id/learn')
  learn(@Param('id') id: string, @CurrentUser() user: any) {
    return this.lessonProgress.learn(id, user.id);
  }

  @Get(':id/certificate')
  certificate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.certificates.forEnrollment(id, user.id);
  }

  @Post(':id/lessons/:lessonId/complete')
  completeLesson(
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.lessonProgress.setCompleted(id, lessonId, user.id, dto.completed ?? true);
  }

  @Patch(':id/progress')
  updateProgress(@Param('id') id: string, @CurrentUser() user: any, @Body() body: { progressPercent: number }) {
    return this.progressHandler.execute(id, user.id, body.progressPercent);
  }
}

@Controller('api/certificates')
export class CertificateController {
  constructor(private certificates: CertificateService) {}

  @Get(':code')
  verify(@Param('code') code: string) {
    return this.certificates.verify(code);
  }
}
