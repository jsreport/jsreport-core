/*globals describe, it, beforeEach, afterEach */

var assert = require("assert");
var bootstrapper = require("../lib/bootstrapper.js");

describe('reporter', function () {
  var reporter;

  beforeEach(function(done) {
    bootstrapper({ rootDirectory: __dirname }).start().then(function(o) {
      reporter = o.reporter;
      done();
    }).fail(done);
  });

  it('should render html', function (done) {
    reporter.render({template: {content: "Hey", engine: "none", recipe: "html"}}).then(function (resp) {
      assert.equal("Hey", resp.content.toString());
      done();
    }).catch(done);
  });

  it('should call before render and after render listeners', function (done) {

    var listenersCall = [];
    reporter.beforeRenderListeners.add("test", this, function () {
      listenersCall.push("before");
    });

    reporter.afterRenderListeners.add("test", this, function () {
      listenersCall.push("after");
    });

    reporter.render({template: {content: "Hey", engine: "none", recipe: "html"}}).then(function (resp) {
      assert.equal(listenersCall[0], "before");
      assert.equal(listenersCall[1], "after");
      done();
    }).catch(done);
  });
});
