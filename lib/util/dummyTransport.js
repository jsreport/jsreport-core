const Transport = require('winston-transport')

module.exports = class DummyTransport extends Transport {
  constructor (...args) {
    super(args)
  }

  log (level, msg, meta, callback) {
  }
}
