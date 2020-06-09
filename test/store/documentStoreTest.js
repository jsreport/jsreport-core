const should = require('should')
const jsreport = require('../../')
const DocumentStore = require('../../lib/store/documentStore.js')
const SchemaValidator = require('../../lib/util/schemaValidator')
const Encryption = require('../../lib/util/encryption')
const common = require('./common.js')

describe('document store', () => {
  let reporter
  let store

  describe('common', async () => {
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

      store = DocumentStore({
        store: {provider: 'memory'},
        logger: (require('../util/testLogger.js'))()
      }, validator, encryption)

      await common.init(() => store)

      return store.init()
    })

    common(() => store)

    afterEach(async () => {
      if (store) {
        await common.clean(() => store)
      }

      if (reporter) {
        await reporter.close()
      }
    })
  })

  describe('with reporter', async () => {
    beforeEach(async () => {
      reporter = await init({
        store: {
          provider: 'memory'
        }
      })

      store = reporter.documentStore
    })

    it('should register internal collection', async () => {
      const type = {
        name: { type: 'Edm.String', publicKey: true }
      }

      store.registerEntityType('internalType', type)

      store.registerEntitySet('internalCol', {
        entityType: 'jsreport.internalType',
        internal: true,
        splitIntoDirectories: true
      })

      await store.init()

      should(store.internalCollection('internalCol')).be.ok()
    })

    it('should throw error when getting into duplicate with public and internal collection', async () => {
      const type = {
        name: { type: 'Edm.String', publicKey: true }
      }

      store.registerEntityType('someType', type)

      should.throws(() => {
        store.registerEntitySet('uniqueCol', {
          entityType: 'jsreport.someType',
          splitIntoDirectories: true
        })

        store.registerEntitySet('uniqueCol', {
          entityType: 'jsreport.someType',
          internal: true,
          splitIntoDirectories: true
        })
      }, /can not be registered as internal entity because it was register as public entity/)
    })

    it('should add default fields', async () => {
      should(reporter.documentStore.model.entityTypes.ReportType._id).be.eql({ key: true, type: 'Edm.String' })
      should(reporter.documentStore.model.entityTypes.ReportType.shortid).be.eql({ type: 'Edm.String' })
      should(reporter.documentStore.model.entityTypes.ReportType.creationDate).be.eql({ type: 'Edm.DateTimeOffset' })
      should(reporter.documentStore.model.entityTypes.ReportType.modificationDate).be.eql({ type: 'Edm.DateTimeOffset' })
    })

    it('should generate values for default fields', async () => {
      const doc = await reporter.documentStore.collection('reports').insert({
        name: 'foo'
      })

      should(doc._id).be.String()
      should(doc.shortid).be.String()
      should(doc.creationDate).be.Date()
      should(doc.modificationDate).be.Date()
    })

    it('should generate value for modificationDate (defaut field) on update', async () => {
      const doc = await reporter.documentStore.collection('reports').insert({
        name: 'foo'
      })

      const previousModificationDate = doc.modificationDate

      // wait a bit to simulate that the update is done in another time in the future
      await new Promise((resolve) => setTimeout(resolve, 500))

      await reporter.documentStore.collection('reports').update({
        _id: doc._id
      }, {
        $set: {
          name: 'foo2'
        }
      })

      const lastDoc = await reporter.documentStore.collection('reports').findOne({
        _id: doc._id
      })

      should(lastDoc.modificationDate).be.not.eql(previousModificationDate)
    })

    it('should skip generation of modificationDate (default field) on update when context.skipModificationDateUpdate is true', async () => {
      const doc = await reporter.documentStore.collection('reports').insert({
        name: 'foo'
      })

      const previousModificationDate = doc.modificationDate

      await reporter.documentStore.collection('reports').update({
        _id: doc._id
      }, {
        $set: {
          name: 'foo2'
        }
      }, jsreport.Request({
        context: {
          skipModificationDateUpdate: true
        }
      }))

      const lastDoc = await reporter.documentStore.collection('reports').findOne({
        _id: doc._id
      })

      should(lastDoc.modificationDate).be.eql(previousModificationDate)
    })

    it('should not add default fields if they are already defined', async () => {
      const doc = await reporter.documentStore.collection('custom').insert({
        name: 'foo'
      })

      // _id is handled by the store provider so it will always have a value
      should(doc._shortid).be.undefined()
      should(doc.creationDate).be.undefined()
      should(doc.modificationDate).be.undefined()
    })

    it('insert should fail with invalid name', async () => {
      return store.collection('templates').insert({ name: '<test' }).should.be.rejected()
    })

    it('insert should fail with invalid name (dot)', async () => {
      return store.collection('templates').insert({ name: '.' }).should.be.rejected()
    })

    it('insert should fail with invalid name (two dot)', async () => {
      return store.collection('templates').insert({ name: '..' }).should.be.rejected()
    })

    it('insert should fail with empty string in name', async () => {
      return store.collection('templates').insert({ name: '' }).should.be.rejected()
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

    it('should validate that humanReadableKey is required', async () => {
      return should(store.collection('foo').insert({
        name: 'some'
      })).be.rejected()
    })

    it('should validate duplicated humanReadableKey on insert', async () => {
      await store.collection('templates').insert({
        name: 'a',
        shortid: 'a'
      })

      return should(store.collection('templates').insert({
        name: 'b',
        shortid: 'a'
      })).be.rejected()
    })

    it('should call beforeFindListener without user in req.context during insert', async () => {
      reporter.documentStore.collection('templates').beforeFindListeners.add('custom-find-listener', (q, p, req) => {
        return should(req.context.user).be.undefined()
      })

      // this test validates that user is not taken into consideration during validation listeners
      const req = reporter.Request({ context: { user: { name: 'person' } } })

      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        shortid: 'a'
      }, req)

      req.context.user.name.should.be.eql('person')
    })

    it('should validate duplicated humanReadableKey on update', async () => {
      const a = await store.collection('templates').insert({
        name: 'a',
        shortid: 'a'
      })

      await store.collection('templates').insert({
        name: 'b',
        shortid: 'b'
      })

      return should(store.collection('templates').update({
        _id: a._id
      }, {
        $set: {
          shortid: 'b'
        }
      })).be.rejected()
    })

    it('should validate duplicated humanReadableKey on upsert', async () => {
      await store.collection('templates').insert({
        name: 'a',
        shortid: 'a'
      })

      return should(reporter.documentStore.collection('templates').update({
        name: 'b'
      }, {
        $set: {
          name: 'b',
          shortid: 'a'
        }
      }, { upsert: true })).be.rejected()
    })

    describe('type json schemas', () => {
      describe('schema generation', () => {
        beforeEach(() => {
          store.registerEntityType('DemoType', {
            _id: { type: 'Edm.String' },
            name: { type: 'Edm.String', publicKey: true },
            active: { type: 'Edm.Boolean' },
            timeout: { type: 'Edm.Int32' },
            rawContent: { type: 'Edm.Binary' },
            modificationDate: { type: 'Edm.DateTimeOffset' }
          }, true)

          store.registerEntityType('ComplexTemplateType', {
            _id: { type: 'Edm.String' },
            name: { type: 'Edm.String', publicKey: true },
            content: { type: 'Edm.String', document: { extension: 'html', engine: true } },
            recipe: { type: 'Edm.String' },
            phantom: { type: 'jsreport.PhantomType' },
            modificationDate: { type: 'Edm.DateTimeOffset' }
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
          const demoSchema = reporter.entityTypeValidator.getSchema('DemoType')

          demoSchema.should.be.eql({
            $schema: reporter.entityTypeValidator.schemaVersion,
            type: 'object',
            properties: {
              _id: { type: 'string' },
              name: { type: 'string' },
              active: { type: 'boolean' },
              timeout: { type: 'integer', minimum: -2147483648, maximum: 2147483647 },
              rawContent: { anyOf: [{ type: 'null' }, { type: 'string' }, { '$jsreport-acceptsBuffer': true }] },
              modificationDate: { anyOf: [{ '$jsreport-stringToDate': true }, { '$jsreport-acceptsDate': true }] }
            }
          })
        })

        it('should generate JSON Schema for complex type def', async () => {
          const complexTemplateSchema = reporter.entityTypeValidator.getSchema('ComplexTemplateType')

          complexTemplateSchema.should.be.eql({
            $schema: reporter.entityTypeValidator.schemaVersion,
            type: 'object',
            properties: {
              _id: { type: 'string' },
              name: { type: 'string' },
              content: { type: 'string' },
              recipe: { type: 'string' },
              modificationDate: { anyOf: [{ '$jsreport-stringToDate': true }, { '$jsreport-acceptsDate': true }] },
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

      describe('validation', async () => {
        it('should coerce input while doing insert', async () => {
          let input

          store.collection('validationTest').beforeInsertListeners.add('test', (doc) => {
            input = doc
          })

          await store.collection('validationTest').insert({
            name: 'testing',
            alias: 1,
            followers: '345',
            owner: 1,
            customDate: new Date(),
            customDate2: '2019-10-11T17:41:29.453Z'
          })

          should(input.alias).be.eql('1')
          should(input.followers).be.eql(345)
          should(input.owner).be.eql(true)
          should(input.customDate).be.Date()
          should(input.customDate2).be.Date()
        })

        it('should throw when validation fails while doing insert', async () => {
          return should(store.collection('validationTest').insert({
            name: 'testing',
            followers: 'foo',
            owner: 'fail'
          })).be.rejectedWith(/input contain values that does not match the schema/)
        })

        it('should coerce input while doing update', async () => {
          let input

          store.collection('validationTest').beforeUpdateListeners.add('test', (q, u) => {
            input = u.$set
          })

          await store.collection('validationTest').insert({
            name: 'testing',
            alias: 't',
            followers: 200,
            owner: true,
            customDate: new Date(),
            customDate2: '2019-10-11T17:41:29.453Z'
          })

          await store.collection('validationTest').update({
            name: 'testing'
          }, {
            $set: {
              alias: 1,
              followers: '345',
              owner: 1,
              customDate2: '2019-10-12T17:41:29.453Z'
            }
          })

          should(input.alias).be.eql('1')
          should(input.followers).be.eql(345)
          should(input.owner).be.eql(true)
          should(input.customDate2).be.Date()
        })

        it('should throw when validation fails while doing update', async () => {
          await store.collection('validationTest').insert({
            name: 'testing',
            alias: 't',
            followers: 200,
            owner: true
          })

          return should(store.collection('validationTest').update({
            name: 'testing'
          }, {
            $set: {
              followers: 'foo',
              owner: 'fail'
            }
          })).be.rejectedWith(/input contain values that does not match the schema/)
        })
      })
    })

    afterEach(() => reporter && reporter.close())
  })
})

function init (options) {
  const reporter = jsreport({
    templatingEngines: { strategy: 'in-process' },
    migrateEntitySetsToFolders: false,
    ...options
  })

  reporter.use({
    name: 'templates',
    main: function (reporter, definition) {
      Object.assign(reporter.documentStore.model.entityTypes.TemplateType, {
        name: { type: 'Edm.String', publicKey: true }
      })

      reporter.documentStore.registerEntitySet('templates', {
        entityType: 'jsreport.TemplateType',
        splitIntoDirectories: true
      })

      reporter.documentStore.registerEntityType('ReportType', {
        name: { type: 'Edm.String', publicKey: true }
      })

      reporter.documentStore.registerEntityType('ValidationTestType', {
        name: { type: 'Edm.String', publicKey: true },
        alias: { type: 'Edm.String' },
        followers: { type: 'Edm.Int32' },
        owner: { type: 'Edm.Boolean' },
        customDate: { type: 'Edm.DateTimeOffset' },
        customDate2: { type: 'Edm.DateTimeOffset' },
        creationDate: { type: 'Edm.DateTimeOffset' }
      })

      reporter.documentStore.registerEntityType('FooType', {
        name: { type: 'Edm.String', publicKey: true },
        hummanKey: { type: 'Edm.String' }
      })

      // entity that define default fields just for the test cases
      reporter.documentStore.registerEntityType('CustomType', {
        _id: { type: 'Edm.String' },
        name: { type: 'Edm.String', publicKey: true },
        shortid: { type: 'Edm.String' },
        creationDate: { type: 'Edm.DateTimeOffset' },
        modificationDate: { type: 'Edm.DateTimeOffset' }
      })

      reporter.documentStore.registerEntitySet('reports', {
        entityType: 'jsreport.ReportType'
      })

      reporter.documentStore.registerEntitySet('foo', {
        entityType: 'jsreport.FooType',
        humanReadableKey: 'hummanKey'
      })

      reporter.documentStore.registerEntitySet('custom', {
        entityType: 'jsreport.CustomType'
      })

      reporter.documentStore.registerEntitySet('validationTest', {
        entityType: 'jsreport.ValidationTestType'
      })
    }
  })

  return reporter.init()
}
