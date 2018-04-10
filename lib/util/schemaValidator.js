
const Ajv = require('ajv')

const validatorCollection = new WeakMap()

class SchemaValidator {
  constructor () {
    this.schemaVersion = 'http://json-schema.org/draft-07/schema#'

    const validator = new Ajv({
      useDefaults: true,
      coerceTypes: true,
      format: 'full'
    })

    validator.addKeyword('$jsreport-acceptsBuffer', {
      compile: (sch) => {
        if (sch !== true) {
          return () => typeof data === 'string'
        }

        return (data) => {
          return Buffer.isBuffer(data)
        }
      }
    })

    validatorCollection.set(this, validator)
  }

  addSchema (name, _schema) {
    const validator = validatorCollection.get(this)
    const schema = _schema

    if (typeof schema === 'object' && !Array.isArray(_schema) && _schema.$schema == null) {
      Object.assign(schema, { $schema: this.schemaVersion })
    }

    validator.addSchema(schema, name)
  }

  // after validate, data will be coerced (modified) with value types
  // that match the schema
  validate (name, data) {
    const validator = validatorCollection.get(this)
    const schemaValidate = validator.getSchema(name)

    if (schemaValidate == null) {
      throw new Error(`schema ${name} is not registered in validator`)
    }

    const valid = schemaValidate(data)
    const result = { valid }

    if (!valid) {
      result.errors = schemaValidate.errors

      result.fullErrorMessage = `schema validation errors: ${
        result.errors.map((err) => {
          return `property: ${err.dataPath === '' ? '.' : err.dataPath} - error: ${err.message}`
        }).join(', ')
      }`
    }

    return result
  }

  getSchema (name) {
    const validator = validatorCollection.get(this)
    const schemaValidate = validator.getSchema(name)
    return schemaValidate ? schemaValidate.schema : undefined
  }
}

module.exports = SchemaValidator
