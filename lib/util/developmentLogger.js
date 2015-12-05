if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dummyLogger')
} else {
  module.exports = require('./consoleLogger')
}
