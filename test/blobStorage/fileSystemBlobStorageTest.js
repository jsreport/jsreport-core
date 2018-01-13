require('should')
const path = require('path')
const fs = require('fs')
const util = require('../../lib/util/util.js')
const FileSystem = require('../../lib/blobStorage/fileSystemBlobStorage.js')
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

    blobStorage = FileSystem({dataDirectory: path.join(tmpDir, 'test-output')})
  })

  it('write and read should result into equal string', async () => {
    const ms = new Readable()
    ms.push('Hey')
    ms.push(null)

    const blobName = 'blobname'

    await blobStorage.write(blobName, Buffer.from('Hula'))

    const stream = await blobStorage.read(blobName)

    let content = ''
    stream.resume()
    stream.on('data', (buf) => (content += buf.toString()))

    return new Promise((resolve) => {
      stream.on('end', () => {
        content.should.be.eql('Hula')
        resolve()
      })
    })
  })
})
