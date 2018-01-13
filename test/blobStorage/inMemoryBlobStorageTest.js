require('should')
const Promise = require('bluebird')
const InMemoryBlobStorage = require('../../lib/blobStorage/inMemoryBlobStorage.js')

describe('inMemoryBlobStorage', function () {
  it('write and read should result into equal string', async () => {
    const blobStorage = InMemoryBlobStorage({})

    await blobStorage.write('foo', Buffer.from('Hula'))
    const stream = await blobStorage.read('foo')

    let content = ''
    stream.on('data', (buf) => (content += buf.toString()))
    return new Promise((resolve) => {
      stream.on('end', () => {
        content.should.be.eql('Hula')
        resolve()
      })
    })
  })
})
