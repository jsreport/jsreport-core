/*!
 * Copyright(c) 2016 Jan Blaha
 *
 * Recipe running no document transformations. Just adds html response headers
 */

module.exports = function (req, res) {
  res.headers['Content-Type'] = 'text/html'
  res.headers['File-Extension'] = 'html'
  res.headers['Content-Disposition'] = 'inline; filename="report.html"'
}
