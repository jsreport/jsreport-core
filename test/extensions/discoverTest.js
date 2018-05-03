const discover = require('../../lib/extensions/discover')
const Logger = require('../util/testLogger')
const os = require('os')
require('should')

describe('discover', () => {
  let config

  beforeEach(() => {
    config = {
      logger: Logger(),
      tempCoreDirectory: os.tmpdir(),
      rootDirectory: __dirname
    }
  })

  it('should find the extension', async () => {
    const extensions = await discover(config)
    extensions.should.have.length(1)
  })
})
