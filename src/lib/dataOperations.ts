import type { TaskRecord } from '../types'

export function hasActiveDataOperations(tasks: TaskRecord[]) {
  return tasks.some((task) => task.status === 'running')
}
