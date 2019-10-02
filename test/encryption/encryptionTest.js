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

  it('encrypt should do nothing when encryption.enabled=false', async () => {
    reporter = await init({
      encryption: {
        enabled: false
      }
    })

    const encrypted = await reporter.encryption.encrypt('foo')

    should(encrypted).be.eql('foo')
  })

  it('decrypt should throw error when no encryption.secretKey defined', async () => {
    reporter = await init()

    const encrypted = 'jrEncrypt$a873e1cfdc214a15d6657a5b54a2e363:6de02b2c66080ad03d39166b1045f5eb:093fc9'

    should(reporter.encryption.decrypt(encrypted)).be.rejectedWith(/requires to specify a secret/)
  })

  it('decrypt should fail with wrong encryption.secretKey', async () => {
    reporter = await init({
      encryption: {
        secretKey: 'foo0123456789278'
      }
    })

    const encrypted = 'jrEncrypt$a873e1cfdc214a15d6657a5b54a2e363:6de02b2c66080ad03d39166b1045f5eb:093fc9'

    should(reporter.encryption.decrypt(encrypted)).be.rejectedWith(/Unsupported state or unable to authenticate data/)
  })

  it('decrypt should work', async () => {
    reporter = await init({
      encryption: {
        secretKey: SECRET_KEY
      }
    })

    const encrypted = 'jrEncrypt$a873e1cfdc214a15d6657a5b54a2e363:6de02b2c66080ad03d39166b1045f5eb:093fc9'
    const value = await reporter.encryption.decrypt(encrypted)

    should(value).be.eql('foo')
  })

  it('decrypt should do nothing when text is not encrypted', async () => {
    reporter = await init({
      encryption: {
        secretKey: SECRET_KEY
      }
    })

    const encrypted = await reporter.encryption.decrypt('foo')

    should(encrypted).be.eql('foo')
  })

  it('decrypt should throw when text is encrypted and encryption.enabled=false', async () => {
    reporter = await init({
      encryption: {
        enabled: false
      }
    })

    const encrypted = 'jrEncrypt$a873e1cfdc214a15d6657a5b54a2e363:6de02b2c66080ad03d39166b1045f5eb:093fc9'

    should(reporter.encryption.decrypt(encrypted)).be.rejectedWith(/restore encrypted value requires to enable encryption/)
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
