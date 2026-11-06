import { PrismaClient, UserRole, CourseStatus, CourseLevel } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// RULE-18: exact seed emails.
const SEED_USERS = [
  { email: 'omshrestha40@gmail.com', role: UserRole.SUPERADMIN, firstName: 'Om', lastName: 'Shrestha' },
  { email: 'luciferdrose124@gmail.com', role: UserRole.ADMIN, firstName: 'Admin', lastName: 'User' },
  { email: 'omkishor.28471@student.trinity.edu.np', role: UserRole.CREATOR, firstName: 'Om', lastName: 'Kishor' },
  { email: 'creator2@multihub.dev', role: UserRole.CREATOR, firstName: 'Jane', lastName: 'Creator' },
  { email: 'user1@multihub.dev', role: UserRole.USER, firstName: 'Alice', lastName: 'User' },
  { email: 'user2@multihub.dev', role: UserRole.USER, firstName: 'Bob', lastName: 'Learner' },
];

const SAMPLE_COURSES = [
  { title: 'React for Beginners', category: 'programming', level: CourseLevel.BEGINNER, tags: ['react', 'javascript'], priceCents: 4999 },
  { title: 'Advanced TypeScript Patterns', category: 'programming', level: CourseLevel.ADVANCED, tags: ['typescript', 'system-design'], priceCents: 7999 },
  { title: 'Intro to Data Science with Python', category: 'data-science', level: CourseLevel.BEGINNER, tags: ['python', 'pandas', 'statistics'], priceCents: 5999 },
  { title: 'UX Design Fundamentals', category: 'design', level: CourseLevel.BEGINNER, tags: ['ux-design', 'figma'], priceCents: 3999 },
  { title: 'Kubernetes for Developers', category: 'programming', level: CourseLevel.INTERMEDIATE, tags: ['kubernetes', 'docker', 'devops'], priceCents: 8999 },
  { title: 'Guitar Basics', category: 'music', level: CourseLevel.BEGINNER, tags: ['guitar'], priceCents: 0 },
];

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function main() {
  const password = await bcrypt.hash('Password123!', 12);

  await prisma.storageConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', strategy: 'local', commissionPercent: 30 },
  });

  const users: Record<string, any> = {};
  for (const u of SEED_USERS) {
    users[u.email] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, password, firstName: u.firstName, lastName: u.lastName, role: u.role, isEmailVerified: true, status: 'ACTIVE' },
    });
  }

  const creator = users['omkishor.28471@student.trinity.edu.np'];

  // Demo coupons so discounts can be tried straight away (cart -> "Apply").
  await prisma.coupon.upsert({ where: { code: 'WELCOME20' }, update: {}, create: { code: 'WELCOME20', percentOff: 20, creatorId: null } });
  await prisma.coupon.upsert({ where: { code: 'CREATOR50' }, update: {}, create: { code: 'CREATOR50', percentOff: 50, creatorId: creator.id } });
  await prisma.coupon.upsert({ where: { code: 'FREEBIE100' }, update: {}, create: { code: 'FREEBIE100', percentOff: 100, creatorId: null, maxUses: 25 } });

  for (const c of SAMPLE_COURSES) {
    const slug = slugify(c.title);
    const course = await prisma.course.upsert({
      where: { slug },
      // Only fill the landing-page fields on rows seeded before they existed (never clobbers a creator's edits).
      update: {},
      create: {
        creatorId: creator.id,
        title: c.title,
        slug,
        subtitle: `A practical, step-by-step introduction to ${c.title}.`,
        learningOutcomes: [
          `Understand the core concepts of ${c.title}`,
          'Apply what you learn in hands-on lessons',
          'Avoid the most common beginner mistakes',
          'Know what to learn next',
        ],
        requirements: ['No prior experience needed', 'A computer with an internet connection'],
        description: `Learn everything about ${c.title} in this comprehensive course.`,
        priceCents: c.priceCents,
        level: c.level,
        category: c.category,
        tags: c.tags,
        language: 'en',
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await prisma.course.updateMany({
      where: { id: course.id, subtitle: null },
      data: {
        subtitle: `A practical, step-by-step introduction to ${c.title}.`,
        learningOutcomes: [`Understand the core concepts of ${c.title}`, 'Apply what you learn in hands-on lessons', 'Avoid the most common beginner mistakes', 'Know what to learn next'],
        requirements: ['No prior experience needed', 'A computer with an internet connection'],
      },
    });

    // Demo content: two sections; every lesson but one reading lesson has a sample video so the
    // course player is usable out of the box. Upserts => re-running the seed also refreshes old rows.
    const BASE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';
    const outline = [
      { title: 'Getting Started', lessons: [
        { title: 'Introduction', seconds: 300, videoUrl: `${BASE}/ForBiggerBlazes.mp4`, content: 'Welcome! In this lesson we outline what you will build and learn.' },
        { title: 'Core Concepts', seconds: 600, videoUrl: `${BASE}/ForBiggerJoyrides.mp4`, content: 'Key terminology used throughout the course.' },
      ] },
      { title: 'Going Further', lessons: [
        { title: 'Putting It Together', seconds: 900, videoUrl: `${BASE}/ForBiggerEscapes.mp4`, content: null },
        { title: 'Next Steps (reading)', seconds: 240, videoUrl: null, content: 'Recommended reading and ideas for continuing your learning journey.' },
      ] },
    ];
    for (let si = 0; si < outline.length; si++) {
      const section = await prisma.courseSection.upsert({
        where: { courseId_order: { courseId: course.id, order: si + 1 } },
        update: { title: outline[si].title },
        create: { courseId: course.id, title: outline[si].title, order: si + 1 },
      });
      for (let li = 0; li < outline[si].lessons.length; li++) {
        const l = outline[si].lessons[li];
        const existing = await prisma.courseLesson.findFirst({ where: { sectionId: section.id, order: li + 1 } });
        const data = { title: l.title, videoUrl: l.videoUrl, content: l.content, durationSeconds: l.seconds };
        if (existing) await prisma.courseLesson.update({ where: { id: existing.id }, data });
        else await prisma.courseLesson.create({ data: { ...data, sectionId: section.id, order: li + 1, isPublished: true } });
      }
    }

    // Project to read model directly (seed bypasses the outbox/projector pipeline for speed)
    await prisma.rmCourseCatalog.upsert({
      where: { id: course.id },
      update: {},
      create: {
        id: course.id,
        creatorId: creator.id,
        creatorName: `${creator.firstName} ${creator.lastName}`,
        title: course.title,
        slug: course.slug,
        description: course.description,
        priceCents: course.priceCents,
        level: course.level,
        category: course.category,
        tags: course.tags,
        language: course.language,
        status: course.status,
        publishedAt: course.publishedAt,
      },
    });
  }

  console.log('Seed complete. Login with any seeded email + password "Password123!"');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
