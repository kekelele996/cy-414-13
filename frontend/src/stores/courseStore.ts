import { defineStore } from 'pinia'
import { courseApi } from '@/api/course'
import { UserRole } from '@/constants/user'
import type { Course, CourseWithProgress, ScheduleSlotProgress } from '@/types/domain'

function buildSlotProgress(schedule: string[], booked: Record<string, number>, min: number, max: number): ScheduleSlotProgress[] {
  return schedule.map(s => {
    const count = booked[s] ?? 0
    return {
      scheduleTime: s,
      bookedCount: count,
      confirmedCount: count >= min ? count : 0,
      pendingCount: count >= min ? 0 : count,
      minCapacity: min,
      maxCapacity: max,
      remainingToConfirm: Math.max(0, min - count),
      isConfirmed: count >= min,
      isFull: count >= max
    }
  })
}

const demoScheduleA = ['2026-06-16T08:00:00+08:00', '2026-06-18T08:00:00+08:00']
const demoScheduleB = ['2026-06-16T19:00:00+08:00', '2026-06-19T19:30:00+08:00']
const demoScheduleC = ['2026-06-17T12:30:00+08:00']

const demoCourses: Course[] = [
  {
    id: 1,
    coachId: 2,
    title: '晨间力量唤醒',
    description: '小班力量训练，聚焦核心激活与动作模式校准。',
    duration: 60,
    price: 188,
    minCapacity: 3,
    maxCapacity: 6,
    schedule: demoScheduleA,
    status: 'published',
    reason: '最近可约',
    coach: {
      id: 2,
      nickname: 'Coach Han',
      avatar: 'https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=160&h=160&fit=crop',
      role: UserRole.COACH
    },
    slotProgress: buildSlotProgress(demoScheduleA, { [demoScheduleA[0]]: 2, [demoScheduleA[1]]: 3 }, 3, 6)
  },
  {
    id: 2,
    coachId: 2,
    title: '体态矫正私教',
    description: '肩颈、髋膝踝评估后定制动作方案。',
    duration: 45,
    price: 260,
    minCapacity: 1,
    maxCapacity: 1,
    schedule: demoScheduleB,
    status: 'published',
    reason: '训练匹配',
    coach: {
      id: 2,
      nickname: 'Coach Han',
      avatar: 'https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=160&h=160&fit=crop',
      role: UserRole.COACH
    },
    slotProgress: buildSlotProgress(demoScheduleB, {}, 1, 1)
  },
  {
    id: 3,
    coachId: 4,
    title: '心肺燃脂循环',
    description: '器械与自重结合，适合需要提升耐力的学员。',
    duration: 50,
    price: 168,
    minCapacity: 4,
    maxCapacity: 8,
    schedule: demoScheduleC,
    status: 'published',
    coach: {
      id: 4,
      nickname: 'Mia',
      avatar: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=160&h=160&fit=crop',
      role: UserRole.COACH
    },
    slotProgress: buildSlotProgress(demoScheduleC, { [demoScheduleC[0]]: 1 }, 4, 8)
  }
]

const demoCoachProgress: CourseWithProgress[] = demoCourses.map(c => ({
  ...c,
  totalBookings: c.slotProgress?.reduce((s, p) => s + p.bookedCount, 0) ?? 0,
  totalConfirmed: c.slotProgress?.reduce((s, p) => s + p.confirmedCount, 0) ?? 0,
  totalPending: c.slotProgress?.reduce((s, p) => s + p.pendingCount, 0) ?? 0,
  slotProgress: c.slotProgress ?? []
}))

export const useCourseStore = defineStore('courses', {
  state: () => ({
    list: demoCourses,
    recommended: demoCourses.slice(0, 2),
    coachProgressList: demoCoachProgress.filter(c => c.coachId === 2),
    keyword: '',
    coachId: undefined as number | undefined
  }),
  actions: {
    async loadCourses() {
      try {
        this.list = await courseApi.list({ keyword: this.keyword || undefined, coachId: this.coachId })
      } catch {
        this.list = demoCourses.filter(course => !this.keyword || course.title.includes(this.keyword) || course.description?.includes(this.keyword))
      }
    },
    async loadRecommended() {
      try {
        this.recommended = await courseApi.recommended()
      } catch {
        this.recommended = demoCourses.slice(0, 2)
      }
    },
    async loadCoachProgress() {
      try {
        this.coachProgressList = await courseApi.coachProgress()
      } catch {
        this.coachProgressList = demoCoachProgress.filter(c => c.coachId === 2)
      }
    },
    async create(payload: Partial<Course>) {
      const created = await courseApi.create(payload)
      this.list.unshift(created)
      this.recommended = this.list.slice(0, 3)
      return created
    }
  }
})

