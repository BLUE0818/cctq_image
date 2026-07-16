import { strFromU8, strToU8, type AsyncUnzipOptions, unzip, zip } from 'fflate'

import type { AppSettings, ExportData, StoredImage, StoredImageThumbnail, TaskRecord } from '../types'
import { getDataUrlDecodedByteSize } from './imageApiShared'

type ZipFiles = Record<string, Uint8Array | [Uint8Array, { mtime: Date; level?: 0 }]>

export const MAX_EXPORT_ZIP_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_EXPORT_PART_BYTES = 256 * 1024 * 1024
const EXPORT_PART_SAFETY_BYTES = 128 * 1024 * 1024
const ZIP_BASE_OVERHEAD_BYTES = 1024 * 1024
const ZIP_ENTRY_OVERHEAD_BYTES = 1024

export interface BuildExportZipOptions {
  exportConfig?: boolean
  exportTasks?: boolean
}

export interface BuildExportZipParams {
  options: BuildExportZipOptions
  exportedAt: number
  settings: AppSettings
  tasks: TaskRecord[]
  images: StoredImage[]
  thumbnailsByImageId: Map<string, StoredImageThumbnail>
  imageTasks?: TaskRecord[]
  includeManifestData?: boolean
  backupPart?: ExportData['backupPart']
}

export interface ExportZipPlanPart {
  imageIds: string[]
  tasks: TaskRecord[]
  includeBaseData: boolean
}

export async function buildExportZip(params: BuildExportZipParams) {
  const exportedAtDate = new Date(params.exportedAt)
  const imageTasks = params.options.exportTasks ? params.imageTasks ?? params.tasks : []
  const imageCreatedAtFallback = getImageCreatedAtFallback(imageTasks)
  const imageFiles: ExportData['imageFiles'] = {}
  const thumbnailFiles: NonNullable<ExportData['thumbnailFiles']> = {}
  const zipFiles: ZipFiles = {}

  if (params.options.exportTasks) {
    for (const image of params.images) {
      const { ext, bytes } = dataUrlToBytes(image.dataUrl)
      const path = `images/${image.id}.${ext}`
      const createdAt = image.createdAt ?? imageCreatedAtFallback.get(image.id) ?? params.exportedAt
      imageFiles[image.id] = {
        path,
        createdAt,
        source: image.source,
        width: image.width,
        height: image.height,
      }
      zipFiles[path] = [bytes, { mtime: new Date(createdAt), level: 0 }]

      const thumbnail = params.thumbnailsByImageId.get(image.id)
      if (thumbnail?.thumbnailDataUrl) {
        const { ext: thumbnailExt, bytes: thumbnailBytes } = dataUrlToBytes(thumbnail.thumbnailDataUrl)
        const thumbnailPath = `thumbnails/${image.id}.${thumbnailExt}`
        imageFiles[image.id].width = imageFiles[image.id].width ?? thumbnail.width
        imageFiles[image.id].height = imageFiles[image.id].height ?? thumbnail.height
        thumbnailFiles[image.id] = {
          path: thumbnailPath,
          width: thumbnail.width,
          height: thumbnail.height,
          thumbnailVersion: thumbnail.thumbnailVersion,
        }
        zipFiles[thumbnailPath] = [thumbnailBytes, { mtime: new Date(createdAt), level: 0 }]
      }
    }
  }

  const manifest: ExportData = {
    version: 3,
    exportedAt: exportedAtDate.toISOString(),
  }
  if (params.backupPart) manifest.backupPart = params.backupPart
  if (params.options.exportConfig && params.includeManifestData !== false) manifest.settings = params.settings
  if (params.options.exportTasks) {
    if (params.includeManifestData !== false || params.tasks.length) manifest.tasks = params.tasks
    manifest.imageFiles = imageFiles
    manifest.thumbnailFiles = thumbnailFiles
  }

  zipFiles['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { mtime: exportedAtDate }]

  return {
    manifest,
    bytes: await zipFilesAsync(zipFiles),
  }
}

export function getExportZipPlan(
  params: Omit<BuildExportZipParams, 'images' | 'thumbnailsByImageId'>,
  images: Array<{ id: string; bytes: number }>,
  options: { maxBytes?: number; partBytes?: number } = {},
) {
  const maxBytes = options.maxBytes ?? MAX_EXPORT_ZIP_BYTES
  const safetyBytes = Math.min(EXPORT_PART_SAFETY_BYTES, Math.floor(maxBytes * 0.1))
  const partBytes = Math.min(options.partBytes ?? DEFAULT_EXPORT_PART_BYTES, maxBytes - safetyBytes)
  const manifestBytes = getBaseManifestEstimatedBytes(params)
  const plannedTasks = params.options.exportTasks ? params.tasks : []
  const taskBytes = plannedTasks.map(getJsonEstimatedBytes)
  const plannedImages = params.options.exportTasks ? images : []
  const estimatedBytes = manifestBytes
    + taskBytes.reduce((total, bytes) => total + bytes, 0)
    + plannedImages.reduce((total, image) => total + image.bytes, 0)

  if (estimatedBytes < partBytes) {
    return [{
      imageIds: plannedImages.map((image) => image.id),
      tasks: plannedTasks,
      includeBaseData: true,
    }]
  }

  const parts: ExportZipPlanPart[] = [{ imageIds: [], tasks: [], includeBaseData: true }]
  const sizes = [manifestBytes]
  const addItem = (bytes: number, errorMessage: string, append: (part: ExportZipPlanPart) => void) => {
    let index = parts.length - 1
    const hasItems = parts[index].imageIds.length > 0 || parts[index].tasks.length > 0
    if (hasItems && sizes[index] + bytes >= partBytes) {
      parts.push({ imageIds: [], tasks: [], includeBaseData: false })
      sizes.push(ZIP_BASE_OVERHEAD_BYTES)
      index++
    }
    if (sizes[index] + bytes >= maxBytes) throw new Error(errorMessage)
    append(parts[index])
    sizes[index] += bytes
  }

  for (let index = 0; index < plannedTasks.length; index++) {
    addItem(taskBytes[index], '单条任务超过 2 GB，无法生成备份。', (part) => part.tasks.push(plannedTasks[index]))
  }
  for (const image of plannedImages) {
    addItem(image.bytes, `图片 ${image.id} 过大，无法放入小于 2 GB 的备份分片。`, (part) => part.imageIds.push(image.id))
  }
  return parts
}

export function getExportImageEstimatedBytes(image: StoredImage, thumbnail?: StoredImageThumbnail) {
  return getDataUrlDecodedByteSize(image.dataUrl)
    + (thumbnail?.thumbnailDataUrl ? getDataUrlDecodedByteSize(thumbnail.thumbnailDataUrl) : 0)
    + ZIP_ENTRY_OVERHEAD_BYTES * (thumbnail?.thumbnailDataUrl ? 2 : 1)
}

export function createExportBlob(bytes: Uint8Array): Blob {
  if (bytes.byteLength >= MAX_EXPORT_ZIP_BYTES) {
    throw new Error('生成的备份文件超过浏览器支持的大小，请重试。')
  }
  const parts: BlobPart[] = []
  const chunkBytes = 256 * 1024 * 1024
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    parts.push(bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.byteLength)) as BlobPart)
  }
  return new Blob(parts, { type: 'application/zip' })
}

export async function readExportZipManifest(bytes: Uint8Array, validateFiles = true): Promise<ExportData> {
  const entryNames = new Set<string>()
  const files = await unzipFiles(bytes, {
    filter: (file) => {
      if (validateFiles) entryNames.add(file.name)
      return file.name === 'manifest.json'
    },
  })
  const manifestBytes = files['manifest.json']
  if (!manifestBytes) throw new Error('ZIP 中缺少 manifest.json')
  const manifest = JSON.parse(strFromU8(manifestBytes)) as ExportData
  if (validateFiles) assertExportZipFiles(manifest, (path) => entryNames.has(path))
  return manifest
}

export async function readExportZip(bytes: Uint8Array) {
  const files = await unzipFiles(bytes)
  const manifestBytes = files['manifest.json']
  if (!manifestBytes) throw new Error('ZIP 中缺少 manifest.json')
  const manifest = JSON.parse(strFromU8(manifestBytes)) as ExportData
  assertExportZipFiles(manifest, (path) => files[path] != null)
  return { manifest, files }
}

export function readExportZipFileAsDataUrl(files: Record<string, Uint8Array>, path: string): string | null {
  const bytes = files[path]
  return bytes ? bytesToDataUrl(bytes, path) : null
}

function zipFilesAsync(files: ZipFiles) {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (error, bytes) => {
      if (error) reject(error)
      else resolve(bytes)
    })
  })
}

function unzipFiles(bytes: Uint8Array, options: AsyncUnzipOptions = {}) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, options, (error, files) => {
      if (error) reject(error)
      else resolve(files)
    })
  })
}

function assertExportZipFiles(manifest: ExportData, hasFile: (path: string) => boolean) {
  const paths = [
    ...Object.values(manifest.imageFiles ?? {}).map((file) => file.path),
    ...Object.values(manifest.thumbnailFiles ?? {}).map((file) => file.path),
  ]
  const missingPath = paths.find((path) => !hasFile(path))
  if (missingPath) throw new Error(`ZIP 中缺少 ${missingPath}`)
}

function getBaseManifestEstimatedBytes(params: Omit<BuildExportZipParams, 'images' | 'thumbnailsByImageId'>) {
  const manifest = {
    version: 3,
    exportedAt: new Date(params.exportedAt).toISOString(),
    ...(params.options.exportConfig ? { settings: params.settings } : {}),
    ...(params.options.exportTasks ? { tasks: [] } : {}),
  }
  return ZIP_BASE_OVERHEAD_BYTES + strToU8(JSON.stringify(manifest)).byteLength
}

function getJsonEstimatedBytes(value: unknown) {
  return strToU8(JSON.stringify(value)).byteLength + ZIP_ENTRY_OVERHEAD_BYTES
}

function getImageCreatedAtFallback(tasks: TaskRecord[]) {
  const imageCreatedAtFallback = new Map<string, number>()
  for (const task of tasks) {
    for (const id of [
      ...(task.inputImageIds || []),
      ...(task.maskImageId ? [task.maskImageId] : []),
      ...(task.outputImages || []),
    ]) {
      const previous = imageCreatedAtFallback.get(id)
      if (previous == null || task.createdAt < previous) imageCreatedAtFallback.set(id, task.createdAt)
    }
  }
  return imageCreatedAtFallback
}

function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {
  const extension = dataUrl.match(/^data:image\/([^;,]+);base64,/)?.[1] ?? 'png'
  const binary = atob(dataUrl.replace(/^data:[^;]+;base64,/, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return { ext: extension, bytes }
}

function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? 'png'
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  }
  let binary = ''
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index])
  return `data:${mimeTypes[extension] ?? 'image/png'};base64,${btoa(binary)}`
}
