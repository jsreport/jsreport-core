const { sharedBuffer } = require('serializator')

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

        if (sharedBuffer.isBinaryInput(newValue)) {
          newValue = sharedBuffer.createFrom(newValue)
        }

        resContent = newValue

        return newValue
      }
    }
  })

  Object.assign(response, obj)

  return response
}
