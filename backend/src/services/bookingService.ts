import { prisma } from '../config/database'
import { BookingStatus, BookingStatusTransitions, type BookingStatusValue } from '../constants/booking'
import { ErrorCodes } from '../constants/errorCodes'
import { UserRole } from '../constants/user'
import { AppError } from '../utils/AppError'
import { formatBookingStatus } from '../utils/formatters'
import { logger } from '../utils/logger'
import type { z } from 'zod'
import type { bookingCreateSchema } from '../models/Booking'

function toBookingDto(booking: any) {
  return {
    id: booking.id,
    userId: booking.userId,
    courseId: booking.courseId,
    scheduleTime: booking.scheduleTime,
    status: booking.status,
    note: booking.note,
    createdAt: booking.createdAt,
    course: booking.course
      ? {
          id: booking.course.id,
          coachId: booking.course.coachId,
          title: booking.course.title,
          description: booking.course.description,
          duration: booking.course.duration,
          price: Number(booking.course.price),
          minCapacity: booking.course.minCapacity ?? 1,
          maxCapacity: booking.course.maxCapacity,
          schedule: Array.isArray(booking.course.schedule) ? booking.course.schedule : [],
          status: booking.course.status,
          coach: booking.course.coach
            ? {
                id: booking.course.coach.id,
                nickname: booking.course.coach.nickname,
                avatar: booking.course.coach.avatar,
                role: booking.course.coach.role
              }
            : undefined
        }
      : undefined
  }
}

function assertTransition(booking: any, nextStatus: BookingStatusValue, role: string) {
  const from = booking.status as BookingStatusValue
  const allowed = BookingStatusTransitions[from] || []
    if (!allowed.includes(nextStatus)) {
      logger.warn('BOOKING_TRANSITION_DENIED', { id: booking.id, role })
      throw new AppError(
      `Booking[id=${booking.id}] ${formatBookingStatus(from)}->${formatBookingStatus(nextStatus)} failed: status not allowed role=${role}`,
      409,
      ErrorCodes.BOOKING_TRANSITION_INVALID,
      'Booking',
      'status',
      role
    )
  }
}

function isAutoConfirmEnabled(minCapacity: number | null | undefined, maxCapacity: number | null | undefined): boolean {
  const min = Number(minCapacity)
  const max = Number(maxCapacity)
  return !isNaN(min) && !isNaN(max) && min >= 1 && min <= max
}

async function autoConfirmIfThresholdMet(courseId: number, scheduleTime: Date) {
  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) return
  if (!isAutoConfirmEnabled(course.minCapacity, course.maxCapacity)) return
  const minCapacity = Number(course.minCapacity)
  const slotTime = scheduleTime.getTime()

  const slotBookings = await prisma.booking.findMany({
    where: {
      courseId,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] }
    }
  })
  const matchingBookings = slotBookings.filter((b: any) =>
    new Date(b.scheduleTime).getTime() === slotTime
  )
  const activeCount = matchingBookings.length

  if (activeCount >= minCapacity) {
    const pendingIds = matchingBookings
      .filter((b: any) => b.status === BookingStatus.PENDING)
      .map((b: any) => b.id)
    if (pendingIds.length > 0) {
      await prisma.booking.updateMany({
        where: { id: { in: pendingIds } },
        data: { status: BookingStatus.CONFIRMED }
      })
      logger.info('BOOKING_AUTO_CONFIRM', { courseId, scheduleTime, count: pendingIds.length })
    }
  }
}

export const bookingService = {
  async list(userId: number, role: string) {
    logger.info('BOOKING_LIST', { userId, role })
    const where = role === UserRole.COACH ? { course: { coachId: userId } } : role === UserRole.ADMIN ? {} : { userId }
    const bookings = await prisma.booking.findMany({
      where,
      include: { course: { include: { coach: true } } },
      orderBy: { scheduleTime: 'asc' }
    })
    return bookings.map((item: any) => toBookingDto(item))
  },

  async upcoming(userId: number, role: string) {
    const bookings = await this.list(userId, role)
    return bookings.filter(item => [BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(item.status)).slice(0, 3)
  },

  async create(userId: number, payload: z.infer<typeof bookingCreateSchema>) {
    logger.info('BOOKING_CREATE_START', { courseId: payload.courseId })
    const course = await prisma.course.findUnique({ where: { id: payload.courseId } })
    if (!course) {
      logger.warn('BOOKING_CREATE_FAILED', { courseId: payload.courseId })
      throw new AppError(`Booking[course_id=${payload.courseId}] create failed: Course[id] missing role=${UserRole.STUDENT}`, 404, ErrorCodes.COURSE_NOT_FOUND, 'Booking', 'course_id', UserRole.STUDENT)
    }
    const scheduleDate = new Date(payload.scheduleTime)
    const slotTime = scheduleDate.getTime()
    const scheduleList = Array.isArray(course.schedule) ? course.schedule : []
    const validSlot = scheduleList.some((s: any) => new Date(s).getTime() === slotTime)
    if (!validSlot) {
      throw new AppError(`Booking[course_id=${payload.courseId}] create failed: schedule_time not in course schedule role=${UserRole.STUDENT}`, 400, ErrorCodes.BOOKING_STATUS_PENDING_LOCKED, 'Booking', 'schedule_time', UserRole.STUDENT)
    }
    const existingSameSlot = await prisma.booking.findMany({
      where: {
        courseId: payload.courseId,
        userId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] }
      }
    })
    const duplicate = existingSameSlot.some((b: any) => new Date(b.scheduleTime).getTime() === slotTime)
    if (duplicate) {
      throw new AppError(`Booking[course_id=${payload.courseId}] create failed: duplicate booking for same slot role=${UserRole.STUDENT}`, 409, ErrorCodes.BOOKING_TRANSITION_INVALID, 'Booking', 'schedule_time', UserRole.STUDENT)
    }
    const maxCapacity = course.maxCapacity ?? 1
    const slotBookings = await prisma.booking.findMany({
      where: {
        courseId: payload.courseId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] }
      }
    })
    const currentSlotCount = slotBookings.filter((b: any) => new Date(b.scheduleTime).getTime() === slotTime).length
    if (currentSlotCount >= maxCapacity) {
      throw new AppError(`Booking[course_id=${payload.courseId}] create failed: slot full role=${UserRole.STUDENT}`, 409, ErrorCodes.BOOKING_STATUS_CONFIRMED_LOCKED, 'Booking', 'schedule_time', UserRole.STUDENT)
    }

    const autoConfirm = isAutoConfirmEnabled(course.minCapacity, course.maxCapacity)
    const minCap = Number(course.minCapacity)
    const initialStatus: BookingStatusValue = autoConfirm && minCap <= 1 && currentSlotCount + 1 >= minCap
      ? BookingStatus.CONFIRMED
      : BookingStatus.PENDING

    const booking = await prisma.booking.create({
      data: {
        userId,
        courseId: payload.courseId,
        scheduleTime: scheduleDate,
        status: initialStatus,
        note: payload.note
      },
      include: { course: { include: { coach: true } } }
    })

    if (initialStatus === BookingStatus.PENDING) {
      await autoConfirmIfThresholdMet(payload.courseId, scheduleDate)
      const refreshed = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: { course: { include: { coach: true } } }
      })
      if (refreshed) {
        logger.info('BOOKING_CREATE_SUCCESS', { id: refreshed.id, status: refreshed.status })
        return toBookingDto(refreshed)
      }
    }

    logger.info('BOOKING_CREATE_SUCCESS', { id: booking.id, status: initialStatus })
    return toBookingDto(booking)
  },

  async confirm(id: number, coachId: number, role: string) {
    logger.info('BOOKING_CONFIRM_START', { id })
    const booking = await prisma.booking.findUnique({ where: { id }, include: { course: true } })
    if (!booking) {
      throw new AppError(`Booking[id=${id}] confirm failed: id not found role=${role}`, 404, ErrorCodes.BOOKING_NOT_FOUND, 'Booking', 'id', role)
    }
    if (role === UserRole.COACH && booking.course.coachId !== coachId) {
      throw new AppError(`Booking[id=${id}] confirm failed: coach not match role=${role}`, 403, ErrorCodes.COURSE_COACH_REQUIRED, 'Booking', 'course.coach_id', role)
    }
    assertTransition(booking, BookingStatus.CONFIRMED, role)
    const updated = await prisma.booking.update({ where: { id }, data: { status: BookingStatus.CONFIRMED }, include: { course: { include: { coach: true } } } })
    logger.info('BOOKING_CONFIRM_SUCCESS', { id })
    return toBookingDto(updated)
  },

  async complete(id: number, userId: number, role: string) {
    logger.info('BOOKING_COMPLETE_START', { id })
    const booking = await prisma.booking.findUnique({ where: { id }, include: { course: true } })
    if (!booking) {
      throw new AppError(`Booking[id=${id}] complete failed: id not found role=${role}`, 404, ErrorCodes.BOOKING_NOT_FOUND, 'Booking', 'id', role)
    }
    if (role === UserRole.STUDENT && booking.userId !== userId) {
      throw new AppError(`Booking[id=${id}] complete failed: user_id not match role=${role}`, 403, ErrorCodes.BOOKING_NOT_FOUND, 'Booking', 'user_id', role)
    }
    assertTransition(booking, BookingStatus.COMPLETED, role)
    const updated = await prisma.booking.update({ where: { id }, data: { status: BookingStatus.COMPLETED }, include: { course: { include: { coach: true } } } })
    logger.info('BOOKING_COMPLETE_SUCCESS', { id })
    return toBookingDto(updated)
  },

  async cancel(id: number, userId: number, role: string) {
    logger.info('BOOKING_CANCEL_START', { id })
    const booking = await prisma.booking.findUnique({ where: { id }, include: { course: true } })
    if (!booking) {
      throw new AppError(`Booking[id=${id}] cancel failed: id not found role=${role}`, 404, ErrorCodes.BOOKING_NOT_FOUND, 'Booking', 'id', role)
    }
    const owner = role === UserRole.STUDENT && booking.userId === userId
    const coach = role === UserRole.COACH && booking.course.coachId === userId
    const admin = role === UserRole.ADMIN
    if (!owner && !coach && !admin) {
      throw new AppError(`Booking[id=${id}] cancel failed: owner/coach not match role=${role}`, 403, ErrorCodes.BOOKING_NOT_FOUND, 'Booking', 'user_id', role)
    }
    assertTransition(booking, BookingStatus.CANCELLED, role)
    const updated = await prisma.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED }, include: { course: { include: { coach: true } } } })
    logger.info('BOOKING_CANCEL_SUCCESS', { id })
    return toBookingDto(updated)
  }
}
