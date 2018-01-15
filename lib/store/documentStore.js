const events = require('events')
const collection = require('./collection')
const Promise = require('bluebird')

// factory function
const DocumentStore = (options) => ({
  options,
  model: {
    namespace: 'jsreport',
    entityTypes: {},
    complexTypes: {},
    entitySets: {}
  },
  emitter: new events.EventEmitter(),

  registerProvider (provider) {
    this.provider = provider
  },

  async init () {
    if (!this.provider && this.options.connectionString.name === 'memory') {
      this.provider = require('./memoryStoreProvider')()
    }

    if (!this.provider) {
      throw new Error('The documet store provider was not registered.')
    }

    this.emit('before-init', this)
    this.collections = {}
    Object.keys(this.model.entitySets).forEach((e) => (this.collections[e] = collection(e, this.provider)))
    await this.provider.load(this.model)
    this.emit('after-init', this)
  },

  /**
 * Register type for odata.
 * Example:
 * documentStore.registerEntityType('UserType', {
 *       _id: {type: 'Edm.String', key: true}
 * })
 *
 * @param {String} type
 * @param {Object} def
 */
  registerEntityType (type, def) {
    this.model.entityTypes[type] = def
  },

  addFileExtensionResolver (fn) {
    if (this.provider.addFileExtensionResolver) {
      this.provider.addFileExtensionResolver(fn)
    }
  },

  /**
 * Register complex type for odata.
 * Example:
 * documentStore.registerComplexType('DataItemRefType', {
 *       name: {type: 'Edm.String' }
 * })
 *
 * @param {String} name
 * @param {Object} def
 */
  registerComplexType (name, def) {
    this.model.complexTypes[name] = def
  },

  /**
 * Register complete entity set for odata. The first parameter is then use as a collection name
 * Example:
 * documentStore.registerEntitySet('users', {
 *       entityType: 'jsreport.UserType'
 * })
 *
 * @param {String} name
 * @param {Object} def
 */
  registerEntitySet (name, def) {
    this.model.entitySets[name] = def
  },

  /**
 * Get the document Collection by the name provided in registerEntitySet
 * @param {String} name
 * @returns {Collection}
 */
  collection (name) {
    return this.collections[name]
  },

  /**
 * Drop the whole document store
 * @returns {Promise}
 */
  drop () {
    return this.provider.drop()
  },

  // this should be part of the express extension
  // the provider contract shouldn't be aware of any odata stuff, it should just return a cursor
  adaptOData (odataServer) {
    odataServer
      .model(this.model)
      .beforeQuery((col, query, req, cb) => {
      // odata server should pass the request also to the query, update...
      // now we have to workaround it
        query.$req = req
        this.options.logger.debug('OData query on ' + col)
        cb()
      }).beforeUpdate((col, query, update, req, cb) => {
        query.$req = req
        this.options.logger.debug('OData update on ' + col)
        cb()
      }).beforeRemove((col, query, req, cb) => {
        query.$req = req
        this.options.logger.debug('OData remove from ' + col)
        cb()
      }).beforeInsert((col, doc, req, cb) => {
        doc.$req = req
        this.options.logger.debug('OData insert into ' + col)
        cb()
      }).update((col, query, update, cb) => {
        const req = query.$req
        delete query.$req
        return Promise.resolve(this.collection(col).update(query, update, req)).asCallback(cb)
      })
      .insert((col, doc, cb) => {
        const req = doc.$req
        delete doc.$req
        return Promise.resolve(this.collection(col).insert(doc, req)).asCallback(cb)
      })
      .remove((col, query, cb) => {
        const req = query.$req
        delete query.$req
        return Promise.resolve(this.collection(col).remove(query, req)).asCallback(cb)
      })
      .query((col, query, cb) => {
        const req = query.$req
        delete query.$req
        let cursor = this.collection(col).find(query.$filter, query.$select || {}, req)

        if (query.$sort) {
          cursor = cursor.sort(query.$sort)
        }
        if (query.$skip) {
          cursor = cursor.skip(query.$skip)
        }
        if (query.$limit) {
          cursor = cursor.limit(query.$limit)
        }

        if (query.$count) {
          return Promise.resolve(cursor.count()).asCallback(cb)
        }

        if (!query.$inlinecount) {
          return Promise.resolve(cursor.toArray()).asCallback(cb)
        }

        Promise.resolve(cursor.toArray().then((res) => {
          return this.collection(col).find(query.$filter, query.$req).count().then((c) => {
            return {
              value: res,
              count: c
            }
          })
        })).asCallback(cb)
      })

    if (this.provider.adaptOData) {
      return this.provider.adaptOData(odataServer)
    }
  }
})

module.exports = (...args) => Object.assign(DocumentStore(...args), events.EventEmitter.prototype)
