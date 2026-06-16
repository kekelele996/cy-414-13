<template>
  <article class="course-card">
    <div class="course-head">
      <div>
        <span v-if="course.reason" class="reason">{{ course.reason }}</span>
        <h3>{{ course.title }}</h3>
      </div>
      <span class="price">{{ formatPrice(course.price) }}</span>
    </div>

    <p>{{ course.description }}</p>

    <div class="meta-grid">
      <span><Timer :size="16" />{{ course.duration }} 分钟</span>
      <span><Users :size="16" />{{ course.minCapacity }}–{{ course.maxCapacity }} 人</span>
      <span><CalendarClock :size="16" />{{ nextSchedule }}</span>
    </div>

    <div v-if="overallProgress" class="progress-block">
      <div class="progress-head">
        <span v-if="overallProgress.isConfirmed" class="confirmed-tag">已成团</span>
        <span v-else-if="overallProgress.remainingToConfirm > 0" class="pending-tag">
          还差 {{ overallProgress.remainingToConfirm }} 人成行
        </span>
        <span v-else class="pending-tag">待成团</span>
        <span class="count">{{ overallProgress.bookedCount }}/{{ course.minCapacity }} 人</span>
      </div>
      <el-progress
        :percentage="Math.min(100, Math.round((overallProgress.bookedCount / Math.max(course.minCapacity, 1)) * 100))"
        :status="overallProgress.isConfirmed ? 'success' : 'warning'"
        :stroke-width="8"
        :show-text="false"
      />
    </div>

    <div class="course-foot">
      <CoachAvatar :coach="course.coach" />
      <el-dropdown v-if="availableSlots.length" trigger="click" @command="handleBook">
        <el-button type="primary" :icon="CalendarPlus">预约</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="item in availableSlots"
              :key="item.scheduleTime"
              :command="item.scheduleTime"
              :disabled="item.isFull"
            >
              <div class="slot-item">
                <span>{{ formatSchedule(item.scheduleTime) }}</span>
                <span v-if="item.isFull" class="slot-full">已满</span>
                <span v-else-if="item.isConfirmed" class="slot-confirmed">已成团</span>
                <span v-else-if="item.remainingToConfirm > 0" class="slot-pending">
                  差 {{ item.remainingToConfirm }} 人
                </span>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tag v-else type="info" effect="plain">暂无可用时段</el-tag>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { CalendarClock, CalendarPlus, Timer, Users } from '@lucide/vue'
import type { Course, ScheduleSlotProgress } from '@/types/domain'
import CoachAvatar from './CoachAvatar.vue'
import { formatPrice, formatSchedule } from '@/utils/formatters'
import { useCoachSchedule } from '@/hooks/useCoachSchedule'

const props = defineProps<{
  course: Course
}>()

const emit = defineEmits<{
  book: [course: Course, scheduleTime: string]
}>()

const courseRef = computed(() => toRef(props, 'course').value)
const { nextSchedule } = useCoachSchedule(courseRef)

const slotProgressMap = computed<Record<string, ScheduleSlotProgress>>(() => {
  const map: Record<string, ScheduleSlotProgress> = {}
  if (props.course.slotProgress) {
    props.course.slotProgress.forEach(p => { map[new Date(p.scheduleTime).getTime()] = p })
  }
  return map
})

function getSlotProgress(slot: string): ScheduleSlotProgress {
  const key = new Date(slot).getTime()
  if (slotProgressMap.value[key]) return slotProgressMap.value[key]
  return {
    scheduleTime: slot,
    bookedCount: 0,
    confirmedCount: 0,
    pendingCount: 0,
    minCapacity: props.course.minCapacity ?? 1,
    maxCapacity: props.course.maxCapacity ?? 1,
    remainingToConfirm: props.course.minCapacity ?? 1,
    isConfirmed: false,
    isFull: false
  }
}

const availableSlots = computed(() =>
  props.course.schedule
    .map(slot => getSlotProgress(slot))
    .sort((a, b) => new Date(a.scheduleTime).getTime() - new Date(b.scheduleTime).getTime())
)

const overallProgress = computed<ScheduleSlotProgress | null>(() => {
  const valid = availableSlots.value.filter(s => !s.isFull)
  if (!valid.length) return null
  const target = valid.find(s => new Date(s.scheduleTime).getTime() === new Date(nextSchedule.value).getTime())
  return target || valid[0]
})

function handleBook(value: string | number | object) {
  emit('book', props.course, String(value))
}
</script>

<style scoped>
.course-card {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.course-head,
.course-foot {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

h3 {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: 20px;
  line-height: 1.25;
}

p {
  min-height: 44px;
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.reason {
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
}

.price {
  flex: 0 0 auto;
  color: var(--green);
  font-size: 24px;
  font-weight: 900;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.meta-grid span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-block {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
}

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
}

.confirmed-tag {
  color: var(--green);
}

.pending-tag {
  color: var(--accent);
}

.count {
  color: var(--muted);
  font-weight: 600;
}

.slot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.slot-confirmed {
  color: var(--green);
  font-size: 12px;
  font-weight: 700;
}

.slot-pending {
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.slot-full {
  color: var(--danger);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 680px) {
  .course-head,
  .course-foot {
    align-items: stretch;
    flex-direction: column;
  }

  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
