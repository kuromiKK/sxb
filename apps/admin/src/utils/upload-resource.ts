export type ResourceKind = 'image' | 'video' | 'audio' | 'handout'
export type UploadedResource = { id: string; kind: ResourceKind; filename: string }

/** Every persisted upload must be registered by the media API before being attached to content. */
export function uploadResource(file: File, options: {
  kind: ResourceKind; contentId: string; examId?: string; maxSizeMb?: number
  onProgress?: (percentage: number) => void
}) {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<UploadedResource>((resolve, reject) => {
    if (file.size > (options.maxSizeMb ?? 200) * 1024 * 1024) {
      reject(new Error(`单个文件不能超过 ${options.maxSizeMb ?? 200}MB`)); return
    }
    xhr.open('POST', '/api/admin/media/upload?' + new URLSearchParams({
      examId: options.examId || '', contentId: options.contentId, kind: options.kind,
    }))
    xhr.setRequestHeader('Authorization', 'Bearer ' + sessionStorage.getItem('sxb-admin-token'))
    xhr.upload.onprogress = e => { if (e.lengthComputable) options.onProgress?.(Math.round(e.loaded / e.total * 100)) }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && data.id) resolve(data)
        else reject(new Error(data.message || '上传失败'))
      } catch { reject(new Error('服务器未返回有效上传结果')) }
    }
    xhr.onerror = () => reject(new Error('上传连接中断，请重试'))
    xhr.onabort = () => reject(new Error('已取消上传'))
    const data = new FormData(); data.append('file', file); xhr.send(data)
  })
  return { promise, abort: () => xhr.abort() }
}

// Public images only. Protected course assets must use their authenticated media tickets.
export const publicImageUrl = (assetId: string) => '/api/message-images/' + encodeURIComponent(assetId)
