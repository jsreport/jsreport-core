const should = require('should')
const DocumentStore = require('../../lib/store/documentStore.js')
const SchemaValidator = require('../../lib/util/schemaValidator')
const common = require('./common.js')

describe('document store', () => {
  let store
  let validator = new SchemaValidator()

  beforeEach(() => {
    validator = new SchemaValidator()

    store = DocumentStore({
      store: {provider: 'memory'},
      logger: (require('..//util/testLogger.js'))()
    }, validator)

    return store.init()
  })

  describe('type json schemas', () => {
    beforeEach(() => {
      store.registerEntityType('DemoType', {
        _id: { type: 'Edm.String', key: true },
        name: { type: 'Edm.String', publicKey: true },
        active: { type: 'Edm.Boolean' },
        timeout: { type: 'Edm.Int32' },
        rawContent: { type: 'Edm.Binary' },
        modificationDate: { type: 'Edm.DateTimeOffset' }
      }, true)

      store.registerEntityType('ComplexTemplateType', {
        _id: { type: 'Edm.String', key: true },
        name: { type: 'Edm.String', publicKey: true },
        content: { type: 'Edm.String', document: { extension: 'html', engine: true } },
        recipe: { type: 'Edm.String' },
        modificationDate: { type: 'Edm.DateTimeOffset' },
        phantom: { type: 'jsreport.PhantomType' }
      }, true)

      store.registerComplexType('ChromeType', {
        scale: { type: 'Edm.String' },
        displayHeaderFooter: { type: 'Edm.Boolean' },
        printBackground: { type: 'Edm.Boolean' },
        landscape: { type: 'Edm.Boolean' },
        pageRanges: { type: 'Edm.String' },
        format: { type: 'Edm.String' },
        width: { type: 'Edm.String' },
        height: { type: 'Edm.String' },
        marginTop: { type: 'Edm.String' },
        marginRight: { type: 'Edm.String' },
        marginBottom: { type: 'Edm.String' },
        marginLeft: { type: 'Edm.String' },
        waitForJS: { type: 'Edm.Boolean' },
        waitForNetworkIddle: { type: 'Edm.Boolean' },
        headerTemplate: { type: 'Edm.String', document: { extension: 'html', engine: true } },
        footerTemplate: { type: 'Edm.String', document: { extension: 'html', engine: true } }
      })

      store.model.entityTypes['ComplexTemplateType'].chrome = { type: 'jsreport.ChromeType' }

      store.model.entityTypes['ComplexTemplateType'].tags = {
        type: 'Collection(Edm.String)'
      }

      return store.init()
    })

    it('should generate JSON Schema for simple type def', async () => {
      const demoSchema = validator.getSchema('DemoType')

      demoSchema.should.be.eql({
        $schema: validator.schemaVersion,
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          active: { type: 'boolean' },
          timeout: { type: 'integer', minimum: -2147483648, maximum: 2147483647 },
          rawContent: { oneOf: [{ type: 'string' }, { '$jsreport-acceptsBuffer': true }] },
          modificationDate: { type: 'string', format: 'date-time' }
        }
      })
    })

    it('should generate JSON Schema for complex type def', async () => {
      const complexTemplateSchema = validator.getSchema('ComplexTemplateType')

      complexTemplateSchema.should.be.eql({
        $schema: validator.schemaVersion,
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          content: { type: 'string' },
          recipe: { type: 'string' },
          modificationDate: { type: 'string', format: 'date-time' },
          chrome: {
            type: 'object',
            properties: {
              scale: { type: 'string' },
              displayHeaderFooter: { type: 'boolean' },
              printBackground: { type: 'boolean' },
              landscape: { type: 'boolean' },
              pageRanges: { type: 'string' },
              format: { type: 'string' },
              width: { type: 'string' },
              height: { type: 'string' },
              marginTop: { type: 'string' },
              marginRight: { type: 'string' },
              marginBottom: { type: 'string' },
              marginLeft: { type: 'string' },
              waitForJS: { type: 'boolean' },
              waitForNetworkIddle: { type: 'boolean' },
              headerTemplate: { type: 'string' },
              footerTemplate: { type: 'string' }
            }
          },
          tags: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      })
    })
  })

  common(() => store)

  it('insert should fail with invalid name', async () => {
    return store.collection('templates').insert({ name: '<test' }).should.be.rejected()
  })

  it('update should fail with invalid name', async () => {
    await store.collection('templates').insert({ name: 'test' })

    return store.collection('templates').update({ name: 'test' }, { $set: { name: '/foo/other' } }).should.be.rejected()
  })

  it('findOne should return first item', async () => {
    await store.collection('templates').insert({ name: 'test' })
    const t = await store.collection('templates').findOne({ name: 'test' })
    t.name.should.be.eql('test')
  })

  it('findOne should return null if no result found', async () => {
    await store.collection('templates').insert({ name: 'test' })
    const t = await store.collection('templates').findOne({ name: 'invalid' })
    should(t).be.null()
  })
})
