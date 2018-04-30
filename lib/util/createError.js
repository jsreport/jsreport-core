
module.exports = function (message, options = {}) {
  const { code, weak, statusCode, original } = options
  const error = new Error(message)

  if (code != null) {
    error.code = code
  }

  if (weak != null) {
    error.weak = weak
  }

  if (statusCode != null) {
    error.statusCode = statusCode
  }

  if (original != null) {
    error.message += `. ${original.message}`

    if (error.stack != null && original.stack != null) {
      error.stack += `\ncaused by: ${original.stack}`
    }
  }

  return error
}
