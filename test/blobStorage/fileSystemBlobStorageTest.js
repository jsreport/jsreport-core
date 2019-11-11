const path = require('path')
const fs = require('fs')
const util = require('../../lib/util/util.js')
const FileSystem = require('../../lib/blobStorage/fileSystemBlobStorageProvider.js')
const tmpDir = require('os').tmpdir()
const common = require('./common.js')

const outputDir = path.join(tmpDir, 'test-output')

describe('fileSystemBlobStorage', () => {
  let blobStorage

  describe('common', () => {
    beforeEach(() => {
      util.deleteFiles(outputDir)

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir)
      }

      blobStorage = FileSystem({ blobStorage: { dataDirectory: outputDir } })
    })

    common(() => blobStorage)
  })

  describe('when options.allowLocalFilesAccess=false', () => {
    beforeEach(() => {
      util.deleteFiles(path.join(tmpDir, 'test-output'))

      if (!fs.existsSync(path.join(tmpDir, 'test-output'))) {
        fs.mkdirSync(path.join(tmpDir, 'test-output'))
      }

      blobStorage = FileSystem({ allowLocalFilesAccess: false, blobStorage: { dataDirectory: outputDir } })
    })

    describe('should now allow blobName as path', () => {
      it('write', async () => {
        return blobStorage.write('dir/foo', Buffer.from('hula')).should.be.rejectedWith(/blobName can not be a path/)
      })

      it('read', async () => {
        const exec = async () => blobStorage.read('dir/foo')
        return exec().should.be.rejectedWith(/blobName can not be a path/)
      })

      it('remove', async () => {
        return blobStorage.remove('dir/foo').should.be.rejectedWith(/blobName can not be a path/)
      })
    })
  })

  describe('when options.allowLocalFilesAccess=true', () => {
    beforeEach(() => {
      util.deleteFiles(outputDir)

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir)
      }

      blobStorage = FileSystem({ allowLocalFilesAccess: true, blobStorage: { dataDirectory: outputDir } })
    })

    describe('should not allow blobName as full path', () => {
      it('write', async () => {
        return blobStorage.write('/dir/foo', Buffer.from('hula')).should.be.rejectedWith(/blobName can not be an absolute path/)
      })

      it('read', async () => {
        const exec = async () => blobStorage.read('/dir/foo')
        return exec().should.be.rejectedWith(/blobName can not be an absolute path/)
      })

      it('remove', async () => {
        return blobStorage.remove('/dir/foo').should.be.rejectedWith(/blobName can not be an absolute path/)
      })
    })

    describe('should not allow blobName as relative path that results in path outside blobStorage directory', () => {
      it('write', async () => {
        return blobStorage.write('../../dir/foo', Buffer.from('hula')).should.be.rejectedWith(/blobName must be a relative path inside blobStorage directory/)
      })

      it('read', async () => {
        const exec = async () => blobStorage.read('../../dir/foo')
        return exec().should.be.rejectedWith(/blobName must be a relative path inside blobStorage directory/)
      })

      it('remove', async () => {
        return blobStorage.remove('../../dir/foo').should.be.rejectedWith(/blobName must be a relative path inside blobStorage directory/)
      })
    })

    describe('should work with correct blobName', () => {
      it('write', async () => {
        const blobName = 'dir/foo'

        await blobStorage.write(blobName, Buffer.from('hula'))

        const targetPath = path.join(outputDir, blobName)

        fs.existsSync(targetPath).should.be.True()
      })

      it('read', async () => {
        const blobName = 'dir/foo'

        await blobStorage.write(blobName, Buffer.from('hula'))

        const content = await new Promise((resolve, reject) => {
          const stream = blobStorage.read(blobName)
          let buf = []

          stream.on('data', (chunk) => {
            buf.push(chunk)
          })

          stream.on('end', () => resolve(Buffer.concat(buf).toString()))

          stream.on('error', reject)
        })

        content.should.be.eql('hula')
      })

      it('remove', async () => {
        const blobName = 'dir/foo'

        await blobStorage.write(blobName, Buffer.from('hula'))

        const targetPath = path.join(outputDir, blobName)

        fs.existsSync(targetPath).should.be.True()

        await blobStorage.remove(blobName)

        fs.existsSync(targetPath).should.be.False()
      })
    })
  })
})
