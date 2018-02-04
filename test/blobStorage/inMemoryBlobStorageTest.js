require('should')
const InMemoryBlobStorage = require('../../lib/blobStorage/inMemoryBlobStorage.js')
const common = require('./common.js')

describe('inMemoryBlobStorage', () => {
  let storage

  beforeEach(() => (storage = InMemoryBlobStorage({})))
  common(() => storage)
})
