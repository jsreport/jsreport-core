/*!
 * Copyright(c) 2014 Jan Blaha
 * FileSystem - blob storage in file system
 */

const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const Promise = require('bluebird')
Promise.promisifyAll(fs)

module.exports = (options) => {
  const storageDirectory = path.join(options.dataDirectory, 'storage')

  if (!fs.existsSync(storageDirectory)) {
    mkdirp.sync(storageDirectory)
  }

  return {
    async write (blobName, buffer) {
      await fs.writeFileAsync(path.join(storageDirectory, blobName), buffer)
      return blobName
    },

    read (blobName) {
      return fs.createReadStream(path.join(storageDirectory, blobName))
    },

    remove (blobName) {
      return fs.unlinkAsync(path.join(storageDirectory, blobName))
    },

    init () {

    }
  }
}
