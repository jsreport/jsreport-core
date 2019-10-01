const crypto = require('crypto')

module.exports = (reporter) => {
  const DEFAULT_ENCRYPTION = 'aes-128-gcm'
  const DEFAULT_IV_LENGTH = 16 // For AES, this is always 16

  function getEncryptionOpts (opts) {
    let secret = opts.secret
    let encryption = opts.encryption
    let ivLength = opts.ivLength

    if (!secret && reporter.options.encryption) {
      secret = reporter.options.encryption.secretKey
    }

    if (!encryption) {
      encryption = DEFAULT_ENCRYPTION
    }

    if (!ivLength) {
      ivLength = DEFAULT_IV_LENGTH
    }

    return {
      secret,
      encryption,
      ivLength
    }
  }

  async function encrypt (text, opts = {}) {
    const { secret, encryption, ivLength } = getEncryptionOpts(opts)

    if (!secret) {
      throw reporter.createError('using reporter.encryption.encrypt requires to specify a secret, make sure to pass one or to define the "options.encryption.secretKey" option in config', {
        statusCode: 400,
        encryptionNoSecret: true
      })
    }

    let iv = crypto.randomBytes(ivLength)
    let cipher = crypto.createCipheriv(encryption, Buffer.from(secret), iv)
    let encrypted = cipher.update(text)

    encrypted = Buffer.concat([encrypted, cipher.final()])

    let authTag = cipher.getAuthTag()

    return `${authTag.toString('hex')}:${iv.toString('hex')}:${encrypted.toString('hex')}`
  }

  async function decrypt (text, opts = {}) {
    const { secret, encryption } = getEncryptionOpts(opts)

    if (!secret) {
      throw reporter.createError('using reporter.encryption.decrypt requires to specify a secret, make sure to pass one or to define the "options.encryption.secretKey" option in config', {
        statusCode: 400,
        encryptionNoSecret: true
      })
    }

    try {
      let textParts = text.split(':')
      let authTag = Buffer.from(textParts.shift(), 'hex')
      let iv = Buffer.from(textParts.shift(), 'hex')
      let encryptedText = Buffer.from(textParts.join(':'), 'hex')
      let decipher = crypto.createDecipheriv(encryption, Buffer.from(secret), iv)

      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(encryptedText)

      decrypted = Buffer.concat([decrypted, decipher.final()])

      return decrypted.toString()
    } catch (e) {
      throw reporter.createError(`reporter.encryption.decrypt failed, make sure "options.encryption.secretKey" was not changed and you are using the same key which was used to encrypt content. ${e.message}`, {
        statusCode: 400,
        encryptionDecryptFail: true
      })
    }
  }

  return { encrypt, decrypt }
}
