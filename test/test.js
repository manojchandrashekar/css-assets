var assert = require('assert');
var path = require('path');
var fs = require('fs');
var cssAssets = require('../');

var cssDir = path.join(__dirname, 'data/output');
var inputDir = path.join(__dirname, 'data/input');

var vendorDir = path.join(__dirname, 'data/output/assets');

var files = fs.readdirSync(inputDir).filter(function(file) {
    return /[.]css$/.test(file);
});

var test = function (file, fileIndex, callback) {
    describe('Testing File ' + fileIndex, function() {
        describe(file + '', function() {
            it('process the CSS file and it\'s assets', function() {
                var cssFile = path.join(inputDir, file);
                var actual = cssAssets(cssFile, cssDir, vendorDir);

                var expected = 4;
                assert.equal(actual, expected);
            });
        });
    });
};

files.forEach(function(file) {
    var fileIndex = 1;

    test(file, fileIndex, function() {
        fileIndex++;
    });
});