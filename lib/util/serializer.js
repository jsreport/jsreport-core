const BufferSerializer = require('buffer-serializer')

module.exports = () => {
  const serializer = new BufferSerializer()

  // make object with functions properties or undefined properties
  // be non defined properties, and make any "undefined" items in array
  // be serialized as null
  serializer.register('ObjectWithFunctionsOrUndefinedItemsType', function check (value) {
    const isObject = typeof value === 'object' && value != null
    let isObjectWithFnsOrUndefined = false

    if (isObject) {
      isObjectWithFnsOrUndefined = Object.keys(value).filter((key) => {
        return (
          typeof value[key] === 'function' ||
          typeof value[key] === 'undefined' ||
          (Array.isArray(value[key]) && value[key].indexOf(undefined) !== -1)
        )
      }).length > 0
    }

    return isObjectWithFnsOrUndefined
  }, function toBuffer (value, bufferWriter) {
    const isArray = Array.isArray(value)
    const valueCopy = Object.assign(isArray ? [] : {}, value)

    Object.keys(valueCopy).forEach((key) => {
      if (Array.isArray(valueCopy[key])) {
        const newArray = [...valueCopy[key]]
        let undefinedIndex = newArray.indexOf(undefined)

        while (undefinedIndex !== -1) {
          newArray[undefinedIndex] = null
          undefinedIndex = newArray.indexOf(undefined)
        }

        valueCopy[key] = newArray
      } else if (
        typeof valueCopy[key] === 'function' ||
        typeof valueCopy[key] === 'undefined'
      ) {
        // doing the same that other serializations logic do (JSON.stringify),
        // which is turning "undefined" or "function" properties of an object in
        // not defined properties and in case of arrays with undefined values
        // make them null
        if (isArray && typeof valueCopy[key] === 'undefined') {
          valueCopy[key] = null
        } else {
          delete valueCopy[key]
        }
      }
    })

    serializer.toBufferInternal(valueCopy, bufferWriter)
  }, function fromBuffer (bufferReader) {
    const value = serializer.fromBufferInternal(bufferReader)
    return value
  })

  return {
    register (name, ...args) {
      return serializer.register(name, ...args)
    },

    serialize (value) {
      try {
        return serializer.toBuffer(value)
      } catch (e) {
        e.message = `Error while trying to serialize a value (internal serializer). ${e.message}`
        throw e
      }
    },

    deserialize (value) {
      try {
        return serializer.fromBuffer(value)
      } catch (e) {
        e.message = `Error while trying to deserialize a value (internal serializer). ${e.message}`
        throw e
      }
    }
  }
}
