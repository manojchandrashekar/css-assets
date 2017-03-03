/**
 * NodeJS dependencies
 */
var fs = require('fs');
var fse = require('fs-extra');
var path = require('path');
var regexEscape = require('regex-escape');

/**
 * Vendor dependencies
 */
var resolve = require('resolve');
var cssp = require('cssp');
var traverse = require('traverse');

/**
 * Mark file recursively for @import statements
 * @param  {String}  file    Absolute path to .css file
 * @param  {Array}   imports Array of files marked (used for recursion)
 * @param  {Boolean} isEntry 'true' if this is the entry CSS file, else 'false'
 * @return
 */
function mapImports(file, imports, isEntry) {
    var src = undefined;
    var tree = undefined;
    var base = path.dirname(file);

    if (path.parse(file).ext === '.css' && fs.existsSync(file)) {
        try {
            src = fs.readFileSync(file, 'utf8');
            tree = cssp.parse(src);
        } catch (e) {
            //TODO: handle error
        }
    } else {
        //TODO: handle error
    }

    if (isEntry) {
        imports.push(file);
    }

    traverse(tree).forEach(function(node) {
        var self = this;
        if (node !== 'atrules') {
            return;
        }

        node = this.parent.node;

        // ignore non import
        if (node[1][0] !== 'atkeyword' && node[1][1][0] !== 'ident' &&
            node[1][1][1] !== 'import') {
            return;
        }

        // ignore non string imports
        if (node[3][0] !== 'string') {
            return;
        }

        // remove quotes from imported name
        var name = node[3][1].replace(/["']/g, '');
        var cssFilePath = path.resolve(base, name);
        if (path.parse(cssFilePath).ext === '.css' && fs.existsSync(cssFilePath)) {
            if (imports.indexOf(cssFilePath) <= -1) {
                imports.push(cssFilePath);
                // recursively mark all imported css files for processing
                mapImports(cssFilePath, imports, false);
            }
        }
    });

    return imports;
};

function processImports(imports, cssDir, vendorDir) {
    var fullSrc = '';
    var processCount = 0;
    imports.forEach(function(file) {
        var src = fs.readFileSync(file, 'utf8');
        var base = path.dirname(file);
        var tree = cssp.parse(src);
        var relativePath = path.relative(cssDir, file);

        traverse(tree).forEach(function(node) {
            var self = this;

            // Remove @import statements.
            if (node === 'atrules') {
                var node = this.parent.node;
                if (node[1][0] === 'atkeyword' && node[1][1][0] === 'ident' &&
                    node[1][1][1] === 'import') {
                    if (node[3][0] === 'string') {
                        self.parent.node.splice(0, self.parent.node.length);
                    }
                }
            }

            // Process resource references
            if (node === 'uri') {
                var uriNode = this.parent.node;
                var uriFile = uriNode[1][1].replace(/["']/g, '');

                // Ignore URLs.
                if (uriFile.indexOf(':') <= -1 || uriFile.substr(0, 2) === '//') {

                    // Convert directory based URIs ('images/hello.png' => './images/hello.png')
                    if (uriFile.substr(0, 3) !== '../' || uriFile.substr(0, 2) !== './') {
                        uriFile = './' + uriFile;
                    }

                    // Leave absolute paths alone.
                    if (!path.isAbsolute(uriFile)) {
                        var copyFrom = path.resolve(base, uriFile);

                        // Check if the resource actually exists.
                        if (fs.existsSync(copyFrom)) {
                            var flatUriPath = uriFile.replace(new RegExp(regexEscape('../'), 'g'), '').replace(new RegExp(regexEscape('./'), 'g'), '');

                            var copyTo = path.resolve(vendorDir, flatUriPath);
                            fse.copySync(copyFrom, copyTo);

                            var relativeUriPath = path.relative(cssDir, vendorDir) + '/' + flatUriPath;
                            self.parent.node[1][1] = '"' + relativeUriPath + '"';
                        } else {
                            console.warn("!!WARN!! [css-assets]: A referenced resource was not found! ['" + uriFile + "' in " + file + "]");
                        }
                    }
                }
            }
        });
        fullSrc = fullSrc + '\n/* css-assets: "' + relativePath + '" */\n' + cssp.translate(tree).trim() + '\n';
        processCount++;
    });

    fse.outputFileSync(cssDir + '/vendor.css', fullSrc);
    return processCount;
}

function removeImportNode(node) {
    node.splice(0, node.length);
}

// file should be /full/path/to/file.css
module.exports = function(file, cssDir, vendorDir) {
    var cssImports = mapImports(file, [], true);
    return processImports(cssImports, cssDir, vendorDir);
};