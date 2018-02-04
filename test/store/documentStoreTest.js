require('should')
const DocumentStore = require('../../lib/store/documentStore.js')
const common = require('./common.js')

describe('document store', () => {
  let store

  beforeEach(() => {
    store = DocumentStore({
      connectionString: {name: 'memory'},
      logger: (require('..//util/testLogger.js'))()
    })

    return store.init()
  })

  common(() => store)
})
