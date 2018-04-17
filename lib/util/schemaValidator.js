
const Ajv = require('ajv')

const validatorCollection = new WeakMap()

class SchemaValidator {
  constructor (_options = {}) {
    const options = Object.assign({
      rootSchema: null
    }, _options)

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

    let rootValidate

    if (options.rootSchema != null) {
      rootValidate = validator.compile(addDefaultsAndValidateRootSchema(
        validator,
        options.rootSchema,
        this.schemaVersion
      ))

      this.setRootSchema = (schema) => {
        rootValidate = validator.compile(addDefaultsAndValidateRootSchema(
          validator,
          schema,
          this.schemaVersion
        ))
      }

      this.getRootSchema = () => rootValidate && rootValidate.schema

      this.validateRoot = (data) => {
        return runSchemaValidation(validator, rootValidate, data)
      }
    }

    validatorCollection.set(this, validator)
  }

  addSchema (name, _schema) {
    const validator = validatorCollection.get(this)
    let schema = _schema

    if (typeof schema === 'object' && !Array.isArray(schema) && schema.$schema == null) {
      schema = Object.assign({}, schema, { $schema: this.schemaVersion })
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

    return runSchemaValidation(validator, schemaValidate, data)
  }

  getSchema (name) {
    const validator = validatorCollection.get(this)
    const schemaValidate = validator.getSchema(name)
    return schemaValidate ? schemaValidate.schema : undefined
  }
}

function addDefaultsAndValidateRootSchema (validator, _rootSchema, schemaVersion) {
  let rootSchema = _rootSchema

  if (
    typeof schema === 'object' &&
    !Array.isArray(rootSchema) &&
    rootSchema.$schema == null
  ) {
    rootSchema = Object.assign({}, rootSchema, { $schema: schemaVersion })
  }

  const schemaValid = validator.validateSchema(rootSchema)

  if (!schemaValid) {
    throw new Error(`root schema is not valid. errors: ${
      validator.errorsText(validator.errors, { dataVar: 'rootSchema' })
    }`)
  }

  return rootSchema
}

function runSchemaValidation (validator, schemaValidate, data) {
  const valid = schemaValidate(data)
  const result = { valid }

  if (!valid) {
    result.errors = schemaValidate.errors

    result.fullErrorMessage = `schema validation errors: ${
      validator.errorsText(result.errors, { dataVar: 'options' })
    }`
  }

  return result
}

module.exports = SchemaValidator
