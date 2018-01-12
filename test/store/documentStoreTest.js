require('should')
const DocumentStore = require('../../lib/store/documentStore.js')

describe('document store', () => {
  let documentStore

  beforeEach(() => {
    documentStore = DocumentStore({
      connectionString: {name: 'memory'},
      logger: (require('..//util/testLogger.js'))()
    })
    documentStore.registerEntityType('User', {
      '_id': {'type': 'Edm.String', key: true},
      'test': {'type': 'Edm.String'},
      'num': {'type': 'Edm.Int32'}
    })
    documentStore.registerEntitySet('users', {
      entityType: 'jsreport.User'
    })

    return documentStore.init()
  })

  it('insert should not fail', async () => {
    const doc = await documentStore.collection('users').insert({test: 'foo'})
    doc._id.should.be.ok()
  })

  it('insert and find should return', async () => {
    await documentStore.collection('users').insert({test: 'foo'})
    const docs = await documentStore.collection('users').find({test: 'foo'})
    docs[0].test.should.be.eql('foo')
  })

  it('insert and update and find should return updated', async () => {
    await documentStore.collection('users').insert({test: 'foo'})
    await documentStore.collection('users').update({test: 'foo'}, {$set: {test: 'foo2'}})
    const docs = await documentStore.collection('users').find({})
    docs[0].test.should.be.eql('foo2')
  })
})
