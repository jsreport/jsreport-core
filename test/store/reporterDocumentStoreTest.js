const should = require('should')
const nanoid = require('nanoid')
const jsreport = require('../../')

describe('reporter document store', () => {
  let reporter

  beforeEach(async () => {
    reporter = await init()
  })

  it('should validate that humanReadableKey is required', async () => {
    return should(reporter.documentStore.collection('reports').insert({
      name: 'report'
    })).be.rejected()
  })

  it('should validate duplicated humanReadableKey on insert', async () => {
    await reporter.documentStore.collection('templates').insert({
      name: 'a',
      shortid: 'a'
    })

    return should(reporter.documentStore.collection('templates').insert({
      name: 'b',
      shortid: 'a'
    })).be.rejected()
  })

  it('should validate duplicated humanReadableKey on update', async () => {
    const a = await reporter.documentStore.collection('templates').insert({
      name: 'a',
      shortid: 'a'
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'b',
      shortid: 'b'
    })

    return should(reporter.documentStore.collection('templates').update({
      _id: a._id
    }, {
      $set: {
        shortid: 'b'
      }
    })).be.rejected()
  })

  it('should validate duplicated humanReadableKey on upsert', async () => {
    await reporter.documentStore.collection('templates').insert({
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

  afterEach(() => reporter && reporter.close())
})

function init (options) {
  const reporter = jsreport({ templatingEngines: { strategy: 'in-process' }, migrateEntitySetsToFolders: false, ...options })

  reporter.use({
    name: 'templates',
    main: function (reporter, definition) {
      Object.assign(reporter.documentStore.model.entityTypes.TemplateType, {
        _id: { type: 'Edm.String', key: true },
        shortid: { type: 'Edm.String' },
        name: { type: 'Edm.String', publicKey: true }
      })

      reporter.documentStore.registerEntitySet('templates', {
        entityType: 'jsreport.TemplateType',
        humanReadableKey: 'shortid',
        splitIntoDirectories: true
      })

      reporter.documentStore.registerEntityType('ReportType', {
        _id: {type: 'Edm.String', key: true},
        shortid: { type: 'Edm.String' },
        name: {type: 'Edm.String', publicKey: true}
      })

      reporter.documentStore.registerEntitySet('reports', {
        entityType: 'jsreport.ReportType',
        humanReadableKey: 'shortid'
      })

      reporter.initializeListeners.add('templates-shortid', () => {
        const col = reporter.documentStore.collection('templates')

        col.beforeInsertListeners.add('templates', (doc) => {
          doc.shortid = doc.shortid || nanoid(7)
        })
      })
    }
  })

  return reporter.init()
}
