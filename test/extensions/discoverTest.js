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
    // discover founds also intentional duplicat which is filtered out in extension manager
    // there is no extra test for duplicate filtering because everything else would fail
    ;(extensions.length > 0).should.be.true()
  })
})
