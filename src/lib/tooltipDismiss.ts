const bus = new EventTarget()
const EVENT_NAME = 'dismiss-tooltips'

export function dismissAllTooltips() {
  bus.dispatchEvent(new Event(EVENT_NAME))
}

export function onDismissTooltips(callback: () => void): () => void {
  bus.addEventListener(EVENT_NAME, callback)
  return () => bus.removeEventListener(EVENT_NAME, callback)
}
