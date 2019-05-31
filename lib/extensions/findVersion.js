const util = require('util')
const path = require('path')
const fs = require('fs')

const readFileAsync = util.promisify(fs.readFile)

module.exports = async (extension) => {
  const result = {
    source: 'anonymous'
  }

  if (extension.version != null || extension.source != null) {
    result.source = extension.source
    result.version = extension.version

    return result
  }

  if (extension.name == null) {
    return result
  }

  if (extension.directory == null) {
    result.source = 'local'
    result.version = `local:inline`
    return result
  }

  try {
    const packageJsonContent = await readFileAsync(path.join(extension.directory, 'package.json'))
    const packageJson = JSON.parse(packageJsonContent.toString())

    if (packageJson._requested && packageJson._requested.type === 'git') {
      result.source = 'git'
      result.version = packageJson._resolved
    } else if (packageJson._requested && packageJson.version != null) {
      result.source = 'npm'
      result.version = packageJson.version
    } else if (packageJson.version != null) {
      result.source = 'local'
      result.version = `local:${extension.directory}:${packageJson.version}`
    } else {
      result.source = 'local'
      result.version = `local:${extension.directory}`
    }
  } catch (e) {
    result.source = 'local'
    result.version = `local:${extension.directory}`
  }

  return result
}
