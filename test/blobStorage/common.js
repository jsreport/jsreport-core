require('should')
const Promise = require('bluebird')

module.exports = (storage) => {
  it('write and read', async () => {
    await storage().write('foo', Buffer.from('hula'))
    const stream = await storage().read('foo')

    let content = ''
    stream.on('data', (buf) => (content += buf.toString()))
    stream.resume()

    return new Promise((resolve) => {
      stream.on('end', () => {
        content.should.be.eql('hula')
        resolve()
      })
    })
  })

  it('write remove read should fail', async () => {
    await storage().write('foo', Buffer.from('hula'))
    await storage().remove('foo')
    const stream = await storage().read('foo')
    return new Promise((resolve, reject) => {
      stream.on('error', () => resolve())
      stream.resume()
    })
  })
}
