
module.exports = function (rootSchema, schema) {
  const schemasToApply = Array.isArray(schema) ? schema : [schema]

  schemasToApply.forEach((sch) => {
    if (sch == null) {
      return
    }

    Object.keys(sch).forEach((key) => {
      const current = sch[key]

      rootSchema.properties = rootSchema.properties || {}

      if (key === 'extensions') {
        rootSchema.properties.extensions = rootSchema.properties.extensions || {
          type: 'object',
          properties: {}
        }

        Object.keys(current).forEach(s => {
          rootSchema.properties.extensions.properties[s] = current[s]

          if (rootSchema.properties.extensions.properties[s].properties) {
            rootSchema.properties.extensions.properties[s].properties.enabled = { type: 'boolean' }
          }
        })
      } else {
        rootSchema.properties[key] = current
      }
    })
  })

  return rootSchema
}
