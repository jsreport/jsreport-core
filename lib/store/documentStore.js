const events = require('events')
const nanoid = require('nanoid')
const uuidv4 = require('uuid/v4')
const { getType, resolvePropDefinition, typeDefToJSONSchema } = require('./typeUtils')
const { findReferencePropertiesInType, findLinkedEntitiesForReferenceValue, existsReferenceValue, updateReferenceValue } = require('./referenceUtils')
const collection = require('./collection')
const checkDuplicatedId = require('./checkDuplicatedId')
const ListenerCollection = require('listener-collection')

// factory function
const DocumentStore = (options, validator, encryption) => {
  const entitySchemasToGenerate = []
  const generateSchemaEntityTypeConfig = {}
  const defaultGenerateSchemaForEntityType = true

  // internal sets are not listed in normal documentStore.model.entitySets, or available in
  // documentStore.collection(), instead they are available in documentStore.internalCollection()
  // and entity set definitions of these internals are only available in store provider implementations.
  //
  // this allows having collections that are available for specific uses cases (playground, jsreportonline)
  // which needs to save/load data using jsreport store abstraction but they don't need to be visible
  // from extensions. (to avoid adding permissions, attributes or other logic that modifies these internal entities from extensions)
  const internalEntitySets = {}
  const transactions = new Map()
  const fileExtensionResolvers = []

  transactions.getActiveTransaction = function (req) {
    if (req && req.context && req.context.storeTransaction) {
      if (!transactions.has(req.context.storeTransaction)) {
        throw new Error('transaction does not exists or is no longer active, make sure you are not closing the transaction previously using store.commitTransaction or store.rollbackTransaction')
      }

      return transactions.get(req.context.storeTransaction)
    }
  }

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

      const defaultFieldsAddedPerEntitySet = {}
      const entitySetsLinkedReferenceProperties = {}

      Object.entries(this.model.entitySets).forEach((e) => {
        const eName = e[0]
        const es = e[1]
        const entityTypeName = es.entityType
        const entityType = this.getEntityType(entityTypeName)

        const defaultFieldsAdded = {}

        if (!entityType._id) {
          defaultFieldsAdded._id = true
          entityType._id = { type: 'Edm.String' }

          if (!entityTypeHasKey(entityType)) {
            // add key: true only if there is no other field defined already
            // key: true is used for ODATA XML generation, it includes new information to the final XML
            entityType._id.key = true
          }
        }

        if (!entityType.creationDate) {
          defaultFieldsAdded.creationDate = true
          entityType.creationDate = { type: 'Edm.DateTimeOffset' }
        }

        if (!entityType.modificationDate) {
          defaultFieldsAdded.modificationDate = true
          entityType.modificationDate = { type: 'Edm.DateTimeOffset' }
        }

        if ((!es.humanReadableKey || es.humanReadableKey === 'shortid') && !entityType.shortid) {
          defaultFieldsAdded.shortid = true
          entityType.shortid = { type: 'Edm.String' }
          es.humanReadableKey = 'shortid'
        }

        if (Object.keys(defaultFieldsAdded).length > 0) {
          defaultFieldsAddedPerEntitySet[eName] = defaultFieldsAdded
        }

        const publicKeyPropEntry = Object.entries(entityType).find((e) => e[1].publicKey)
        es.entityTypePublicKey = publicKeyPropEntry ? publicKeyPropEntry[0] : null

        const referenceProperties = findReferencePropertiesInType(this.model, entityType)

        referenceProperties.forEach((property) => {
          const entitySetName = property.referenceTo
          entitySetsLinkedReferenceProperties[entitySetName] = entitySetsLinkedReferenceProperties[entitySetName] || []

          entitySetsLinkedReferenceProperties[entitySetName].push({
            name: property.name,
            entitySet: eName
          })
        })

        es.referenceProperties = referenceProperties
      })

      Object.keys(this.model.entitySets).forEach((eName) => {
        const es = this.model.entitySets[eName]

        if (entitySetsLinkedReferenceProperties[eName]) {
          es.linkedReferenceProperties = entitySetsLinkedReferenceProperties[eName]
        } else {
          es.linkedReferenceProperties = []
        }

        const col = collection(eName, this.provider, this.model, validator, encryption, transactions)

        if (defaultFieldsAddedPerEntitySet[eName] != null) {
          const defaultFieldsAdded = defaultFieldsAddedPerEntitySet[eName]

          const addDefaultFields = (doc) => {
            if (defaultFieldsAdded.creationDate) {
              doc.creationDate = new Date()
            }

            if (defaultFieldsAdded.modificationDate) {
              doc.modificationDate = new Date()
            }

            if (defaultFieldsAdded.shortid) {
              doc.shortid = doc.shortid || nanoid(7)
            }
          }

          col.beforeInsertListeners.add('core-default-fields', (doc, req) => {
            addDefaultFields(doc)
          })

          col.beforeUpdateListeners.add('core-default-fields', (q, u, o, req) => {
            if (u.$set && o && o.upsert === true) {
              addDefaultFields(u.$set)
            }

            if (req && req.context.skipModificationDateUpdate === true) {
              return
            }

            if (defaultFieldsAdded.modificationDate && u.$set) {
              u.$set.modificationDate = new Date()
            }
          })
        }

        this.collections[eName] = col
      })

      Object.keys(internalEntitySets).forEach((e) => (this.internalCollections[e] = collection(e, this.provider, this.model, undefined, undefined, transactions)))

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

    getEntityType (entityTypeName, returnNormalizedTypeName) {
      return getType(this.model, this.model.entityTypes, entityTypeName, returnNormalizedTypeName)
    },

    addFileExtensionResolver (fn) {
      fileExtensionResolvers.push(fn)
    },

    resolveFileExtension (doc, entitySetName, propertyName) {
      const model = this.model
      const entitySets = { ...model.entitySets, ...internalEntitySets }
      const es = entitySets[entitySetName]

      if (es == null) {
        throw new Error(`Entity set "${entitySetName}" does not exists`)
      }

      const entityTypeName = es.entityType
      const entityType = this.getEntityType(entityTypeName)
      const propTypeParts = propertyName.split('.')
      const propTypePartsLastIndex = propTypeParts.length - 1
      let propType = entityType

      propTypeParts.forEach((propName, idx) => {
        if (propType == null || propType[propName] == null) {
          throw new Error(`Property "${propertyName}" does not exists in entity type "${entityTypeName}"`)
        }

        propType = propType[propName]

        const resolveResult = this.resolvePropertyDefinition(propType)

        if (!resolveResult) {
          throw new Error(`Property "${propertyName}" does not have a valid type`)
        }

        if (resolveResult.def.type.startsWith('Collection(') && resolveResult.subType == null) {
          if (propTypePartsLastIndex !== idx) {
            propType = null
          }
        } else if (resolveResult.subType) {
          propType = resolveResult.subType
        }
      })

      if (!propType || propType.document == null) {
        return
      }

      for (const resolver of fileExtensionResolvers) {
        const extension = resolver(doc, entitySetName, entityType, propType)

        if (extension) {
          return extension
        }
      }

      return propType.document.extension
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

    getComplexType (complexTypeName, returnNormalizedTypeName) {
      return getType(this.model, this.model.complexTypes, complexTypeName, returnNormalizedTypeName)
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

      if (def.exportable == null || def.exportable === true) {
        def.exportable = true
      } else {
        def.exportable = false
      }

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
   *  Resolves the passed definition to contain subtype definition
   *  (useful when dealing with complex types or collection types)
   *  @param  {Object} def
   *  @return {Object}
   */
    resolvePropertyDefinition (def) {
      return resolvePropDefinition(this.model, def)
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

    findLinkedEntitiesForReference (entitiesByCollection, collectionReferenceTargetName, referenceValue) {
      return findLinkedEntitiesForReferenceValue(this, entitiesByCollection, collectionReferenceTargetName, referenceValue)
    },

    existsReference (collectionReferenceOriginName, entity, collectionReferenceTargetName, referenceValue) {
      return existsReferenceValue(this, collectionReferenceOriginName, entity, collectionReferenceTargetName, referenceValue)
    },

    updateReference (collectionReferenceOriginName, entity, collectionReferenceTargetName, referenceOpts, newReferenceValue) {
      return updateReferenceValue(this, collectionReferenceOriginName, entity, collectionReferenceTargetName, referenceOpts, newReferenceValue)
    },

    checkDuplicatedId (collectionName, idValue, req) {
      return checkDuplicatedId(this, collectionName, idValue, req)
    },

    async close () {
      transactions.clear()

      if (this.provider.close) {
        await this.provider.close()
      }
    },

    /**
   * Drop the whole document store
   * @returns {Promise}
   */
    async drop (req) {
      return this.provider.drop({
        transaction: transactions.getActiveTransaction(req)
      })
    },

    async beginTransaction (req) {
      if (req.context.storeTransaction && transactions.has(req.context.storeTransaction)) {
        throw new Error('Can not call store.beginTransaction when an active transaction already exists, make sure you are not calling store.beginTransaction more than once')
      }

      const tran = await this.provider.beginTransaction()

      const tranId = uuidv4()

      transactions.set(tranId, tran)

      req.context.storeTransaction = tranId
    },

    async commitTransaction (req) {
      const tranId = req.context.storeTransaction
      const tran = transactions.get(tranId)

      if (!tran) {
        throw new Error('Can not call store.commitTransaction without an active transaction, make sure you are calling store.beginTransaction previously or that you are not calling store.commitTransaction, store.rollbackTransaction more than once')
      }

      await this.provider.commitTransaction(tran)

      transactions.delete(tranId)
      delete req.context.storeTransaction
    },

    async rollbackTransaction (req) {
      const tranId = req.context.storeTransaction
      const tran = transactions.get(tranId)

      if (!tran) {
        throw new Error('Can not call store.rollbackTransaction without an active transaction, make sure you are calling store.beginTransaction previously or that you are not calling store.rollbackTransaction, store.commitTransaction more than once')
      }

      await this.provider.rollbackTransaction(tran)

      transactions.delete(tranId)
      delete req.context.storeTransaction
    }
  }

  store.model.entityTypes = proxyTypeCollection({
    toGenerate: entitySchemasToGenerate,
    config: generateSchemaEntityTypeConfig,
    generateSchemaDefault: defaultGenerateSchemaForEntityType
  })

  return store
}

function entityTypeHasKey (entityType) {
  let hasKey = false

  Object.entries(entityType).forEach(([field, fieldDef]) => {
    if (hasKey === true) {
      return
    }

    if (fieldDef.key === true) {
      hasKey = true
    }
  })

  return hasKey
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

module.exports = (...args) => Object.assign(DocumentStore(...args), events.EventEmitter.prototype)
