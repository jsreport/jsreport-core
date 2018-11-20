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

  it('inserting duplicated entity name into the root should fail', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'duplicate',
      shortid: 'duplicate'
    })
    try {
      await reporter.documentStore.collection('templates').insert({
        name: 'duplicate'
      })
      throw new Error('Should failed')
    } catch (e) {
      e.code.should.be.eql('DUPLICATED_ENTITY')
    }
  })

  it('inserting duplicated entity name into differnt folder should work', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'a',
      shortid: 'a'
    })
    await reporter.documentStore.collection('folders').insert({
      name: 'b',
      shortid: 'b'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'duplicate',
      folder: { shortid: 'a' }
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'duplicate',
      folder: { shortid: 'b' }
    })
  })

  it('inserting duplicated entity name into the nested should fail', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'a',
      shortid: 'a'
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'duplicate',
      folder: { shortid: 'a' }
    })

    return reporter.documentStore.collection('templates').insert({
      name: 'duplicate',
      folder: { shortid: 'a' }
    }).should.be.rejected()
  })

  it('should not validate duplicated name for the current entity', async () => {
    await reporter.documentStore.collection('templates').insert({
      name: 'a',
      content: 'a'
    })

    return reporter.documentStore.collection('templates').update({ name: 'a' }, { $set: { name: 'a', content: 'foo' } })
  })

  it('should reject when updating folder and the name is duplicated', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'a',
      shortid: 'a'
    })

    await reporter.documentStore.collection('folders').insert({
      name: 'b',
      shortid: 'b'
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'a',
      shortid: 'aa',
      folder: { shortid: 'a' }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'a',
      shortid: 'ab',
      folder: { shortid: 'b' }
    })

    return reporter.documentStore.collection('templates').update(
      { shortid: 'ab' },
      { $set: { folder: { shortid: 'a' } } }).should.be.rejected()
  })

  it('should reject when moving entity to the root and there is duplicate', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'a'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'a',
      shortid: 'aa',
      folder: { shortid: 'a' }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'a',
      shortid: 'ar'
    })

    return reporter.documentStore.collection('templates').update(
      { shortid: 'aa' },
      { $set: { folder: null } }).should.be.rejected()
  })
})
