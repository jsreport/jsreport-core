/*!
 * Copyright(c) 2015 Jan Blaha
 *
 * Blob storage running jus in memory
 */

var stream = require('stream')

var InMemoryBlobStorage = module.exports = function (options) {
  this.storage = {}
}

InMemoryBlobStorage.prototype.write = function (blobName, buffer, cb) {
  this.storage[blobName] = buffer

  cb(null, blobName)
}

InMemoryBlobStorage.prototype.read = function (blobName, cb) {
  blobName = blobName + ''

  var s = new stream.Transform()
  s.push(this.storage[blobName])
  s.push(null)
  cb(null, s)
}

InMemoryBlobStorage.prototype.remove = function (blobName, cb) {
  if (this.storage[blobName]) {
    delete this.storage[blobName]
  }

  cb(null)
}

module.exports = InMemoryBlobStorage
