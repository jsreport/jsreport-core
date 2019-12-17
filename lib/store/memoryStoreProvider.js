/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * DocumentStore data layer provider using just memory.
 */

const omit = require('lodash.omit')
const mingo = require('@jsreport/mingo')
const { uid } = require('../util/util')
const extend = require('node.extend.without.arrays')

module.exports = () => ({
  load (model) {
    this.model = model
    this.documents = {}
    Object.keys(model.entitySets).forEach((e) => (this.documents[e] = []))
  },

  beginTransaction () {
    return {
      id: uid(16)
    }
  },

  commitTransaction (tran) {
    for (let documents of Object.values(this.documents)) {
      documents.forEach((d, index) => {
        if (!d.$transaction) {
          return
        }

        const $currentTranState = d.$transaction.active[tran.id]

        if ($currentTranState.state === 'remove') {
          documents.splice(index, 1)
          delete d.$transaction.active[tran.id]
        } else if ($currentTranState.state === 'update') {
          documents[index] = {
            ...$currentTranState.updatedDoc,
            $transaction: d.$transaction
          }

          d = documents[index]

          delete d.$transaction.active[tran.id]
        } else {
          delete d.$transaction.active[tran.id]
        }

        if (Object.keys(d.$transaction.active).length === 0) {
          delete d.$transaction
        }
      })
    }
  },

  rollbackTransaction (tran) {
    for (let documents of Object.values(this.documents)) {
      documents.forEach((d, index) => {
        if (!d.$transaction) {
          return
        }

        const $currentTranState = d.$transaction.active[tran.id]

        if ($currentTranState.state === 'remove') {
          delete d.$transaction.active[tran.id]
        } else if (
          $currentTranState.state === 'insert' ||
          ($currentTranState.state === 'update' && d.$transaction.ownerId === tran.id)
        ) {
          documents.splice(index, 1)
          delete d.$transaction.active[tran.id]
        } else {
          delete d.$transaction.active[tran.id]
        }

        if (Object.keys(d.$transaction.active).length === 0) {
          delete d.$transaction
        }
      })
    }
  },

  find (entitySet, query, fields, opts = {}) {
    const documents = getDocuments(this.documents[entitySet], opts).map((d) => {
      if (opts.transaction && d.$transaction.active[opts.transaction.id] && d.$transaction.active[opts.transaction.id].updatedDoc) {
        return d.$transaction.active[opts.transaction.id].updatedDoc
      }

      return d
    })

    const cursor = mingo.find(documents, query, fields)
    cursor.toArray = () => cursor.all().map((e) => omit(extend(true, {}, e), '$transaction'))
    return cursor
  },

  insert (entitySet, doc, opts = {}) {
    doc._id = doc._id || uid(16)

    const newDoc = extend(true, {}, doc)

    if (opts.transaction) {
      newDoc.$transaction = {
        ownerId: opts.transaction.id,
        active: {
          [opts.transaction.id]: {
            state: 'insert'
          }
        }
      }
    }

    this.documents[entitySet].push(newDoc)
    return doc
  },

  update (entitySet, q, u, opts = {}) {
    const documents = getDocuments(this.documents[entitySet], opts)
    const toUpdate = mingo.find(documents, q).all()

    if (toUpdate.length === 0 && opts.upsert) {
      this.insert(entitySet, u.$set, opts)
    } else {
      toUpdate.forEach((d) => {
        if (opts.transaction) {
          d.$transaction = d.$transaction || { active: {} }
          d.$transaction.active[opts.transaction.id] = d.$transaction.active[opts.transaction.id] || {}
          d.$transaction.active[opts.transaction.id].updatedDoc = omit(extend(true, {}, d, u.$set), '$transaction')
          d.$transaction.active[opts.transaction.id].state = 'update'
        } else {
          Object.assign(d, u.$set || {})
        }
      })
    }

    return opts.upsert ? toUpdate.length || 1 : toUpdate.length
  },

  remove (entitySet, q, opts = {}) {
    const documents = getDocuments(this.documents[entitySet], opts)
    const toRemove = mingo.find(documents, q).all()

    if (opts.transaction) {
      toRemove.forEach((d) => {
        d.$transaction = d.$transaction || { active: {} }
        d.$transaction.active[opts.transaction.id] = d.$transaction.active[opts.transaction.id] || {}
        d.$transaction.active[opts.transaction.id].state = 'remove'
      })
    } else {
      this.documents[entitySet] = this.documents[entitySet].filter(d => !toRemove.includes(d))
    }
  },

  drop (opts = {}) {
    for (let [entitySetName, documents] of Object.entries(this.documents)) {
      if (opts.transaction) {
        documents.forEach((d) => {
          d.$transaction = d.$transaction || { active: {} }
          d.$transaction.active[opts.transaction.id] = d.$transaction.active[opts.transaction.id] || {}
          d.$transaction.active[opts.transaction.id].state = 'remove'
        })
      } else {
        this.documents[entitySetName] = []
      }
    }
  }
})

function getDocuments (documents, opts) {
  return documents.filter((d) => {
    if (d.$transaction == null) {
      return true
    }

    if (opts.transaction && d.$transaction.active[opts.transaction.id]) {
      const $currentTran = d.$transaction.active[opts.transaction.id]
      return $currentTran.state !== 'remove'
    } else {
      return d.$transaction.ownerId == null
    }
  })
}
