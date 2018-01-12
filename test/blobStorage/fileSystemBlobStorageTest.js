const assert = require('assert')
const path = require('path')
const fs = require('fs')
const util = require('../../lib/util/util.js')
const FileSystem = require('../../lib/blobStorage/fileSystemBlobStorage.js')
const Buffer = require('safe-buffer').Buffer
const tmpDir = require('os').tmpdir()
const Readable = require('stream').Readable
const Promise = require('bluebird')

describe('fileSystemBlobStorage', () => {
  let blobStorage

  beforeEach(() => {
    util.deleteFiles(path.join(tmpDir, 'test-output'))

    if (!fs.existsSync(path.join(tmpDir, 'test-output'))) {
      fs.mkdirSync(path.join(tmpDir, 'test-output'))
    }

    blobStorage = Promise.promisifyAll(new FileSystem({dataDirectory: path.join(tmpDir, 'test-output')}))
  })

  it('write and read should result into equal string', async () => {
    const ms = new Readable()
    ms.push('Hey')
    ms.push(null)

    const blobName = 'blobname'

    await blobStorage.writeAsync(blobName, new Buffer('Hula'))

    const stream = await blobStorage.readAsync(blobName)

    let content = ''
    stream.resume()
    stream.on('data', function (buf) {
      content += buf.toString()
    })

    return new Promise((resolve) => {
      stream.on('end', function () {
        assert.equal('Hula', content)
        resolve()
      })
    })
  })
})
