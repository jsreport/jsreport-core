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

  it('insert should fail with invalid name', async () => {
    return store().collection('templates').insert({ name: '<test' }).should.be.rejected()
  })

  it('update should fail with invalid name', async () => {
    await store().collection('templates').insert({ name: 'test' })

    return store().collection('templates').update({ name: 'test' }, { $set: { name: '/foo/other' } }).should.be.rejected()
  })
})
