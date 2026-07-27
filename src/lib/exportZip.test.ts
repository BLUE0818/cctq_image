import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from './apiProfiles'
import { DEFAULT_PARAMS, type ExportData, type TaskRecord } from '../types'
import { hasActiveDataOperations } from './dataOperations'
import {
  buildExportZip,
  getExportImageEstimatedBytes,
  getExportZipPlan,
  readExportZip,
  readExportZipFileAsDataUrl,
  readExportZipManifest,
} from './exportZip'

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: 'prompt',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    maskTargetImageId: null,
    maskImageId: null,
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

const exportedAt = 1_700_000_000_000

describe('export zip', () => {
  it('builds and reads a backup without changing the single-file manifest shape', async () => {
    const image = {
      id: 'image-a',
      dataUrl: 'data:image/png;base64,AQID',
      createdAt: exportedAt - 1000,
      source: 'generated' as const,
    }
    const thumbnail = {
      id: image.id,
      thumbnailDataUrl: 'data:image/png;base64,BAUG',
      width: 64,
      height: 32,
      thumbnailVersion: 2,
    }
    const result = await buildExportZip({
      options: { exportConfig: true, exportTasks: true },
      exportedAt,
      settings: DEFAULT_SETTINGS,
      tasks: [task({ outputImages: [image.id] })],
      images: [image],
      thumbnailsByImageId: new Map([[image.id, thumbnail]]),
    })

    expect(result.manifest.backupPart).toBeUndefined()
    expect(result.manifest.tasks).toHaveLength(1)
    expect(result.manifest.imageFiles?.[image.id]).toMatchObject({
      path: 'images/image-a.png',
      createdAt: exportedAt - 1000,
      source: 'generated',
      width: 64,
      height: 32,
    })

    const parsed = await readExportZip(result.bytes)
    expect(readExportZipFileAsDataUrl(parsed.files, parsed.manifest.imageFiles![image.id].path)).toBe(image.dataUrl)
    expect(readExportZipFileAsDataUrl(parsed.files, parsed.manifest.thumbnailFiles![image.id].path)).toBe(thumbnail.thumbnailDataUrl)
  })

  it('splits every stored image, including images not referenced by tasks', async () => {
    const images = [
      { id: 'image-a', dataUrl: 'data:image/png;base64,AQID' },
      { id: 'image-b', dataUrl: 'data:image/png;base64,BAUG' },
    ]
    const params = {
      options: { exportConfig: true, exportTasks: true },
      exportedAt,
      settings: DEFAULT_SETTINGS,
      tasks: [task()],
      imageTasks: [task()],
    }
    const plan = getExportZipPlan(
      params,
      images.map((image) => ({ id: image.id, bytes: 250_000 })),
      { maxBytes: 1_800_000, partBytes: 1_400_000 },
    )

    expect(plan.length).toBeGreaterThan(1)
    expect(plan.flatMap((part) => part.imageIds)).toEqual(images.map((image) => image.id))

    const exportedIds = [] as string[]
    for (const part of plan) {
      const partImages = images.filter((image) => part.imageIds.includes(image.id))
      const result = await buildExportZip({
        ...params,
        tasks: part.tasks,
        images: partImages,
        thumbnailsByImageId: new Map(),
        includeManifestData: part.includeBaseData,
      })
      exportedIds.push(...Object.keys(result.manifest.imageFiles ?? {}))
    }
    expect(exportedIds).toEqual(images.map((image) => image.id))
  })

  it('splits task metadata across parts', () => {
    const tasks = [
      task({ id: 'task-a', prompt: 'a'.repeat(300_000) }),
      task({ id: 'task-b', prompt: 'b'.repeat(300_000) }),
    ]
    const plan = getExportZipPlan({
      options: { exportConfig: true, exportTasks: true },
      exportedAt,
      settings: DEFAULT_SETTINGS,
      tasks,
    }, [], { maxBytes: 1_800_000, partBytes: 1_400_000 })

    expect(plan).toHaveLength(2)
    expect(plan.flatMap((part) => part.tasks).map((item) => item.id)).toEqual(['task-a', 'task-b'])
  })

  it('keeps config-only exports in one part', () => {
    const plan = getExportZipPlan({
      options: { exportConfig: true, exportTasks: false },
      exportedAt,
      settings: DEFAULT_SETTINGS,
      tasks: [],
    }, [], { maxBytes: 1_800_000, partBytes: 1_100_000 })

    expect(plan).toEqual([{ imageIds: [], tasks: [], includeBaseData: true }])
  })

  it('validates referenced files while reading only the manifest', async () => {
    const manifest: ExportData = {
      version: 3,
      exportedAt: new Date(exportedAt).toISOString(),
      imageFiles: { missing: { path: 'images/missing.png' } },
    }
    const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) })

    await expect(readExportZipManifest(bytes)).rejects.toThrow('ZIP 中缺少 images/missing.png')
  })

  it('estimates image and thumbnail payload bytes', () => {
    const image = { id: 'image-a', dataUrl: 'data:image/png;base64,AQID' }
    const thumbnail = { id: image.id, thumbnailDataUrl: 'data:image/png;base64,BAUG' }

    expect(getExportImageEstimatedBytes(image, thumbnail)).toBeGreaterThan(6)
  })
})

describe('data operation locking', () => {
  it('detects running tasks', () => {
    expect(hasActiveDataOperations([task({ status: 'running' })])).toBe(true)
    expect(hasActiveDataOperations([task()])).toBe(false)
  })
})
