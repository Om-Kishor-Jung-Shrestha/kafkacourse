import { BadRequestException, Body, Controller, ForbiddenException, Delete, Get, NotFoundException, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateCourseDto, ListCoursesQueryDto, RejectCourseDto } from './dto/course.request.dto';
import { CreateCourseHandler } from './commands/create-course.handler';
import { SubmitCourseHandler } from './commands/submit-course.handler';
import { ApproveRejectCourseHandler } from './commands/approve-reject-course.handler';
import { GetCourseCatalogHandler } from './queries/get-course-catalog.handler';
import { GetCourseDetailHandler } from './queries/get-course-detail.handler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

@Controller('api')
export class CourseController {
  constructor(
    private createHandler: CreateCourseHandler,
    private submitHandler: SubmitCourseHandler,
    private approveRejectHandler: ApproveRejectCourseHandler,
    private catalogHandler: GetCourseCatalogHandler,
    private detailHandler: GetCourseDetailHandler,
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @Get('courses')
  list(@Query() query: ListCoursesQueryDto) {
    return this.catalogHandler.execute({ page: query.page ?? 1, limit: query.limit ?? 20, category: query.category, q: query.q });
  }

  @Get('courses/:slug')
  detail(@Param('slug') slug: string) {
    return this.detailHandler.execute(slug);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CREATOR', 'ADMIN')
  @Get('courses/mine/list')
  myCourses(@CurrentUser() user: any) {
    return this.prisma.course.findMany({
      where: { creatorId: user.id },
      include: {
        _count: { select: { enrollments: true, reviews: true } },
        sections: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CREATOR', 'ADMIN')
  @Patch('courses/:id')
  async update(@Param('id') id: string, @CurrentUser() user: any, @Body() body: any) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.creatorId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('Not your course');
    return this.updateAndEmit(id, {
      title: body.title,
      description: body.description,
      priceCents: body.priceCents,
      level: body.level,
      category: body.category,
      tags: body.tags,
      thumbnailUrl: body.thumbnailUrl,
      subtitle: body.subtitle === undefined ? undefined : String(body.subtitle).trim().slice(0, 200) || null,
      learningOutcomes: Array.isArray(body.learningOutcomes) ? body.learningOutcomes.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 12) : undefined,
      requirements: Array.isArray(body.requirements) ? body.requirements.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 12) : undefined,
    }, 'CourseUpdatedEvent', 'course.updated');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CREATOR', 'ADMIN')
  @Patch('courses/:id/archive')
  async archive(@Param('id') id: string, @CurrentUser() user: any) {
    await this.assertCanEdit(id, user);
    return this.updateAndEmit(id, { status: 'ARCHIVED' }, 'CourseArchivedEvent', 'course.archived');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CREATOR', 'ADMIN')
  @Post('courses/:id/thumbnail')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })) // 10MB, §14.5 COURSE_THUMBNAIL limit
  async uploadThumbnail(@Param('id') id: string, @CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.creatorId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('Not your course');
    if (!file) throw new BadRequestException('No file uploaded');
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, or WEBP images are allowed for thumbnails');
    }
    const result = await this.storage.upload(file.buffer, file.originalname, 'course-thumbnails');
    return this.updateAndEmit(id, { thumbnailUrl: result.url, thumbnailStorage: result.storage }, 'CourseUpdatedEvent', 'course.updated');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CREATOR', 'ADMIN')
  @Post('courses')
  create(@CurrentUser() user: any, @Body() dto: CreateCourseDto) {
    return this.createHandler.execute(user.id, dto);
  }

  // ── Curriculum editing — every route verifies the caller owns the course
  // (or is an admin); previously any logged-in user could edit any course.
  @UseGuards(JwtAuthGuard)
  @Post('courses/:id/sections')
  async addSection(@Param('id') id: string, @CurrentUser() user: any, @Body() body: { title: string; order?: number }) {
    await this.assertCanEdit(id, user);
    const title = (body.title ?? '').trim();
    if (!title) throw new BadRequestException('Section title is required');
    const order = body.order ?? (await this.prisma.courseSection.count({ where: { courseId: id } })) + 1;
    const last = await this.prisma.courseSection.findFirst({ where: { courseId: id }, orderBy: { order: 'desc' } });
    return this.prisma.courseSection.create({
      data: { courseId: id, title, order: Math.max(order, (last?.order ?? 0) + 1) },
      include: { lessons: true },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('courses/:id/sections/:sid')
  async updateSection(@Param('id') id: string, @Param('sid') sid: string, @CurrentUser() user: any, @Body() body: { title?: string }) {
    await this.assertCanEdit(id, user);
    await this.assertSectionInCourse(sid, id);
    const title = body.title?.trim();
    if (!title) throw new BadRequestException('Section title is required');
    return this.prisma.courseSection.update({ where: { id: sid }, data: { title } });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('courses/:id/sections/:sid')
  async deleteSection(@Param('id') id: string, @Param('sid') sid: string, @CurrentUser() user: any) {
    await this.assertCanEdit(id, user);
    await this.assertSectionInCourse(sid, id);
    await this.prisma.courseSection.delete({ where: { id: sid } });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('courses/:id/sections/:sid/lessons')
  async addLesson(
    @Param('id') id: string,
    @Param('sid') sid: string,
    @CurrentUser() user: any,
    @Body() body: { title: string; content?: string; videoUrl?: string; durationSeconds?: number; order?: number },
  ) {
    await this.assertCanEdit(id, user);
    await this.assertSectionInCourse(sid, id);
    const title = (body.title ?? '').trim();
    if (!title) throw new BadRequestException('Lesson title is required');
    const last = await this.prisma.courseLesson.findFirst({ where: { sectionId: sid }, orderBy: { order: 'desc' } });
    return this.prisma.courseLesson.create({
      data: {
        sectionId: sid,
        title,
        content: body.content,
        videoUrl: body.videoUrl?.trim() || null,
        durationSeconds: Math.max(0, Number(body.durationSeconds) || 0),
        order: Math.max(body.order ?? 0, (last?.order ?? 0) + 1),
        isPublished: true,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('courses/:id/sections/:sid/lessons/:lid')
  async updateLesson(
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Param('lid') lid: string,
    @CurrentUser() user: any,
    @Body() body: { title?: string; content?: string; videoUrl?: string; durationSeconds?: number; isPublished?: boolean },
  ) {
    await this.assertCanEdit(id, user);
    await this.assertSectionInCourse(sid, id);
    const lesson = await this.prisma.courseLesson.findFirst({ where: { id: lid, sectionId: sid } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return this.prisma.courseLesson.update({
      where: { id: lid },
      data: {
        title: body.title?.trim() || undefined,
        content: body.content,
        videoUrl: body.videoUrl === undefined ? undefined : body.videoUrl.trim() || null,
        durationSeconds: body.durationSeconds === undefined ? undefined : Math.max(0, Number(body.durationSeconds) || 0),
        isPublished: body.isPublished,
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('courses/:id/sections/:sid/lessons/:lid')
  async deleteLesson(@Param('id') id: string, @Param('sid') sid: string, @Param('lid') lid: string, @CurrentUser() user: any) {
    await this.assertCanEdit(id, user);
    await this.assertSectionInCourse(sid, id);
    const lesson = await this.prisma.courseLesson.findFirst({ where: { id: lid, sectionId: sid } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.prisma.userLessonProgress.deleteMany({ where: { lessonId: lid } });
    await this.prisma.courseLesson.delete({ where: { id: lid } });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('courses/:id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.submitHandler.execute(id, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/courses/:id/approve')
  approve(@Param('id') id: string) {
    return this.approveRejectHandler.approve(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/courses/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectCourseDto) {
    return this.approveRejectHandler.reject(id, dto.reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/courses/pending')
  pending() {
    return this.prisma.course.findMany({ where: { status: 'PENDING_REVIEW' }, include: {
        creator: { select: { email: true, firstName: true, lastName: true } },
        sections: { orderBy: { order: 'asc' }, include: { lessons: { select: { id: true, title: true, durationSeconds: true, videoUrl: true } } } },
      },
      orderBy: { updatedAt: 'asc' },
    });
  }

  /** Write model + outbox event in ONE transaction (RULE-02) so the catalog projector refreshes the read model. */
  private updateAndEmit(id: string, data: Record<string, any>, eventType: string, topic: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({ where: { id }, data });
      await tx.outboxEvent.create({
        data: { aggregateType: 'Course', aggregateId: id, eventType, payload: { courseId: id }, topic, component: 'durable' },
      });
      return updated;
    });
  }

  private async assertCanEdit(courseId: string, user: any) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    const isStaff = user.role === 'ADMIN' || user.role === 'SUPERADMIN';
    if (course.creatorId !== user.id && !isStaff) throw new ForbiddenException('Not your course');
    return course;
  }

  private async assertSectionInCourse(sectionId: string, courseId: string) {
    const section = await this.prisma.courseSection.findFirst({ where: { id: sectionId, courseId } });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }
}
