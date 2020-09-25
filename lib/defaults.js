
const os = require('os')
const path = require('path')

exports.getDefaultTaskStrategy = () => {
  return 'worker-threads'
}

exports.getDefaultTempDirectory = () => {
  return path.join(os.tmpdir(), 'jsreport')
}

exports.getDefaultRootDirectory = () => {
  return path.join(__dirname, '../../../')
}

exports.getDefaultMode = () => {
  return process.env.JSREPORT_ENV || process.env.NODE_ENV || 'development'
}

exports.getDefaultLoadConfig = () => {
  return false
}
