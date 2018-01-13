/*!
 * Copyright(c) 2015 Jan Blaha
 *
 * Blob storage running jus in memory
 */

const stream = require('stream')

module.exports = (options) => {
  const storage = {}

  return {
    write (blobName, buffer) {
      storage[blobName] = buffer
      return blobName
    },

    read (blobName) {
      const s = new stream.Transform()
      s.push(storage[blobName])
      s.push(null)
      return s
    },

    remove (blobName) {
      delete storage[blobName]
    }
  }
}
