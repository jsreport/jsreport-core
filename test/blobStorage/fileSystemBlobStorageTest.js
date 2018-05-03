const path = require('path')
const fs = require('fs')
const util = require('../../lib/util/util.js')
const FileSystem = require('../../lib/blobStorage/fileSystemBlobStorageProvider.js')
const tmpDir = require('os').tmpdir()
const common = require('./common.js')

describe('fileSystemBlobStorage', () => {
  let blobStorage

  beforeEach(() => {
    util.deleteFiles(path.join(tmpDir, 'test-output'))

    if (!fs.existsSync(path.join(tmpDir, 'test-output'))) {
      fs.mkdirSync(path.join(tmpDir, 'test-output'))
    }

    blobStorage = FileSystem({blobStorage: {dataDirectory: path.join(tmpDir, 'test-output')}})
  })

  common(() => blobStorage)
})
