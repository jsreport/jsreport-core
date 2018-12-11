/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * DocumentStore data layer provider using just memory.
 */

const mingo = require('mingo')
const { uid } = require('../util/util')
const extend = require('node.extend.without.arrays')
const uniqBy = require('lodash.uniqby')

module.exports = () => ({
  load (model) {
    this.model = model
    this.documents = {}
    Object.keys(model.entitySets).forEach((e) => (this.documents[e] = []))
  },

  find (entitySet, query, fields) {
    const cursor = mingo.find(this.documents[entitySet], query, fields)
    cursor.toArray = () => uniqBy(cursor.all(), '_id').map((e) => extend(true, {}, e))
    return cursor
  },

  insert (entitySet, doc) {
    doc._id = doc._id || uid(16)
    this.documents[entitySet].push(extend(true, {}, doc))
    return doc
  },

  update (entitySet, q, u, opts = {}) {
    const toUpdate = mingo.find(this.documents[entitySet], q).all()

    if (toUpdate.length === 0 && opts.upsert) {
      this.insert(entitySet, u.$set)
    } else {
      toUpdate.forEach((d) => Object.assign(d, u.$set || {}))
    }

    return opts.upsert ? toUpdate.length || 1 : toUpdate.length
  },

  remove (entitySet, q) {
    const toRemove = mingo.find(this.documents[entitySet], q).all()
    this.documents[entitySet] = this.documents[entitySet].filter(d => !toRemove.includes(d))
  },

  drop () {
    Object.keys(this.model.entitySets).forEach((e) => (this.documents[e] = []))
  }
})
