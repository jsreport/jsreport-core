if (process.NODE_ENV === 'production') {
  module.exports = require('./dummyLogger')
}

module.exports = require('./consoleLogger')
