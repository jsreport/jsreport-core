const events = require('events')
const collection = require('./collection')

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
    if (!this.provider && this.options.store.provider === 'memory') {
      this.provider = require('./memoryStoreProvider')()
    }

    if (!this.provider) {
      throw new Error(`The documet store provider ${this.options.store.provider} was not registered.`)
    }

    this.emit('before-init', this)
    this.collections = {}
    Object.keys(this.model.entitySets).forEach((e) => (this.collections[e] = collection(e, this.provider, this.model)))
    if (this.provider.load) {
      await this.provider.load(this.model)
    }
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
  }
})

module.exports = (...args) => Object.assign(DocumentStore(...args), events.EventEmitter.prototype)
