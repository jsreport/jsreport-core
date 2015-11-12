/*globals describe, it, beforeEach, afterEach */

var path = require("path"),
    bootstrapper = require("../lib/bootstrapper.js");

describe('bootstrapper', function () {

    it('should not fail', function (done) {
        this.timeout(5000);
        bootstrapper({
            connectionString: { name: "neDB", inMemory: true},
            rootDirectory: path.join(__dirname, "../"),
            blobStorage: "fileSystem",
            extensions: ["mongodb-store", "templates"]
        }).start().then(function() {
            done();
        }).catch(done);
    });
});
