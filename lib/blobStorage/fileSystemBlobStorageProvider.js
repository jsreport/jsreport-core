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
  let storageDirectory

  if (options.blobStorage.dataDirectory) {
    storageDirectory = path.isAbsolute(options.blobStorage.dataDirectory)
      ? options.blobStorage.dataDirectory : path.join(options.rootDirectory, options.blobStorage.dataDirectory)
  } else {
    storageDirectory = path.join(options.rootDirectory, 'data', 'storage')
  }

  if (!fs.existsSync(storageDirectory)) {
    mkdirp.sync(storageDirectory)
  }

  return {
    async write (blobName, buffer) {
      checkBlobName(options, storageDirectory, blobName)

      const targetPath = path.join(storageDirectory, blobName)

      if (options.allowLocalFilesAccess) {
        await new Promise((resolve, reject) => {
          mkdirp(path.dirname(targetPath), (err) => {
            if (err) { return reject(err) }
            resolve()
          })
        })
      }

      await fs.writeFileAsync(targetPath, buffer)
      return blobName
    },

    read (blobName) {
      checkBlobName(options, storageDirectory, blobName)
      return fs.createReadStream(path.join(storageDirectory, blobName))
    },

    async remove (blobName) {
      checkBlobName(options, storageDirectory, blobName)
      return fs.unlinkAsync(path.join(storageDirectory, blobName))
    },

    init () {

    }
  }
}

function checkBlobName (options, directory, blobName) {
  if (
    !options.allowLocalFilesAccess &&
    (blobName.includes(path.posix.sep) || blobName.includes(path.win32.sep))
  ) {
    throw new Error('blobName can not be a path when "options.allowLocalFilesAccess" is not enabled')
  }

  checkPathIsInsideDirectory(options, directory, blobName)
}

function checkPathIsInsideDirectory (options, directory, blobName) {
  if (!options.allowLocalFilesAccess) {
    return
  }

  if (path.posix.isAbsolute(blobName) || path.win32.isAbsolute(blobName)) {
    throw new Error('blobName can not be an absolute path')
  }

  const fullPath = path.resolve(directory, blobName)
  const relativePath = path.relative(directory, fullPath)

  if (relativePath === '' || relativePath.startsWith('..')) {
    throw new Error('blobName must be a relative path inside blobStorage directory')
  }
}
