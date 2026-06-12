import { clearFailedTasks, taskMatchesFilterStatus, taskMatchesSearchQuery, useStore } from '../store'
import Select from './Select'
import { TrashIcon } from './icons'

export default function SearchBar() {
  const searchQuery = useStore((s) => s.searchQuery)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const setFilterStatus = useStore((s) => s.setFilterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const setFilterFavorite = useStore((s) => s.setFilterFavorite)
  const tasks = useStore((s) => s.tasks)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const failedTaskIds = tasks
    .filter((task) => taskMatchesFilterStatus(task, 'error'))
    .filter((task) => {
      if (filterFavorite && !task.isFavorite) return false
      return taskMatchesSearchQuery(task, searchQuery)
    })
    .map((task) => task.id)
  const failedCount = failedTaskIds.length

  const handleClearFailed = () => {
    if (failedCount === 0) return

    setConfirmDialog({
      title: '清除失败记录',
      message: `确定清除筛选范围内的失败记录吗？\n纯失败任务会被删除；部分失败任务只会清除失败标记，保留已成功图片。共 ${failedCount} 条记录。`,
      confirmText: '清除',
      cancelText: '取消',
      tone: 'danger',
      action: () => clearFailedTasks(failedTaskIds),
    })
  }

  return (
    <div data-no-drag-select className="mt-6 mb-4 flex gap-3">
      <div className="flex gap-2 flex-shrink-0 z-20">
        <button
          onClick={() => setFilterFavorite(!filterFavorite)}
          className={`p-2.5 rounded-xl border transition-all ${
            filterFavorite
              ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-500'
              : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06]'
          }`}
          title={filterFavorite ? '取消只看收藏' : '只看收藏'}
        >
          <svg className="w-5 h-5" fill={filterFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
        <div className="relative w-28">
          <Select
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as any)}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '已完成', value: 'done' },
              { label: '生成中', value: 'running' },
              { label: '失败', value: 'error' },
            ]}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-white/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
        </div>
        <button
          type="button"
          onClick={handleClearFailed}
          disabled={failedCount === 0}
          title={failedCount > 0 ? `清除 ${failedCount} 条失败记录` : '没有失败记录'}
          aria-label={failedCount > 0 ? `清除 ${failedCount} 条失败记录` : '没有失败记录'}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 transition-all hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-white disabled:hover:text-gray-400 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300 dark:disabled:hover:bg-gray-900 dark:disabled:hover:text-gray-500"
        >
          <TrashIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="relative flex-1 z-10">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          type="text"
          placeholder="搜索提示词、参数..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        />
      </div>
    </div>
  )
}
