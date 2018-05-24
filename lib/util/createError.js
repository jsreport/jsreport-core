
module.exports = function (message, options = {}) {
  const { code, weak, statusCode, original } = options
  let error

  if (message == null && original != null) {
    error = original
  } else {
    error = new Error(message)

    if (original != null) {
      if (error.message == null || error.message === '') {
        error.message = `${original.message}`
      } else {
        error.message += `. ${original.message}`
      }

      if (error.stack != null && original.stack != null) {
        error.stack += `\ncaused by: ${original.stack}`
      }
    }
  }

  if (code != null) {
    error.code = code
  }

  if (weak != null) {
    error.weak = weak
  }

  if (statusCode != null) {
    error.statusCode = statusCode
  }

  return error
}
