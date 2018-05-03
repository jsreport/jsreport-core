require('should')
const InMemoryBlobStorage = require('../../lib/blobStorage/inMemoryBlobStorageProvider.js')
const common = require('./common.js')

describe('inMemoryBlobStorage', () => {
  let storage

  beforeEach(() => (storage = InMemoryBlobStorage({})))
  common(() => storage)
})
