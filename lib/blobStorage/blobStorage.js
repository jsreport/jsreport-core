module.exports = (options) => {
  let provider
  return {
    read (...args) {
      return provider.read(...args)
    },

    write (...args) {
      return provider.write(...args)
    },

    async remove (...args) {
      return provider.remove(...args)
    },

    async init () {
      return provider.init()
    },

    registerProvider (p) {
      provider = p
    }
  }
}
