const Request = require('../../lib/render/request.js')

module.exports = (store) => {
  beforeEach(async () => {
    store().registerComplexType('CommonPhantomType', {
      header: { type: 'Edm.String', document: { extension: 'html', engine: true } }
    })

    const templateType = {
      name: { type: 'Edm.String', publicKey: true },
      content: { type: 'Edm.String', document: { extension: 'html', engine: true } },
      recipe: { type: 'Edm.String' },
      engine: { type: 'Edm.String' },
      phantom: { type: 'jsreport.CommonPhantomType' }
    }

    store().registerEntityType('CommonTemplateType', { ...templateType })
    store().registerEntityType('CommonInternalTemplateType', { ...templateType })

    store().registerEntitySet('templates', {
      entityType: 'jsreport.CommonTemplateType',
      splitIntoDirectories: true
    })

    store().registerEntitySet('internalTemplates', {
      entityType: 'jsreport.CommonTemplateType',
      internal: true,
      splitIntoDirectories: true
    })

    await store().init()
    return store().drop()
  })

  describe('public collection', () => {
    collectionTests(store)
  })

  describe('internal collection', () => {
    collectionTests(store, true)
  })
}

function collectionTests (store, isInternal) {
  function getCollection (name) {
    if (!isInternal) {
      return store().collection(name)
    } else {
      return store().internalCollection(name)
    }
  }

  it('insert and query', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: 'test' })
    const res = await getCollection(colName).find({ name: 'test' })
    res.length.should.be.eql(1)
  })

  it('insert and query with condition', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: 'test' })
    const res = await getCollection(colName).find({ name: 'diferent' })
    res.length.should.be.eql(0)
  })

  it('insert, update, query', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: 'test' })
    await getCollection(colName).update({ name: 'test' }, { $set: { recipe: 'foo' } })
    const res = await getCollection(colName).find({ name: 'test' })
    res.length.should.be.eql(1)
    res[0].recipe.should.be.eql('foo')
  })

  it('insert remove query', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: 'test' })
    await getCollection(colName).remove({ name: 'test' })
    const res = await getCollection(colName).find({ name: 'test' })
    res.length.should.be.eql(0)
  })

  it('insert should return an object with _id set', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    const doc = await getCollection(colName).insert({ name: 'test' })
    doc.should.have.property('_id')
    doc._id.should.be.ok()
  })

  it('update with upsert', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).update({ name: 'test' }, { $set: { name: 'test2' } }, { upsert: true })
    const res = await getCollection(colName).find({ name: 'test2' })
    res.length.should.be.eql(1)
  })

  it('find should return clones', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: 'test', content: 'original', phantom: { header: 'original' } })
    const res = await getCollection(colName).find({})
    res[0].content = 'modified'
    res[0].phantom.header = 'modified'
    const res2 = await getCollection(colName).find({})
    res2[0].content.should.be.eql('original')
    res2[0].phantom.header.should.be.eql('original')
  })

  it('insert should use clones', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    const doc = { name: 'test', content: 'original', phantom: { header: 'original' } }
    await getCollection(colName).insert(doc)
    doc.content = 'modified'
    doc.phantom.header = 'modified'
    const res = await getCollection(colName).find({})
    res[0].content.should.be.eql('original')
    res[0].phantom.header.should.be.eql('original')
  })

  it('skip and limit', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: '1' })
    await getCollection(colName).insert({ name: '3' })
    await getCollection(colName).insert({ name: '2' })

    const res = await getCollection(colName).find({}).sort({name: 1}).skip(1).limit(1).toArray()
    res.length.should.be.eql(1)
    res[0].name.should.be.eql('2')
  })

  it('$and', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: '1', recipe: 'a' })
    await getCollection(colName).insert({ name: '2', recipe: 'b' })
    await getCollection(colName).insert({ name: '3', recipe: 'b' })

    const res = await getCollection(colName).find({$and: [{name: '2'}, {recipe: 'b'}]}).toArray()
    res.length.should.be.eql(1)
    res[0].name.should.be.eql('2')
    res[0].recipe.should.be.eql('b')
  })

  it('projection', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: '1', recipe: 'a' })

    const res = await getCollection(colName).find({}, { recipe: 1 })
    res.length.should.be.eql(1)
    res[0].should.not.have.property('name')
    res[0].recipe.should.be.eql('a')
  })

  it('count', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: '1', recipe: 'a' })

    const res = await getCollection(colName).find({}).count()
    res.should.be.eql(1)
  })

  it('count without cursor', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: '1', recipe: 'a' })

    const res = await getCollection(colName).count({})
    res.should.be.eql(1)
  })

  it('projection should not be applied when second param is request', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: 'test' })
    const res = await getCollection(colName).find({ name: 'test' }, Request({template: {}}))
    res[0].name.should.be.eql('test')
  })

  it('update should return 1 if upsert', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    const res = await getCollection(colName).update({ name: 'test' }, { $set: { name: 'test2' } }, { upsert: true })
    res.should.be.eql(1)
  })

  it('update should return number of updated items', async () => {
    const colName = !isInternal ? 'templates' : 'internalTemplates'

    await getCollection(colName).insert({ name: '1', recipe: 'a' })
    await getCollection(colName).insert({ name: '2', recipe: 'a' })
    const res = await getCollection(colName).update({ recipe: 'a' }, { $set: { engine: 'test2' } })
    res.should.be.eql(2)
  })
}
