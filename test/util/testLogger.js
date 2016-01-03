var TestLogger = module.exports = function () {

}

TestLogger.prototype.info = function (m) {
  console.log(m)
}

TestLogger.prototype.warn = function (m) {
  console.log(m)
}

TestLogger.prototype.error = function (m) {
  console.log(m)
}

TestLogger.prototype.debug = function (m) {
  console.log(m)
}
