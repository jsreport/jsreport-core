const should = require('should')
const jsreport = require('../../')
const RenderRequest = require('../../lib/render/request')

function init (options) {
  const reporter = jsreport({ templatingEngines: { strategy: 'in-process' }, migrateEntitySetsToFolders: false, ...options })
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
}

describe('folders', function () {
  let reporter

  beforeEach(async () => {
    reporter = await init()
  })

  afterEach(() => reporter.close())

  describe('basic', () => {
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

    it('resolveEntityPath should return full hierarchy path of entity', async () => {
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

      const t = await reporter.documentStore.collection('templates').insert({
        name: 'c',
        shortid: 'c',
        folder: {
          shortid: 'b'
        }
      })

      const fullPath = await reporter.folders.resolveEntityPath(t, 'templates')
      fullPath.should.be.eql('/a/b/c')
    })

    it('resolveEntityPath should throw when some part of the hierarchy does not exists', async () => {
      await reporter.documentStore.collection('folders').insert({
        name: 'a',
        shortid: 'a'
      })

      const t = await reporter.documentStore.collection('templates').insert({
        name: 'b',
        shortid: 'b',
        folder: {
          shortid: 'none'
        }
      })

      try {
        await reporter.folders.resolveEntityPath(t, 'templates')
        throw new Error('it was supposed to throw error instead of return')
      } catch (e) {
        e.message.includes('Folder with shortid').should.be.True()
      }
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

    it('inserting duplicated entity name into different folder should work', async () => {
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

    it('duplicate entity name validation should be case insensitive', async () => {
      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        content: 'a'
      })

      reporter.documentStore.collection('templates').insert({
        name: 'A',
        content: 'a'
      }).should.be.rejected()
    })
  })

  describe('move/copy', () => {
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

    it('should move file', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2'
      })

      const a = await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'c',
        folder: { shortid: folder2.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'templates',
          id: a._id
        },
        target: {
          shortid: folder2.shortid
        }
      })

      const templatesInFolder2 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder2.shortid
        }
      })).map((e) => e.name).sort()

      templatesInFolder2.should.eql(['a', 'c'])
    })

    it('should move folder', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2'
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'c',
        folder: { shortid: folder2.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'folders',
          id: folder2._id
        },
        target: {
          shortid: folder1.shortid
        }
      })

      const foldersInFolder1 = (await reporter.documentStore.collection('folders').find({
        folder: {
          shortid: folder1.shortid
        }
      })).map((e) => e.name).sort()

      const templatesInFolder1 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder1.shortid
        }
      })).map((e) => e.name).sort()

      const templatesInFolder2 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder2.shortid
        }
      })).map((e) => e.name).sort()

      foldersInFolder1.should.eql(['folder2'])
      templatesInFolder1.should.eql(['a', 'b'])
      templatesInFolder2.should.eql(['c'])
    })

    it('should copy file', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2'
      })

      const a = await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'c',
        folder: { shortid: folder2.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'templates',
          id: a._id
        },
        target: {
          shortid: folder2.shortid
        },
        shouldCopy: true
      })

      const templatesInFolder1 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder1.shortid
        }
      })).map((e) => e.name).sort()

      const templatesInFolder2 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder2.shortid
        }
      })).map((e) => e.name).sort()

      templatesInFolder1.should.eql(['a', 'b'])
      templatesInFolder2.should.eql(['a', 'c'])
    })

    it('should replace when found duplicate during move file', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2'
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        content: 'b',
        folder: { shortid: folder1.shortid }
      })

      const bInFolder2 = await reporter.documentStore.collection('templates').insert({
        name: 'b',
        content: 'b2',
        folder: { shortid: folder2.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'templates',
          id: bInFolder2._id
        },
        target: {
          shortid: folder1.shortid
        },
        shouldCopy: false,
        shouldReplace: true
      })

      const templatesInFolder1 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder1.shortid
        }
      }))

      const templatesInFolder2 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder2.shortid
        }
      }))

      templatesInFolder1.map((e) => e.name).sort().should.eql(['a', 'b'])
      templatesInFolder2.map((e) => e.name).sort().should.eql([])

      templatesInFolder1.find((e) => e.name === 'b').content.should.eql('b2')
    })

    it('should replace when found duplicate during copy file', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2'
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        content: 'b',
        folder: { shortid: folder1.shortid }
      })

      const bInFolder2 = await reporter.documentStore.collection('templates').insert({
        name: 'b',
        content: 'b2',
        folder: { shortid: folder2.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'templates',
          id: bInFolder2._id
        },
        target: {
          shortid: folder1.shortid
        },
        shouldCopy: true,
        shouldReplace: true
      })

      const templatesInFolder1 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder1.shortid
        }
      }))

      const templatesInFolder2 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder2.shortid
        }
      }))

      templatesInFolder1.map((e) => e.name).sort().should.eql(['a', 'b'])
      templatesInFolder2.map((e) => e.name).sort().should.eql(['b'])

      templatesInFolder1.find((e) => e.name === 'b').content.should.eql('b2')
      templatesInFolder2.find((e) => e.name === 'b').content.should.eql('b2')
    })

    // pending feature, copy of folder is implemented but disabled until we solve
    // some consistency problems with entity's properties that contains references to other entities
    it('should copy folder')

    it('should move to top level', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2'
      })

      const folder3 = await reporter.documentStore.collection('folders').insert({
        name: 'folder3',
        folder: { shortid: folder2.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        folder: { shortid: folder1.shortid }
      })

      const c = await reporter.documentStore.collection('templates').insert({
        name: 'c',
        folder: { shortid: folder2.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'd',
        folder: { shortid: folder3.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'templates',
          id: c._id
        },
        target: {
          shortid: null
        }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'folders',
          id: folder3._id
        },
        target: {
          shortid: null
        }
      })

      const templatesInRoot = (await reporter.documentStore.collection('templates').find({
        folder: null
      })).map((e) => e.name).sort()

      const foldersInRoot = (await reporter.documentStore.collection('folders').find({
        folder: null
      })).map((e) => e.name).sort()

      const templatesInFolder2 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder2.shortid
        }
      })).map((e) => e.name).sort()

      const templatesInFolder3 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder3.shortid
        }
      })).map((e) => e.name).sort()

      templatesInFolder2.should.eql([])
      templatesInFolder3.should.eql(['d'])

      templatesInRoot.should.eql(['c'])
      foldersInRoot.should.eql(['folder1', 'folder2', 'folder3'])
    })

    it('should copy to top level', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2'
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        folder: { shortid: folder1.shortid }
      })

      const c = await reporter.documentStore.collection('templates').insert({
        name: 'c',
        folder: { shortid: folder2.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'templates',
          id: c._id
        },
        target: {
          shortid: null
        },
        shouldCopy: true
      })

      const templatesInRoot = (await reporter.documentStore.collection('templates').find({
        folder: null
      })).map((e) => e.name).sort()

      const templatesInFolder2 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder2.shortid
        }
      })).map((e) => e.name).sort()

      templatesInFolder2.should.eql(['c'])

      templatesInRoot.should.eql(['c'])
    })

    it('move should work recursively', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2',
        folder: {
          shortid: folder1.shortid
        }
      })

      const folder3 = await reporter.documentStore.collection('folders').insert({
        name: 'folder3',
        folder: { shortid: folder2.shortid }
      })

      const folder4 = await reporter.documentStore.collection('folders').insert({
        name: 'folder4'
      })

      const folder5 = await reporter.documentStore.collection('folders').insert({
        name: 'folder5',
        folder: {
          shortid: folder4.shortid
        }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'c',
        folder: { shortid: folder2.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'd',
        folder: { shortid: folder3.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'e',
        folder: { shortid: folder5.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'folders',
          id: folder2._id
        },
        target: {
          shortid: folder4.shortid
        }
      })

      const foldersInFolder4 = (await reporter.documentStore.collection('folders').find({
        folder: {
          shortid: folder4.shortid
        }
      })).map((e) => e.name).sort()

      const foldersInFolder1 = (await reporter.documentStore.collection('folders').find({
        folder: {
          shortid: folder1.shortid
        }
      })).map((e) => e.name).sort()

      const templatesInFolder5 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder5.shortid
        }
      })).map((e) => e.name).sort()

      const templatesInFolder1 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder1.shortid
        }
      })).map((e) => e.name).sort()

      templatesInFolder1.should.eql(['a', 'b'])
      templatesInFolder5.should.eql(['e'])

      foldersInFolder4.should.eql(['folder2', 'folder5'])
      foldersInFolder1.should.eql([])
    })

    it('should not let move from parent entity into child entity', async () => {
      const folder1 = await reporter.documentStore.collection('folders').insert({
        name: 'folder1'
      })

      const folder2 = await reporter.documentStore.collection('folders').insert({
        name: 'folder2',
        folder: {
          shortid: folder1.shortid
        }
      })

      const folder3 = await reporter.documentStore.collection('folders').insert({
        name: 'folder3',
        folder: { shortid: folder2.shortid }
      })

      const folder4 = await reporter.documentStore.collection('folders').insert({
        name: 'folder4',
        folder: { shortid: folder3.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'a',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'b',
        folder: { shortid: folder1.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'c',
        folder: { shortid: folder2.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'd',
        folder: { shortid: folder3.shortid }
      })

      await reporter.documentStore.collection('templates').insert({
        name: 'e',
        folder: { shortid: folder4.shortid }
      })

      await reporter.folders.move({
        source: {
          entitySet: 'folders',
          id: folder2._id
        },
        target: {
          shortid: folder4.shortid
        }
      })

      const foldersInFolder4 = (await reporter.documentStore.collection('folders').find({
        folder: {
          shortid: folder4.shortid
        }
      })).map((e) => e.name).sort()

      const foldersInFolder1 = (await reporter.documentStore.collection('folders').find({
        folder: {
          shortid: folder1.shortid
        }
      })).map((e) => e.name).sort()

      const templatesInFolder4 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder4.shortid
        }
      })).map((e) => e.name).sort()

      const templatesInFolder1 = (await reporter.documentStore.collection('templates').find({
        folder: {
          shortid: folder1.shortid
        }
      })).map((e) => e.name).sort()

      templatesInFolder1.should.eql(['a', 'b'])
      templatesInFolder4.should.eql(['e'])

      foldersInFolder4.should.eql([])
      foldersInFolder1.should.eql(['folder2'])
    })
  })
})

describe('folders migration', () => {
  let reporter

  beforeEach(async () => {
    reporter = await init({ migrateEntitySetsToFolders: true })
  })

  afterEach(() => reporter.close())

  it('should not create es folders on empty project', async () => {
    const folders = await reporter.documentStore.collection('folders').find({})
    folders.should.have.length(0)
  })
})
