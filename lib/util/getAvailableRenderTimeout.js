
module.exports = function getAvailableRenderTimeout (reporter, req, defaultValue) {
  const timeoutLimit = req.context.timeoutLimit

  if (timeoutLimit == null) {
    return defaultValue
  }

  const start = req.context.startTimestamp
  const now = new Date().getTime()
  const spent = now - start
  const availableTimeout = timeoutLimit - spent

  if (availableTimeout <= 0) {
    throw reporter.createError(`Render timeout after ${timeoutLimit}ms`)
  }

  return availableTimeout
}
