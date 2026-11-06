import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CreateCourseHandler } from './commands/create-course.handler';
import { SubmitCourseHandler } from './commands/submit-course.handler';
import { ApproveRejectCourseHandler } from './commands/approve-reject-course.handler';
import { GetCourseCatalogHandler } from './queries/get-course-catalog.handler';
import { GetCourseDetailHandler } from './queries/get-course-detail.handler';

@Module({
  controllers: [CourseController],
  providers: [CreateCourseHandler, SubmitCourseHandler, ApproveRejectCourseHandler, GetCourseCatalogHandler, GetCourseDetailHandler],
})
export class CourseModule {}
