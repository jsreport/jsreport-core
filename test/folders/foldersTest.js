const should = require('should')
const jsreport = require('../../')
const RenderRequest = require('../../lib/render/request')

describe('folders', function () {
  let reporter

  beforeEach(() => {
    reporter = jsreport({ templatingEngines: { strategy: 'in-process' } })
    reporter.use({
      name: 'templates',
      main: function (reporter, definition) {
        Object.assign(reporter.documentStore.model.entityTypes.TemplateType, {
          _id: { type: 'Edm.String', key: true },
          name: { type: 'Edm.String', publicKey: true }
        })

        reporter.documentStore.registerEntitySet('templates', {
          entityType: 'jsreport.TemplateType',
          humanReadableKey: 'shortid',
          splitIntoDirectories: true
        })

        reporter.documentStore.registerEntityType('ReportType', {
          _id: {type: 'Edm.String', key: true},
          name: {type: 'Edm.String', publicKey: true}
        })

        reporter.documentStore.registerEntitySet('reports', {entityType: 'jsreport.ReportType'})
      }
    })

    return reporter.init()
  })

  afterEach(() => reporter.close())

  it('should extend entities model', () => {
    reporter.documentStore.model.entityTypes.TemplateType.should.have.property('folder')
    reporter.documentStore.model.entityTypes.should.have.property('FolderType')
    reporter.documentStore.model.entitySets.should.have.property('folders')
  })

  it('remove of folder should remove all entities', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'a',
      shortid: 'a'
    })

    await reporter.documentStore.collection('folders').insert({
      name: 'b',
      shortid: 'b',
      folder: {
        shortid: 'a'
      }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'c',
      shortid: 'c',
      folder: {
        shortid: 'b'
      }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'd',
      shortid: 'd',
      folder: {
        shortid: 'b'
      }
    })

    await reporter.documentStore.collection('folders').remove({name: 'a'})
    const folders = await reporter.documentStore.collection('folders').find({})
    const templates = await reporter.documentStore.collection('templates').find({})

    folders.should.have.length(0)
    templates.should.have.length(0)
  })

  it('resolveFolderFromPath should resolve folder from absolute path', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'a',
      shortid: 'a'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'b',
      shortid: 'b',
      folder: {
        shortid: 'a'
      }
    })

    const folder = await reporter.folders.resolveFolderFromPath('/a/b')
    folder.shortid.should.be.eql('a')
  })

  it('resolveFolderFromPath should return null for root objects', async () => {
    await reporter.documentStore.collection('templates').insert({
      name: 'b',
      shortid: 'b'
    })

    const folder = await reporter.folders.resolveFolderFromPath('/a/b')
    should(folder).be.null()
  })

  it('resolveFolderFromPath should resolve folder from relative path', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'a',
      shortid: 'a'
    })
    await reporter.documentStore.collection('folders').insert({
      name: 'b',
      shortid: 'b'
    })

    const folder = await reporter.folders.resolveFolderFromPath('../b', RenderRequest({
      context: {
        currentFolderPath: '/a'
      }
    }))
    folder.shortid.should.be.eql('b')
  })

  it('inserting splited entitity into root with reserved name should be blocked', () => {
    return reporter.documentStore.collection('folders').insert({
      name: 'reports'
    }).should.be.rejected()
  })

  it('inserting splited entitity into nested dir with reserved name should be fine', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'ok',
      shortid: 'ok'
    })
    return reporter.documentStore.collection('folders').insert({
      name: 'reports',
      folder: {
        shortid: 'ok'
      }
    })
  })

  it('inserting splitted entity should be always fine', () => {
    return reporter.documentStore.collection('reports').insert({
      name: 'reports'
    })
  })

  it('inserting splited entity into root with not reserved name should be fine', () => {
    return reporter.documentStore.collection('folders').insert({
      name: 'templates'
    })
  })

  it('renaming splited entitity to reserved name should be be rejected', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'ok',
      shortid: 'ok'
    })
    return reporter.documentStore.collection('folders').update({ name: 'ok' }, { $set: { name: 'reports' } }).should.be.rejected()
  })
})
