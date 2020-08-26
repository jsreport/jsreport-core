const extend = require('node.extend.without.arrays')
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
    request.context.isChildRequest = true
    request.options = Object.assign({}, request.options, parent.options)

    if (parent.data) {
      const dataInput = normalizeJSONData(parent.data)
      request.data = Object.assign(Array.isArray(dataInput) ? [] : {}, dataInput)
    }
  }

  request.options = extend(true, {}, request.options, obj.options)
  request.context = extend(true, {}, request.context, obj.context)
  request.context.shared = extend(true, {}, request.context.shared)

  if (obj.data) {
    const dataInput = normalizeJSONData(obj.data)
    request.data = Object.assign(Array.isArray(dataInput) ? [] : {}, request.data, dataInput)
    request.context.originalInputDataIsEmpty = false
  } else if (!parent) {
    request.context.originalInputDataIsEmpty = true
  }

  // initialize data if it is empty
  if (!request.data) {
    request.data = {}
  }

  return request
}

function normalizeJSONData (data) {
  if (typeof data === 'string') {
    return JSON.parse(data)
  }

  return data
}
