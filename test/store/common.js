const Request = require('../../lib/render/request.js')

module.exports = (store) => {
  beforeEach(async () => {
    store().registerComplexType('CommonPhantomType', {
      header: { type: 'Edm.String', document: { extension: 'html', engine: true } }
    })

    store().registerEntityType('CommonTemplateType', {
      _id: { type: 'Edm.String', key: true },
      name: { type: 'Edm.String', publicKey: true },
      content: { type: 'Edm.String', document: { extension: 'html', engine: true } },
      recipe: { type: 'Edm.String' },
      modificationDate: { type: 'Edm.DateTimeOffset' },
      phantom: { type: 'jsreport.CommonPhantomType' }
    })

    store().registerEntitySet('templates', { entityType: 'jsreport.CommonTemplateType', splitIntoDirectories: true })
    await store().init()
    return store().drop()
  })

  it('insert and query', async () => {
    await store().collection('templates').insert({ name: 'test' })
    const res = await store().collection('templates').find({ name: 'test' })
    res.length.should.be.eql(1)
  })

  it('insert and query with condition', async () => {
    await store().collection('templates').insert({ name: 'test' })
    const res = await store().collection('templates').find({ name: 'diferent' })
    res.length.should.be.eql(0)
  })

  it('insert, update, query', async () => {
    await store().collection('templates').insert({ name: 'test' })
    await store().collection('templates').update({ name: 'test' }, { $set: { recipe: 'foo' } })
    const res = await store().collection('templates').find({ name: 'test' })
    res.length.should.be.eql(1)
    res[0].recipe.should.be.eql('foo')
  })

  it('insert remove query', async () => {
    await store().collection('templates').insert({ name: 'test' })
    await store().collection('templates').remove({ name: 'test' })
    const res = await store().collection('templates').find({ name: 'test' })
    res.length.should.be.eql(0)
  })

  it('insert should return an object with _id set', async () => {
    const doc = await store().collection('templates').insert({ name: 'test' })
    doc.should.have.property('_id')
    doc._id.should.be.ok()
  })

  it('update with upsert', async () => {
    await store().collection('templates').update({ name: 'test' }, { $set: { name: 'test2' } }, { upsert: true })
    const res = await store().collection('templates').find({ name: 'test2' })
    res.length.should.be.eql(1)
  })

  it('find should return clones', async () => {
    await store().collection('templates').insert({ name: 'test', content: 'original', phantom: { header: 'original' } })
    const res = await store().collection('templates').find({})
    res[0].content = 'modified'
    res[0].phantom.header = 'modified'
    const res2 = await store().collection('templates').find({})
    res2[0].content.should.be.eql('original')
    res2[0].phantom.header.should.be.eql('original')
  })

  it('insert should use clones', async () => {
    const doc = { name: 'test', content: 'original', phantom: { header: 'original' } }
    await store().collection('templates').insert(doc)
    doc.content = 'modified'
    doc.phantom.header = 'modified'
    const res = await store().collection('templates').find({})
    res[0].content.should.be.eql('original')
    res[0].phantom.header.should.be.eql('original')
  })

  it('skip and limit', async () => {
    await store().collection('templates').insert({ name: '1' })
    await store().collection('templates').insert({ name: '3' })
    await store().collection('templates').insert({ name: '2' })

    const res = await store().collection('templates').find({}).sort({name: 1}).skip(1).limit(1).toArray()
    res.length.should.be.eql(1)
    res[0].name.should.be.eql('2')
  })

  it('$and', async () => {
    await store().collection('templates').insert({ name: '1', recipe: 'a' })
    await store().collection('templates').insert({ name: '2', recipe: 'b' })
    await store().collection('templates').insert({ name: '3', recipe: 'b' })

    const res = await store().collection('templates').find({$and: [{name: '2'}, {recipe: 'b'}]}).toArray()
    res.length.should.be.eql(1)
    res[0].name.should.be.eql('2')
    res[0].recipe.should.be.eql('b')
  })

  it('projection', async () => {
    await store().collection('templates').insert({ name: '1', recipe: 'a' })

    const res = await store().collection('templates').find({}, { recipe: 1 })
    res.length.should.be.eql(1)
    res[0].should.not.have.property('name')
    res[0].recipe.should.be.eql('a')
  })

  it('count', async () => {
    await store().collection('templates').insert({ name: '1', recipe: 'a' })

    const res = await store().collection('templates').find({}).count()
    res.should.be.eql(1)
  })

  it('count without cursor', async () => {
    await store().collection('templates').insert({ name: '1', recipe: 'a' })

    const res = await store().collection('templates').count({})
    res.should.be.eql(1)
  })

  it('projection should not be applied when second param is request', async () => {
    await store().collection('templates').insert({ name: 'test' })
    const res = await store().collection('templates').find({ name: 'test' }, Request({template: {}}))
    res[0].name.should.be.eql('test')
  })

  it('update should return 1 if upsert', async () => {
    const res = await store().collection('templates').update({ name: 'test' }, { $set: { name: 'test2' } }, { upsert: true })
    res.should.be.eql(1)
  })

  it('update should return number of updsated items', async () => {
    await store().collection('templates').insert({ name: '1', recipe: 'a' })
    await store().collection('templates').insert({ name: '2', recipe: 'a' })
    const res = await store().collection('templates').update({ recipe: 'a' }, { $set: { engine: 'test2' } })
    res.should.be.eql(2)
  })
}
