
// we use deepmerge instead of node.extend here because it supports
// concatenating arrays instead of replacing them, something necessary
// to support extending some values in schemas like the "enum"
const deepMerge = require('deepmerge')

module.exports = function (rootSchema, schema) {
  const schemasToApply = Array.isArray(schema) ? schema : [schema]

  rootSchema.properties = rootSchema.properties || {}

  rootSchema.properties.extensions = rootSchema.properties.extensions || {
    type: 'object',
    properties: {}
  }

  schemasToApply.forEach((sch) => {
    if (sch == null) {
      return
    }

    if (sch.schema == null && sch.name != null) {
      rootSchema.properties.extensions.properties[sch.name] = {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' }
        }
      }
      return
    } else if (sch.schema == null) {
      return
    }

    Object.keys(sch.schema).forEach((key) => {
      const current = sch.schema[key]

      if (key === 'extensions') {
        if (current == null) {
          return
        }

        Object.keys(current).forEach(s => {
          rootSchema.properties.extensions.properties[s] = deepMerge(rootSchema.properties.extensions.properties[s] || {}, current[s])

          if (
            rootSchema.properties.extensions.properties[s].properties &&
            rootSchema.properties.extensions.properties[s].properties.enabled == null
          ) {
            rootSchema.properties.extensions.properties[s].properties.enabled = { type: 'boolean' }
          }
        })
      } else if (current != null) {
        rootSchema.properties[key] = deepMerge(rootSchema.properties[key] || {}, current)
      }
    })
  })

  return rootSchema
}
