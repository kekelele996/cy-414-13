<template>
  <div class="section-band">
    <RoleGuard :roles="[UserRole.COACH, UserRole.ADMIN]">
      <section class="panel">
        <el-tabs v-model="activeTab" class="coach-tabs">
          <el-tab-pane label="课程广场" name="browse" />
          <el-tab-pane label="课程管理" name="manage">
            <template #label>
              <span><BarChart3 :size="16" /> 成团进度</span>
            </template>
          </el-tab-pane>
        </el-tabs>
      </section>
    </RoleGuard>

    <template v-if="activeTab === 'browse'">
      <section class="panel">
        <div class="toolbar">
          <el-input v-model="courseStore.keyword" clearable placeholder="搜索课程、教练或训练目标" :prefix-icon="Search" @keyup.enter="courseStore.loadCourses" />
          <el-select v-model="courseStore.coachId" clearable placeholder="教练筛选" style="width: 220px" @change="courseStore.loadCourses">
            <el-option v-for="coach in userStore.coaches" :key="coach.id" :label="coach.nickname" :value="coach.id" />
          </el-select>
          <el-button type="primary" :icon="SlidersHorizontal" @click="courseStore.loadCourses">筛选</el-button>
          <RoleGuard :roles="[UserRole.COACH, UserRole.ADMIN]">
            <el-button type="success" :icon="Plus" @click="openCreateDialog">发布课程</el-button>
          </RoleGuard>
        </div>
      </section>

      <section v-if="courseStore.list.length" class="grid-2">
        <CourseCard v-for="course in courseStore.list" :key="course.id" :course="course" @book="bookCourse" />
      </section>
      <EmptyState v-else title="没有匹配课程" description="换一个训练目标或教练再筛选" />
    </template>

    <template v-else-if="activeTab === 'manage'">
      <section class="panel">
        <div class="toolbar">
          <h2 class="manage-title">我的课程 · 成团进度</h2>
          <el-button type="success" :icon="Plus" @click="openCreateDialog">发布新课程</el-button>
          <el-button :icon="RefreshCw" @click="courseStore.loadCoachProgress">刷新</el-button>
        </div>
      </section>

      <section v-if="courseStore.coachProgressList.length" class="list-stack">
        <article v-for="course in courseStore.coachProgressList" :key="course.id" class="manage-card">
          <div class="manage-head">
            <div>
              <h3>{{ course.title }}</h3>
              <p>{{ course.description }}</p>
            </div>
            <div class="manage-price">{{ formatPrice(course.price) }}</div>
          </div>

          <div class="manage-meta">
            <el-tag size="small" type="info">{{ course.duration }} 分钟</el-tag>
            <el-tag size="small">最低 {{ course.minCapacity }} 人 · 最多 {{ course.maxCapacity }} 人</el-tag>
            <el-tag size="small" :type="course.totalPending > 0 ? 'warning' : 'success'">
              待确认 {{ course.totalPending }} · 已确认 {{ course.totalConfirmed }}
            </el-tag>
          </div>

          <div class="slot-list">
            <div v-for="slot in course.slotProgress" :key="slot.scheduleTime" class="slot-row">
              <div class="slot-time">{{ formatSchedule(slot.scheduleTime) }}</div>
              <div class="slot-progress">
                <div class="slot-stats">
                  <span>
                    <strong>{{ slot.bookedCount }}</strong>
                    <small>/ {{ slot.minCapacity }} 人</small>
                  </span>
                  <el-tag v-if="slot.isFull" size="small" type="danger">已满</el-tag>
                  <el-tag v-else-if="slot.isConfirmed" size="small" type="success">已成团</el-tag>
                  <el-tag v-else size="small" type="warning">
                    还差 {{ slot.remainingToConfirm }} 人
                  </el-tag>
                </div>
                <el-progress
                  :percentage="Math.min(100, Math.round((slot.bookedCount / Math.max(slot.minCapacity, 1)) * 100))"
                  :status="slot.isConfirmed ? 'success' : slot.isFull ? 'exception' : 'warning'"
                  :stroke-width="10"
                  :show-text="false"
                />
                <div class="slot-detail">
                  已预约 {{ slot.bookedCount }} · 已确认 {{ slot.confirmedCount }} · 待成团 {{ slot.pendingCount }} · 余位 {{ Math.max(0, slot.maxCapacity - slot.bookedCount) }}
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>
      <EmptyState v-else title="还没有课程" description="点击「发布新课程」创建你的第一门课" />
    </template>

    <el-dialog
      v-model="createDialogVisible"
      title="发布新课程"
      width="560px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="课程名称" prop="title">
          <el-input v-model="form.title" maxlength="120" show-word-limit placeholder="例如：晨间力量唤醒" />
        </el-form-item>
        <el-form-item label="课程描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            placeholder="介绍训练内容、适合人群等"
          />
        </el-form-item>
        <el-form-item label="时长" prop="duration">
          <el-input-number v-model="form.duration" :min="15" :max="240" :step="5" />
          <span style="margin-left: 8px; color: var(--muted)">分钟</span>
        </el-form-item>
        <el-form-item label="价格" prop="price">
          <el-input-number v-model="form.price" :min="0" :step="10" :precision="2" />
          <span style="margin-left: 8px; color: var(--muted)">元</span>
        </el-form-item>
        <el-form-item label="最低人数" prop="minCapacity">
          <el-input-number v-model="form.minCapacity" :min="1" :max="99" />
          <span style="margin-left: 8px; color: var(--muted)">人（达到即自动确认）</span>
        </el-form-item>
        <el-form-item label="最大容量" prop="maxCapacity">
          <el-input-number v-model="form.maxCapacity" :min="1" :max="99" />
          <span style="margin-left: 8px; color: var(--muted)">人</span>
        </el-form-item>
        <el-form-item label="开课时间" prop="schedule">
          <div class="schedule-inputs">
            <div v-for="(item, idx) in form.schedule" :key="idx" class="schedule-row">
              <el-date-picker
                v-model="form.schedule[idx]"
                type="datetime"
                placeholder="选择日期时间"
                style="flex: 1"
                value-format="YYYY-MM-DDTHH:mm:ssZ"
                format="YYYY/MM/DD HH:mm"
              />
              <el-button
                v-if="form.schedule.length > 1"
                type="danger"
                text
                :icon="XCircle"
                @click="removeSchedule(idx)"
              />
            </div>
            <el-button type="primary" link :icon="Plus" @click="addSchedule">添加时段</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { BarChart3, Plus, RefreshCw, Search, SlidersHorizontal, XCircle } from '@lucide/vue'
import dayjs from 'dayjs'
import CourseCard from '@/components/common/CourseCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RoleGuard from '@/components/common/RoleGuard'
import { UserRole } from '@/constants/user'
import { useAuthStore } from '@/stores/authStore'
import { useBookingStore } from '@/stores/bookingStore'
import { useCourseStore } from '@/stores/courseStore'
import { useUserStore } from '@/stores/userStore'
import { formatPrice, formatSchedule } from '@/utils/formatters'
import type { Course } from '@/types/domain'

const courseStore = useCourseStore()
const bookingStore = useBookingStore()
const userStore = useUserStore()
const authStore = useAuthStore()

const activeTab = ref('browse')

const createDialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()

interface CreateForm {
  title: string
  description: string
  duration: number
  price: number
  minCapacity: number
  maxCapacity: number
  schedule: string[]
}

const form = reactive<CreateForm>({
  title: '',
  description: '',
  duration: 60,
  price: 188,
  minCapacity: 1,
  maxCapacity: 6,
  schedule: [dayjs().add(1, 'day').hour(8).minute(0).second(0).format('YYYY-MM-DDTHH:mm:ssZ')]
})

const formRules: FormRules = {
  title: [{ required: true, message: '请输入课程名称', trigger: 'blur' }],
  duration: [{ required: true, message: '请输入时长', trigger: 'change' }],
  price: [{ required: true, message: '请输入价格', trigger: 'change' }],
  minCapacity: [
    { required: true, message: '请输入最低人数', trigger: 'change' },
    {
      validator: (_r, value, cb) => {
        if (value > form.maxCapacity) cb(new Error('最低人数不能超过最大容量'))
        else cb()
      },
      trigger: 'change'
    }
  ],
  maxCapacity: [
    { required: true, message: '请输入最大容量', trigger: 'change' },
    {
      validator: (_r, value, cb) => {
        if (value < form.minCapacity) cb(new Error('最大容量不能低于最低人数'))
        else cb()
      },
      trigger: 'change'
    }
  ],
  schedule: [
    {
      validator: (_r, value, cb) => {
        if (!Array.isArray(value) || value.length === 0) cb(new Error('至少添加一个开课时间'))
        else if (value.some(s => !s)) cb(new Error('请完善所有开课时间'))
        else cb()
      },
      trigger: 'change'
    }
  ]
}

function addSchedule() {
  const last = form.schedule[form.schedule.length - 1]
  const next = last ? dayjs(last).add(1, 'day') : dayjs().add(1, 'day')
  form.schedule.push(next.hour(8).minute(0).second(0).format('YYYY-MM-DDTHH:mm:ssZ'))
}

function removeSchedule(idx: number) {
  form.schedule.splice(idx, 1)
}

function openCreateDialog() {
  Object.assign(form, {
    title: '',
    description: '',
    duration: 60,
    price: 188,
    minCapacity: 1,
    maxCapacity: 6,
    schedule: [dayjs().add(1, 'day').hour(8).minute(0).second(0).format('YYYY-MM-DDTHH:mm:ssZ')]
  })
  createDialogVisible.value = true
}

async function submitCreate() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    await courseStore.create({
      title: form.title,
      description: form.description || undefined,
      duration: form.duration,
      price: form.price,
      minCapacity: form.minCapacity,
      maxCapacity: form.maxCapacity,
      schedule: form.schedule.filter(Boolean)
    })
    ElMessage.success('课程已发布')
    createDialogVisible.value = false
    if (activeTab.value === 'browse') await courseStore.loadCourses()
    else await courseStore.loadCoachProgress()
  } finally {
    submitting.value = false
  }
}

async function bookCourse(course: Course, scheduleTime: string) {
  const result = await bookingStore.create(course.id, scheduleTime)
  if (result?.status === 'confirmed') {
    ElMessage.success(`预约已成团：${course.title}`)
  } else {
    const slot = course.slotProgress?.find(s => new Date(s.scheduleTime).getTime() === new Date(scheduleTime).getTime())
    const remain = slot ? Math.max(0, slot.minCapacity - (slot.bookedCount + 1)) : Math.max(0, (course.minCapacity ?? 1) - 1)
    if (remain > 0) {
      ElMessage.info(`预约已提交，还差 ${remain} 人自动确认：${course.title}`)
    } else {
      ElMessage.success(`预约已提交：${course.title}`)
    }
  }
  await courseStore.loadCourses()
}

onMounted(async () => {
  const tasks: Promise<unknown>[] = [courseStore.loadCourses(), userStore.loadCoaches()]
  if ([UserRole.COACH, UserRole.ADMIN].includes(authStore.user?.role as any)) {
    tasks.push(courseStore.loadCoachProgress())
  }
  await Promise.all(tasks)
})
</script>

<style scoped>
.coach-tabs :deep(.el-tabs__header) {
  margin: 0 0 4px;
}

.manage-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--ink);
}

.manage-card {
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.manage-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.manage-head h3 {
  margin: 0;
  font-size: 18px;
  color: var(--ink);
}

.manage-head p {
  margin: 6px 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.manage-price {
  flex: 0 0 auto;
  color: var(--green);
  font-size: 22px;
  font-weight: 900;
}

.manage-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.slot-list {
  display: grid;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px dashed var(--line);
}

.slot-row {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 16px;
  align-items: start;
  padding: 12px;
  border-radius: 6px;
  background: var(--bg);
}

.slot-time {
  font-weight: 700;
  color: var(--ink);
  padding-top: 2px;
}

.slot-progress {
  display: grid;
  gap: 8px;
}

.slot-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.slot-stats strong {
  font-size: 16px;
  color: var(--ink);
}

.slot-stats small {
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}

.slot-detail {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.schedule-inputs {
  display: grid;
  gap: 8px;
  width: 100%;
}

.schedule-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 680px) {
  .slot-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
