const sharedData = require('serializator/sharedData')
const sharedBuffer = require('serializator/sharedBuffer')

module.exports.createData = function createData (input, useSharedData) {
  if (useSharedData) {
    return sharedData.createFrom(input)
  }

  if (typeof input === 'string') {
    return JSON.parse(input)
  }

  return input
}

module.exports.extendData = function extendData (data, change, useSharedData) {
  if (useSharedData) {
    if (!sharedData.isSharedData(data)) {
      throw new Error('Invalid input, data must be a shared data object')
    }

    data.get('content').push(sharedBuffer.createFrom(change))
  } else {
    Object.assign(data, change)
  }

  return data
}
