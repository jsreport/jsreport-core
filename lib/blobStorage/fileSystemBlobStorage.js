/*!
 * Copyright(c) 2014 Jan Blaha
 * FileSystem - blob storage in file system
 */

var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')

var FileSystemBlobStorage = module.exports = function (options) {
  this.storageDirectory = path.join(options.dataDirectory, 'storage')

  if (!fs.existsSync(this.storageDirectory)) {
    mkdirp.sync(this.storageDirectory)
  }
}

FileSystemBlobStorage.ensureDirectory = function (dir, cb) {
  mkdirp(dir, cb)
}

FileSystemBlobStorage.prototype.write = function (blobName, buffer, cb) {
  blobName = blobName + ''
  var self = this

  FileSystemBlobStorage.ensureDirectory(this.storageDirectory, function () {
    var blobPath = path.join(self.storageDirectory, blobName)

    fs.writeFile(blobPath, buffer, function (err) {
      if (err) {
        return cb(err)
      }

      cb(null, blobName)
    })
  })
}

FileSystemBlobStorage.prototype.read = function (blobName, cb) {
  blobName = blobName + ''

  cb(null, fs.createReadStream(path.join(this.storageDirectory, blobName)))
}

FileSystemBlobStorage.prototype.remove = function (blobName, cb) {
  var self = this

  fs.unlink(path.join(self.storageDirectory, blobName), function (err) {
    if (err) {
      return cb(err)
    }

    cb(null)
  })
}

module.exports = FileSystemBlobStorage
