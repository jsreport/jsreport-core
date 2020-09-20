const extend = require('node.extend.without.arrays')
const omit = require('lodash.omit')
const sharedData = require('serializator/sharedData')

module.exports = (obj, parent) => {
  const request = Object.create({}, {
    __isJsreportRequest__: {
      value: true,
      writable: false,
      configurable: false,
      enumerable: false
    }})

  request.template = extend(true, {}, obj.template)

  let parentDataIsShared = false

  if (parent) {
    request.context = Object.assign({}, request.context, omit(parent.context, 'logs'))
    request.context.isChildRequest = true
    request.options = Object.assign({}, request.options, parent.options)

    parentDataIsShared = sharedData.isSharedData(parent.data)

    if (parent.data && !parentDataIsShared) {
      const dataInput = normalizeJSONData(parent.data)
      request.data = Object.assign(Array.isArray(dataInput) ? [] : {}, dataInput)
    }
  }

  request.options = extend(true, {}, request.options, obj.options)
  request.context = extend(true, {}, request.context, obj.context)
  request.context.shared = extend(true, {}, request.context.shared)

  if (obj.data) {
    if (!sharedData.isSharedData(obj.data)) {
      const dataInput = normalizeJSONData(obj.data)
      request.data = Object.assign(Array.isArray(dataInput) ? [] : {}, request.data, dataInput)
    } else {
      request.data = obj.data
    }

    request.context.originalInputDataIsEmpty = false
  } else if (!parent) {
    request.context.originalInputDataIsEmpty = true
  }

  // initialize data if it is empty
  if (!request.data) {
    request.data = {}
  }

  if (parentDataIsShared) {
    request.data = sharedData.createFrom(request.data, parent.data)
  }

  return request
}

function normalizeJSONData (data) {
  if (typeof data === 'string') {
    return JSON.parse(data)
  }

  return data
}
