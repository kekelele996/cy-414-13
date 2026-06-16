import type { BookingStatusValue } from '../constants/booking'
import type { UserRoleValue } from '../constants/user'

export interface UserDto {
  id: number
  phone: string
  nickname: string
  avatar?: string | null
  role: UserRoleValue
  gender?: string | null
  height?: number | null
  weight?: number | null
  createdAt?: Date
}

export interface ScheduleSlotProgress {
  scheduleTime: string
  bookedCount: number
  confirmedCount: number
  pendingCount: number
  minCapacity: number
  maxCapacity: number
  remainingToConfirm: number
  isConfirmed: boolean
  isFull: boolean
}

export interface CourseDto {
  id: number
  coachId: number
  title: string
  description?: string | null
  duration: number
  price: number
  minCapacity: number
  maxCapacity: number
  schedule: string[]
  status: string
  coach?: UserDto
  slotProgress?: ScheduleSlotProgress[]
}

export interface CourseWithProgressDto extends CourseDto {
  totalBookings: number
  totalConfirmed: number
  totalPending: number
  slotProgress: ScheduleSlotProgress[]
}

export interface BookingDto {
  id: number
  userId: number
  courseId: number
  scheduleTime: string
  status: BookingStatusValue
  note?: string | null
  course?: CourseDto
}

