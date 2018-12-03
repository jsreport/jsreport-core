const events = require('events')
const collection = require('./collection')
const ListenerCollection = require('listener-collection')

// factory function
const DocumentStore = (options, validator) => {
  const entitySchemasToGenerate = []
  const generateSchemaEntityTypeConfig = {}
  const defaultGenerateSchemaForEntityType = false

  // internal sets are not listed in normal documentStore.model.entitySets, or available in
  // documentStore.collection(), instead they are available in documentStore.internalCollection()
  // and entity set definitions of these internals are only available in store provider implementations.
  //
  // this allows having collections that are available for specific uses cases (playground, jsreportonline)
  // which needs to save/load data using jsreport store abstraction but they don't need to be visible
  // from extensions. (to avoid adding permissions, attributes or other logic that modifies these internal entities from extensions)
  const internalEntitySets = {}

  let initialized = false

  const store = {
    options,
    model: {
      namespace: 'jsreport',
      complexTypes: {},
      entitySets: {}
    },
    internalAfterInitListeners: new ListenerCollection(),
    emitter: new events.EventEmitter(),

    registerProvider (provider) {
      this.provider = provider
    },

    async init () {
      initialized = true

      if (!this.provider && this.options.store.provider === 'memory') {
        this.provider = require('./memoryStoreProvider')()
      }

      if (!this.provider) {
        throw new Error(`The document store provider ${this.options.store.provider} was not registered.`)
      }

      this.emit('before-init', this)

      this.collections = {}
      this.internalCollections = {}

      Object.entries(this.model.entitySets).forEach((e) => {
        const name = e[0]
        const es = e[1]

        const entityTypeName = this.model.entitySets[name].entityType
        const entityType = this.model.entityTypes[entityTypeName.split('.')[1]]
        const publicKeyPropEntry = Object.entries(entityType).find((e) => e[1].publicKey)
        es.entityTypePublicKey = publicKeyPropEntry ? publicKeyPropEntry[0] : null
      })

      Object.keys(this.model.entitySets).forEach((e) => (this.collections[e] = collection(e, this.provider, this.model)))
      Object.keys(internalEntitySets).forEach((e) => (this.internalCollections[e] = collection(e, this.provider, this.model)))

      if (this.provider.load) {
        // we combine internal and public entity sets in order for the store provider
        // be able to recognize both set of entities and be able to work with them
        const modelToLoad = Object.assign({}, this.model)

        modelToLoad.entitySets = Object.assign({}, modelToLoad.entitySets, internalEntitySets)

        await this.provider.load(modelToLoad)
      }

      entitySchemasToGenerate.forEach((entityType) => {
        const schema = typeDefToJSONSchema(this.model, this.model.entityTypes[entityType])

        if (schema == null) {
          return
        }

        if (initialized && validator.getSchema(entityType) != null) {
          validator.addSchema(entityType, schema, true)
        } else {
          validator.addSchema(entityType, schema)
        }
      })

      this.emit('after-init', this)
      return this.internalAfterInitListeners.fire()
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
    registerEntityType (type, def, generateJSONSchema = defaultGenerateSchemaForEntityType) {
      generateSchemaEntityTypeConfig[type] = generateJSONSchema === true
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
      const isInternal = def.internal === true

      if (
        isInternal &&
        this.model.entitySets[name] != null
      ) {
        throw new Error(
          `Entity set "${name}" can not be registered as internal entity because it was register as public entity previously`
        )
      } else if (
        !isInternal &&
        internalEntitySets[name] != null
      ) {
        throw new Error(
          `Entity set "${name}" can not be registered as public entity because it was register as internal entity previously`
        )
      }

      if (!isInternal) {
        this.model.entitySets[name] = def
      } else {
        internalEntitySets[name] = def
      }
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
   * Get the document internal Collection by the name provided in registerEntitySet
   * @param {String} name
   * @returns {Collection}
   */
    internalCollection (name) {
      return this.internalCollections[name]
    },

    /**
   * Drop the whole document store
   * @returns {Promise}
   */
    drop () {
      return this.provider.drop()
    }
  }

  store.model.entityTypes = proxyTypeCollection({
    toGenerate: entitySchemasToGenerate,
    config: generateSchemaEntityTypeConfig,
    generateSchemaDefault: defaultGenerateSchemaForEntityType
  })

  return store
}

const edmTypeToJSONSchema = {
  'Edm.String': 'string',
  'Edm.DateTimeOffset': { anyOf: [{ type: 'string', format: 'date-time' }, { '$jsreport-acceptsDate': true }] },
  'Edm.Boolean': 'boolean',
  'Edm.Int16': { type: 'integer', minimum: -32768, maximum: 32767 },
  'Edm.Int32': { type: 'integer', minimum: -2147483648, maximum: 2147483647 },
  'Edm.Double': 'number',
  'Edm.Decimal': 'number',
  'Edm.Binary': { anyOf: [{ type: 'string' }, { '$jsreport-acceptsBuffer': true }] }
}

function proxyTypeCollection ({ toGenerate, config, generateSchemaDefault }) {
  return new Proxy({}, {
    set: (target, property, value, receiver) => {
      let shouldGenerate = config[property]

      if (shouldGenerate == null) {
        shouldGenerate = generateSchemaDefault
      }

      if (shouldGenerate === true) {
        toGenerate.push(property)
      } else {
        const index = toGenerate.indexOf(property)

        if (index !== -1) {
          toGenerate.splice(index, 1)
        }
      }

      // ensure clean config for next call
      delete config[property]

      return Reflect.set(target, property, value, receiver)
    }
  })
}

function typeDefToJSONSchema (model, def) {
  const jsonSchema = { type: 'object', properties: {} }

  if (def == null) {
    return
  }

  if (typeof def !== 'object' || Array.isArray(def)) {
    return
  }

  Object.keys(def).forEach((key) => {
    const propDef = def[key]
    const collectionTypeRegExp = /^Collection\((\S+)\)$/
    let type = propDef.type
    const extraSchema = propDef.schema
    let isCollection = false

    if (propDef == null || type == null) {
      return
    }

    const collectionResult = collectionTypeRegExp.exec(type)

    if (collectionResult != null && collectionResult[1] != null) {
      isCollection = true
      type = collectionResult[1]
    }

    type = type.replace(model.namespace + '.', '')

    if (model.complexTypes[type] != null) {
      jsonSchema.properties[key] = typeDefToJSONSchema(model, model.complexTypes[type])
    } else if (edmTypeToJSONSchema[type] != null) {
      const value = edmTypeToJSONSchema[type]

      if (typeof value === 'string') {
        jsonSchema.properties[key] = { type: value }
      } else {
        jsonSchema.properties[key] = value
      }
    }

    if (isCollection) {
      jsonSchema.properties[key] = {
        type: 'array',
        items: jsonSchema.properties[key]
      }
    }

    if (extraSchema) {
      let originalType = jsonSchema.properties[key].type
      let newType = extraSchema.type

      if (originalType != null && newType != null) {
        if (!Array.isArray(originalType)) {
          originalType = [jsonSchema.properties[key].type]
        }

        if (!Array.isArray(newType)) {
          newType = [newType]
        }

        jsonSchema.properties[key] = {
          ...jsonSchema.properties[key],
          ...extraSchema,
          type: [...originalType, ...newType]
        }
      } else {
        jsonSchema.properties[key] = Object.assign({}, jsonSchema.properties[key], extraSchema)
      }
    }
  })

  if (Object.keys(jsonSchema.properties).length === 0) {
    return
  }

  return jsonSchema
}

module.exports = (...args) => Object.assign(DocumentStore(...args), events.EventEmitter.prototype)
