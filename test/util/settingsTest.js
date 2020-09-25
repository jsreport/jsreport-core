const assert = require('assert')
const should = require('should')
const Settings = require('../../lib/util/settings.js')
const SchemaValidator = require('../../lib/util/schemaValidator')
const Encryption = require('../../lib/util/encryption')
const DocumentStore = require('../../lib/store/documentStore.js')

describe('Settings', function () {
  let settings
  let documentStore
  beforeEach(async () => {
    const validator = new SchemaValidator()

    const encryption = Encryption({
      options: {
        encryption: {
          secretKey: 'foo1234567891234',
          enabled: true
        }
      }
    })

    settings = new Settings()

    documentStore = DocumentStore({
      store: { provider: 'memory', inMemory: true },
      logger: require('..//util/testLogger.js')()
    }, validator, encryption)

    settings.registerEntity(documentStore)

    await documentStore.init()
    await settings.init(documentStore)
  })

  it('add update get should result into updated value', async () => {
    await settings.add('test', 'val')
    await settings.set('test', 'modified')
    assert.strictEqual('modified', settings.get('test').value)
  })

  it('add and get should result into same value', async () => {
    await settings.add('test', 'val')
    assert.strictEqual('val', settings.get('test').value)
  })

  it('should remove incompatible settings during startup', async () => {
    await documentStore.collection('settings').insert({ key: 'foo', value: 'test' })
    await documentStore.collection('settings').insert({ key: 'foo2', value: JSON.stringify({ x: 'a' }) })
    await settings.init(documentStore)
    const val = await settings.findValue('foo')
    should.not.exist(val)
    const val2 = await settings.findValue('foo2')
    val2.x.should.be.eql('a')
  })
})
