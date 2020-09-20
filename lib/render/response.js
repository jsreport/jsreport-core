const sharedBufferUtils = require('serializator/sharedBuffer')

module.exports = (obj) => {
  let resContent

  const response = Object.create({}, {
    content: {
      enumerable: true,
      configurable: false,
      get: function () {
        return resContent
      },
      set: function (val) {
        let newValue = val

        if (sharedBufferUtils.isBinaryInput(newValue)) {
          newValue = sharedBufferUtils.createFrom(newValue)
        }

        resContent = newValue

        return newValue
      }
    }
  })

  Object.assign(response, obj)

  return response
}
