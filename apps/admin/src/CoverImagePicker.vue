<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Upload } from 'lucide-vue-next'
import { publicImageUrl, uploadResource } from './utils/upload-resource'

const props = withDefaults(defineProps<{ modelValue: string; contentId: string; disabled?: boolean; maxSizeMb?: number }>(), { maxSizeMb: 20 })
const emit = defineEmits<{ 'update:modelValue': [value: string]; busy: [value: boolean] }>()
const input = ref<HTMLInputElement>()
const filename = ref('')
const error = ref('')
const reading = ref(false)
let revision = 0
let upload: ReturnType<typeof uploadResource> | undefined

async function selectImage(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  element.value = ''
  if (!file) return
  const current = ++revision
  upload?.abort()
  error.value = ''
  reading.value = true
  emit('busy', true)
  try {
    if (file.size > props.maxSizeMb * 1024 * 1024) throw new Error(`图片不能超过${props.maxSizeMb}MB，请选择较小的图片`)
    // Detect the content, since downloaded files may have an empty or incorrect MIME type.
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    if (!png && !jpeg) throw new Error('仅支持有效的JPG、PNG图片，请重新选择')
    if (current !== revision) return
    const data = URL.createObjectURL(file)
    const preview = new Image()
    preview.src = data
    try { await preview.decode() } catch { throw new Error('图片已损坏，无法预览，请重新选择') }
    finally { URL.revokeObjectURL(data) }
    if (current !== revision) return
    upload = uploadResource(file, { kind: 'image', contentId: props.contentId, maxSizeMb: props.maxSizeMb })
    const asset = await upload.promise
    if (current !== revision) return
    filename.value = asset.filename
    emit('update:modelValue', publicImageUrl(asset.id))
  } catch (failure) {
    if (current === revision) error.value = failure instanceof Error ? failure.message : '图片读取失败，请重试'
  } finally {
    if (current === revision) { reading.value = false; emit('busy', false) }
  }
}

onBeforeUnmount(() => { revision++; upload?.abort(); emit('busy', false) })
</script>

<template>
  <div class="cover-image-picker">
    <div class="handout-file-picker">
      <el-button :loading="reading" :disabled="disabled" @click="input?.click()"><Upload :size="16" aria-hidden="true" />选择图片</el-button>
      <span v-if="filename" class="selected-filename" :title="filename" role="status">{{ filename }}</span>
      <input ref="input" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" aria-label="选择封面图片" hidden @change="selectImage" />
    </div>
    <p class="handout-hint">支持JPG、PNG，不超过{{ props.maxSizeMb }}MB</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <img v-if="modelValue" :src="modelValue" alt="封面预览" class="cover-image-preview" />
  </div>
</template>

<style scoped>
.cover-image-picker { width: 100%; min-width: 0; }
.handout-file-picker { display: flex; align-items: center; gap: 10px; min-width: 0; margin-bottom: 8px; }
.handout-file-picker .el-button { flex: none; height: var(--admin-control-h, 40px); }
.selected-filename { display: block; min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: var(--el-text-color-regular); }
.handout-hint { margin: 0; font-size: 14px; color: var(--el-text-color-regular); }
.cover-image-preview { display: block; width: 120px; height: 160px; aspect-ratio: 3 / 4; max-width: 100%; margin-top: 12px; object-fit: cover; border: 1px solid var(--el-border-color); border-radius: var(--admin-radius, 6px); }
</style>
