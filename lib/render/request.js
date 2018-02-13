module.exports = (obj) => {
  const request = Object.create({}, {
    __isJsreportRequest__: {
      value: true,
      writable: false,
      configurable: false,
      enumerable: false
    }})

  Object.assign(request, obj)
  request.template = request.template || {}
  request.options = request.options || {}
  request.context = request.context || {}

  return request
}
