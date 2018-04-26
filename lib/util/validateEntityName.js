/* eslint-disable no-control-regex, no-useless-escape */

const invalidFileNameCharacters = [
  '<',
  '>',
  ':',
  '"',
  { character: '/', escaped: '\\/' },
  { character: '\\', escaped: '\\\\' },
  '|',
  '?',
  '*'
]

function getInvalidFileNameCharactersRegExp () {
  // original regexp taken from https://github.com/sindresorhus/filename-reserved-regex
  return new RegExp(`[${
    invalidFileNameCharacters.map(c => typeof c === 'string' ? c : c.escaped).join('')
  }\\x00-\\x1F]`, 'g')
}

module.exports = (name) => {
  if (name == null || (typeof name === 'string' && name.trim() === '')) {
    throw new Error('Entity name can not be empty')
  }

  if (typeof name !== 'string') {
    throw new Error('Entity name must be a string')
  }

  const containsInvalid = getInvalidFileNameCharactersRegExp().test(name)

  if (containsInvalid) {
    const msg = `Entity name can not contain characters ${
      invalidFileNameCharacters.map(c => typeof c === 'string' ? c : c.character).join(', ')
    } and non-printable characters. name used: ${name}`

    throw new Error(msg)
  }

  return true
}
