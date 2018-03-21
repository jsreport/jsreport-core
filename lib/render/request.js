const extend = require('node.extend')
const omit = require('lodash.omit')

module.exports = (obj, parent) => {
  const request = Object.create({}, {
    __isJsreportRequest__: {
      value: true,
      writable: false,
      configurable: false,
      enumerable: false
    }})

  request.template = extend(true, {}, obj.template)

  if (parent) {
    request.context = Object.assign({}, request.context, omit(parent.context, 'logs'))
    request.options = Object.assign({}, request.options, parent.options)
    request.options.isChildRequest = true
    if (parent.data) {
      request.data = Object.assign({}, parent.data)
    }
  }

  request.options = extend(true, {}, request.options, obj.options)
  request.context = extend(true, {}, request.context, obj.context)

  if (obj.data) {
    request.data = Object.assign({}, request.data, obj.data)
  }

  return request
}
