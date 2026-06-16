import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { BookingStatus } from '../constants/booking'
import { ErrorCodes } from '../constants/errorCodes'
import { UserRole } from '../constants/user'
import { AppError } from '../utils/AppError'
import { logger } from '../utils/logger'
import type { z } from 'zod'
import type { courseCreateSchema, courseQuerySchema } from '../models/Course'
import type { CourseWithProgressDto, ScheduleSlotProgress } from '../types/domain'

function isAutoConfirmEnabled(minCapacity: number, maxCapacity: number): boolean {
  return minCapacity >= 1 && minCapacity <= maxCapacity
}

function computeSlotProgress(
  schedule: string[],
  bookings: any[],
  minCapacity: number,
  maxCapacity: number
): ScheduleSlotProgress[] | null {
  if (!isAutoConfirmEnabled(minCapacity, maxCapacity)) return null
  return schedule.map(slot => {
    const slotBookings = bookings.filter((b: any) => {
      const t1 = new Date(b.scheduleTime).getTime()
      const t2 = new Date(slot).getTime()
      return t1 === t2
    })
    const activeBookings = slotBookings.filter((b: any) =>
      [BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(b.status)
    )
    const bookedCount = activeBookings.length
    const confirmedCount = slotBookings.filter((b: any) => b.status === BookingStatus.CONFIRMED).length
    const pendingCount = slotBookings.filter((b: any) => b.status === BookingStatus.PENDING).length
    const remainingToConfirm = Math.max(0, minCapacity - bookedCount)
    return {
      scheduleTime: slot,
      bookedCount,
      confirmedCount,
      pendingCount,
      minCapacity,
      maxCapacity,
      remainingToConfirm,
      isConfirmed: bookedCount >= minCapacity,
      isFull: bookedCount >= maxCapacity
    }
  })
}

function normalizeCourse(course: any, withProgress = false) {
  const minCapacity = course.minCapacity ?? 1
  const maxCapacity = course.maxCapacity ?? 1
  const bookings = course.bookings || []
  const schedule = Array.isArray(course.schedule) ? course.schedule : []
  const slotProgress = withProgress ? computeSlotProgress(schedule, bookings, minCapacity, maxCapacity) : undefined
  const result: any = {
    id: course.id,
    coachId: course.coachId,
    title: course.title,
    description: course.description,
    duration: course.duration,
    price: Number(course.price),
    minCapacity,
    maxCapacity,
    schedule,
    status: course.status,
    createdAt: course.createdAt,
    coach: course.coach
      ? {
          id: course.coach.id,
          phone: course.coach.phone,
          nickname: course.coach.nickname,
          avatar: course.coach.avatar,
          role: course.coach.role
        }
      : undefined
  }
  if (slotProgress) {
    result.slotProgress = slotProgress
  }
  return result
}

function normalizeCourseWithProgress(course: any): CourseWithProgressDto {
  const normalized = normalizeCourse(course, true)
  const bookings = course.bookings || []
  const activeBookings = bookings.filter((b: any) =>
    [BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(b.status)
  )
  return {
    ...normalized,
    totalBookings: activeBookings.length,
    totalConfirmed: bookings.filter((b: any) => b.status === BookingStatus.CONFIRMED).length,
    totalPending: bookings.filter((b: any) => b.status === BookingStatus.PENDING).length,
    slotProgress: normalized.slotProgress ?? []
  }
}

export const courseService = {
  async list(query: z.infer<typeof courseQuerySchema>) {
    logger.info('COURSE_LIST', { keyword: query.keyword || '', coachId: query.coachId || '' })
    const where: any = {
      status: 'published',
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword } },
              { description: { contains: query.keyword } },
              { coach: { nickname: { contains: query.keyword } } }
            ]
          }
        : {}),
      ...(query.coachId ? { coachId: query.coachId } : {})
    }
    const courses = await prisma.course.findMany({
      where,
      include: {
        coach: true,
        bookings: {
          where: {
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return courses.map((c: any) => normalizeCourse(c, true))
  },

  async detail(id: number) {
    logger.info('COURSE_DETAIL', { id, role: UserRole.STUDENT })
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        coach: true,
        bookings: {
          where: {
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] }
          }
        }
      }
    })
    if (!course) {
      throw new AppError(`Course[id=${id}] detail failed: id not found role=${UserRole.STUDENT}`, 404, ErrorCodes.COURSE_NOT_FOUND, 'Course', 'id', UserRole.STUDENT)
    }
    return normalizeCourse(course, true)
  },

  async create(coachId: number, role: string, payload: z.infer<typeof courseCreateSchema>) {
    logger.info('COURSE_CREATE_START', { title: payload.title })
    if (role !== UserRole.COACH && role !== UserRole.ADMIN) {
      throw new AppError(`Course[coach_id=${coachId}] create failed: role not ${UserRole.COACH}`, 403, ErrorCodes.COURSE_COACH_REQUIRED, 'Course', 'coach_id', role)
    }
    try {
      const course = await prisma.course.create({
        data: {
          coachId,
          title: payload.title,
          description: payload.description,
          duration: payload.duration,
          price: payload.price,
          minCapacity: payload.minCapacity ?? 1,
          maxCapacity: payload.maxCapacity,
          schedule: payload.schedule,
          status: payload.status
        },
        include: { coach: true }
      })
      logger.info('COURSE_CREATE_SUCCESS', { id: course.id, schedule: payload.schedule.join(',') })
      return normalizeCourse(course)
    } catch {
      logger.error('COURSE_CREATE_FAILED', { coachId })
      throw new AppError(`Course[coach_id=${coachId}] create failed: schedule invalid role=${role}`, 400, ErrorCodes.COURSE_COACH_REQUIRED, 'Course', 'schedule', role)
    }
  },

  async recommended() {
    const courses = await this.list({})
    return courses.slice(0, 3).map((course: any, index: number) => ({ ...course, reason: index === 0 ? '最近可约' : '训练匹配' }))
  },

  async coachCoursesWithProgress(coachId: number, role: string) {
    logger.info('COURSE_COACH_PROGRESS', { coachId, role })
    if (role !== UserRole.COACH && role !== UserRole.ADMIN) {
      throw new AppError(`Course[coach_id=${coachId}] progress failed: role not ${UserRole.COACH}`, 403, ErrorCodes.COURSE_COACH_REQUIRED, 'Course', 'coach_id', role)
    }
    const where: any = role === UserRole.ADMIN ? {} : { coachId }
    const courses = await prisma.course.findMany({
      where,
      include: {
        coach: true,
        bookings: {
          include: { user: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return courses.map(normalizeCourseWithProgress)
  }
}

