const should = require('should')
const jsreport = require('../../')

const SECRET_KEY = 'demo123456789278'

function init (options) {
  const reporter = jsreport({ templatingEngines: { strategy: 'in-process' }, migrateEntitySetsToFolders: false, ...options })

  reporter.use({
    name: 'templates',
    main: function (reporter, definition) {
      Object.assign(reporter.documentStore.model.entityTypes.TemplateType, {
        name: { type: 'Edm.String', publicKey: true }
      })

      reporter.documentStore.registerEntitySet('templates', {
        entityType: 'jsreport.TemplateType',
        splitIntoDirectories: true
      })
    }
  })

  return reporter.init()
}

describe('encryption', () => {
  let reporter

  afterEach(() => reporter && reporter.close())

  it('encrypt should throw error when no encryption.secretKey defined', async () => {
    reporter = await init()

    should(reporter.encryption.encrypt('foo')).be.rejectedWith(/requires to specify a secret/)
  })

  it('encrypt should work', async () => {
    reporter = await init({
      encryption: {
        secretKey: SECRET_KEY
      }
    })

    const encrypted = await reporter.encryption.encrypt('foo')

    should(encrypted).containEql(':')
    should(encrypted.split(':')).have.length(3)
  })

  it('should throw error when no encryption.secretKey defined', async () => {
    reporter = await init()

    const encrypted = '2be9f167c51140a237fe1e9d95a94e1c:13202f53a67b13ae784b05aa47eb858c:14f86a'

    should(reporter.encryption.decrypt(encrypted)).be.rejectedWith(/requires to specify a secret/)
  })

  it('decrypt should fail with wrong encryption.secretKey', async () => {
    reporter = await init({
      encryption: {
        secretKey: 'foo0123456789278'
      }
    })

    const encrypted = '2be9f167c51140a237fe1e9d95a94e1c:13202f53a67b13ae784b05aa47eb858c:14f86a'

    should(reporter.encryption.decrypt(encrypted)).be.rejectedWith(/Unsupported state or unable to authenticate data/)
  })

  it('decrypt should work', async () => {
    reporter = await init({
      encryption: {
        secretKey: SECRET_KEY
      }
    })

    const encrypted = '2be9f167c51140a237fe1e9d95a94e1c:13202f53a67b13ae784b05aa47eb858c:14f86a'
    const value = await reporter.encryption.decrypt(encrypted)

    should(value).be.eql('foo')
  })

  it('encrypt and decrypt should work', async () => {
    reporter = await init({
      encryption: {
        secretKey: SECRET_KEY
      }
    })

    const string = 'foo'
    const encrypted = await reporter.encryption.encrypt(string)
    const value = await reporter.encryption.decrypt(encrypted)

    should(value).be.eql(string)
  })
})
