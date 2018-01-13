const request = {
  template: {},
  options: {},
  context: {}
}

module.exports = (obj) => Object.assign(Object.create(request, {
  __isJsreportRequest__: {
    value: true,
    writable: false,
    configurable: false,
    enumerable: false
  }}), obj)
